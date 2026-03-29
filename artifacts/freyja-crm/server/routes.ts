import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, db, pool } from "./storage";
import { updateBrokerSchema, insertOutreachLogSchema, updateOutreachLogSchema, insertMessageTemplateSchema, updateMessageTemplateSchema, brokers, insertOutreachSequenceSchema, updateOutreachSequenceSchema, insertOutreachSequenceStepSchema, insertOutreachEnrollmentSchema, outreachSuppressions, outreachEnrollments } from "@shared/schema";
import type { Broker } from "@shared/schema";
import { requireAuth } from "./auth";
import fs from "fs";
import Papa from "papaparse";
import { eq, isNull, or, and, like, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import * as outreachService from "./outreach-service";

const genai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "dummy",
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

async function searchLinkedInProfile(broker: Broker): Promise<{
  linkedin_url: string | null;
  linkedin_headline: string | null;
  linkedin_location: string | null;
} | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;

  const namePart = `"${broker.full_name}"`;
  const contextPart = broker.office_name
    ? `"${broker.office_name}"`
    : broker.state
    ? broker.state
    : "real estate";
  const query = `site:linkedin.com/in/ ${namePart} ${contextPart}`;

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&memory=256`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: query,
          maxPagesPerQuery: 1,
          resultsPerPage: 5,
        }),
      }
    );

    if (!res.ok) return null;
    const items: any[] = await res.json();

    for (const item of items) {
      const organicResults: any[] = item.organicResults || [];
      for (const result of organicResults) {
        const url: string = result.url || "";
        if (url.includes("linkedin.com/in/")) {
          const title: string = result.title || "";
          const headline = title
            .replace(/ - LinkedIn$/, "")
            .replace(/ \| LinkedIn$/, "")
            .trim();
          return {
            linkedin_url: url.split("?")[0],
            linkedin_headline: headline || null,
            linkedin_location: null,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildBrokerContext(broker: Broker): string {
  const location = [broker.city, broker.state].filter(Boolean).join(", ");
  const activity = [
    broker.for_sale_count ? `${broker.for_sale_count} active listings` : null,
    broker.recently_sold_count ? `${broker.recently_sold_count} recent sales` : null,
    broker.average_price ? `avg price ${broker.average_price}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `Name: ${broker.full_name}`,
    `Company: ${broker.office_name || "their brokerage"}`,
    `Title: ${broker.job_title || "Real Estate Broker"}`,
    `Location: ${location || "Unknown"}`,
    `Specialties: ${broker.specialties || "real estate"}`,
    `Experience: ${broker.experience_years ? broker.experience_years + " years" : "unknown"}`,
    activity ? `Activity: ${activity}` : null,
    broker.linkedin_headline ? `LinkedIn headline: ${broker.linkedin_headline}` : null,
  ]
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join("\n");
}

function parseJsonResponse(text: string): any {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse JSON from response: ${cleaned.slice(0, 200)}`);
  }
}

async function generateEmail(broker: Broker): Promise<{ email_subject: string; email_body: string }> {
  const prompt = `You are an expert sales rep for a business financing company that helps real estate professionals grow their business.

Broker details:
${buildBrokerContext(broker)}

Write a personalized cold email:
- Professional, conversational, brief (3 short paragraphs max)
- Reference their specific market/activity/specialties
- Offer business funding/capital that helps them close more deals, grow their team, or expand listings
- Do NOT use "I hope this email finds you well" or similar filler

Respond ONLY with valid JSON (no markdown):
{"email_subject": "...", "email_body": "..."}`;

  const response = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 8192, responseMimeType: "application/json" },
  });
  return parseJsonResponse(response.text ?? "{}");
}

async function generateLinkedInMessage(broker: Broker): Promise<{ linkedin_message: string }> {
  const prompt = `You are an expert sales rep for a business financing company that helps real estate professionals grow.

Broker details:
${buildBrokerContext(broker)}

Write a LinkedIn connection request message:
- Friendly and personal, NOT salesy
- Keep it under 280 characters total
- Mention something specific about their work or market
- End with a soft reason to connect (no hard pitch)

Respond ONLY with valid JSON (no markdown):
{"linkedin_message": "..."}`;

  const response = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 8192, responseMimeType: "application/json" },
  });
  return parseJsonResponse(response.text ?? "{}");
}

async function generateOutreachMessages(broker: Broker): Promise<{
  email_subject: string;
  email_body: string;
  linkedin_message: string;
}> {
  const [email, linkedin] = await Promise.all([
    generateEmail(broker),
    generateLinkedInMessage(broker),
  ]);
  return { ...email, ...linkedin };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/admin/bulk-csv", async (req, res) => {
    const secret = req.headers["x-migrate-secret"];
    if (secret !== (process.env.MIGRATE_SECRET || "freyja-migrate-2026")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      const csvData = req.body as string;
      if (!csvData || csvData.length === 0) {
        return res.status(400).json({ error: "No CSV data" });
      }

      const client = await pool.connect();
      try {
        const copyStream = await import("pg-copy-streams");
        const cols = "full_name,first_name,last_name,email,email_secondary,phone,mobile,fax,office_name,job_title,address,city,state,zip_code,license_number,website,profile_url,photo_url,experience_years,description,languages,specialties,for_sale_count,recently_sold_count,average_price,social_media,source_file,source_type,outreach_status,assigned_to,notes,last_contacted_at,created_at,linkedin_url,linkedin_headline,linkedin_location,linkedin_connections,linkedin_email_found,linkedin_enriched_at,outreach_email_subject,outreach_email_body,outreach_linkedin_message,outreach_generated_at";
        const stream = client.query(copyStream.from(`COPY brokers(${cols}) FROM STDIN WITH CSV`));
        
        await new Promise<void>((resolve, reject) => {
          stream.on("finish", resolve);
          stream.on("error", reject);
          stream.write(csvData);
          stream.end();
        });

        const countResult = await client.query("SELECT COUNT(*) FROM brokers");
        res.json({ success: true, total: parseInt(countResult.rows[0].count) });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Protect all /api routes — login/logout/me are registered before this in index.ts
  app.use("/api", requireAuth);

  app.get("/api/filter-options", async (_req, res) => {
    try {
      const options = await storage.getFilterOptions();
      res.json(options);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/filter-presets", async (_req, res) => {
    try {
      const presets = await storage.getFilterPresets("admin");
      res.json(presets);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/filter-presets", async (req, res) => {
    try {
      const { name, filters } = req.body;
      if (!name || !filters) {
        return res.status(400).json({ error: "name and filters are required" });
      }
      const preset = await storage.createFilterPreset("admin", name, filters);
      res.json(preset);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/filter-presets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteFilterPreset(id, "admin");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/brokers", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const search = (req.query.search as string) || undefined;
      const state = (req.query.state as string) || undefined;
      const states = req.query.states ? (req.query.states as string).split(",").filter(Boolean) : undefined;
      const status = (req.query.status as string) || undefined;
      const assigned_to = (req.query.assigned_to as string) || undefined;
      const sort_by = (req.query.sort_by as string) || undefined;
      const sort_order = (req.query.sort_order as string) || undefined;

      const dealsClosedMin = req.query.dealsClosedMin ? parseInt(req.query.dealsClosedMin as string) : undefined;
      const dealsClosedMax = req.query.dealsClosedMax ? parseInt(req.query.dealsClosedMax as string) : undefined;
      const avgPriceMin = req.query.avgPriceMin ? parseFloat(req.query.avgPriceMin as string) : undefined;
      const avgPriceMax = req.query.avgPriceMax ? parseFloat(req.query.avgPriceMax as string) : undefined;
      const experienceMin = req.query.experienceMin ? parseInt(req.query.experienceMin as string) : undefined;
      const experienceMax = req.query.experienceMax ? parseInt(req.query.experienceMax as string) : undefined;
      const specialties = req.query.specialties ? (req.query.specialties as string).split(",").filter(Boolean) : undefined;
      const brokerage = (req.query.brokerage as string) || undefined;
      const city = (req.query.city as string) || undefined;
      const sourceType = (req.query.sourceType as string) || undefined;
      const hasEmail = req.query.hasEmail === "true" ? true : undefined;
      const hasPhone = req.query.hasPhone === "true" ? true : undefined;
      const hasLinkedin = req.query.hasLinkedin === "true" ? true : undefined;

      const result = await storage.getBrokers({
        page, limit, search, state, states, status, assigned_to, sort_by, sort_order,
        dealsClosedMin, dealsClosedMax, avgPriceMin, avgPriceMax,
        experienceMin, experienceMax, specialties, brokerage, city,
        sourceType, hasEmail, hasPhone, hasLinkedin,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/brokers/export", async (req, res) => {
    try {
      const search = (req.query.search as string) || undefined;
      const state = (req.query.state as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const assigned_to = (req.query.assigned_to as string) || undefined;
      const dealsClosedMin = req.query.dealsClosedMin ? parseInt(req.query.dealsClosedMin as string) : undefined;
      const dealsClosedMax = req.query.dealsClosedMax ? parseInt(req.query.dealsClosedMax as string) : undefined;
      const avgPriceMin = req.query.avgPriceMin ? parseFloat(req.query.avgPriceMin as string) : undefined;
      const avgPriceMax = req.query.avgPriceMax ? parseFloat(req.query.avgPriceMax as string) : undefined;
      const experienceMin = req.query.experienceMin ? parseInt(req.query.experienceMin as string) : undefined;
      const experienceMax = req.query.experienceMax ? parseInt(req.query.experienceMax as string) : undefined;
      const specialties = req.query.specialties ? (req.query.specialties as string).split(",").filter(Boolean) : undefined;
      const brokerage = (req.query.brokerage as string) || undefined;
      const city = (req.query.city as string) || undefined;
      const sourceType = (req.query.sourceType as string) || undefined;
      const hasEmail = req.query.hasEmail === "true" ? true : undefined;
      const hasPhone = req.query.hasPhone === "true" ? true : undefined;
      const hasLinkedin = req.query.hasLinkedin === "true" ? true : undefined;

      const result = await storage.getBrokers({
        page: 1, limit: 100000,
        search, state, status, assigned_to,
        dealsClosedMin, dealsClosedMax, avgPriceMin, avgPriceMax,
        experienceMin, experienceMax, specialties, brokerage, city,
        sourceType, hasEmail, hasPhone, hasLinkedin,
      });

      const csv = Papa.unparse(result.brokers);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=brokers_export.csv");
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/brokers/:id — single broker detail
  app.get("/api/brokers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid broker ID" });
        return;
      }
      const broker = await storage.getBroker(id);
      if (!broker) {
        res.status(404).json({ error: "Broker not found" });
        return;
      }
      res.json(broker);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/brokers/:id — update outreach fields
  app.patch("/api/brokers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid broker ID" });
        return;
      }

      const parsed = updateBrokerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }

      const updated = await storage.updateBroker(id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: "Broker not found" });
        return;
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/brokers/:id/enrich-linkedin — find LinkedIn profile via Apify
  app.post("/api/brokers/:id/enrich-linkedin", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid broker ID" });
        return;
      }
      const broker = await storage.getBroker(id);
      if (!broker) {
        res.status(404).json({ error: "Broker not found" });
        return;
      }

      const result = await searchLinkedInProfile(broker);
      const now = new Date().toISOString();

      await db
        .update(brokers)
        .set({
          linkedin_url: result?.linkedin_url ?? null,
          linkedin_headline: result?.linkedin_headline ?? null,
          linkedin_location: result?.linkedin_location ?? null,
          linkedin_enriched_at: now,
        })
        .where(eq(brokers.id, id));

      const updated = await storage.getBroker(id);
      res.json({ found: !!result, broker: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/brokers/:id/generate-outreach — AI outreach drafts via Gemini
  // Body: { mode?: "email" | "linkedin" | "both" }  (defaults to "both")
  app.post("/api/brokers/:id/generate-outreach", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid broker ID" });
        return;
      }
      const broker = await storage.getBroker(id);
      if (!broker) {
        res.status(404).json({ error: "Broker not found" });
        return;
      }

      const mode: "email" | "linkedin" | "both" = req.body?.mode || "both";
      const now = new Date().toISOString();
      const fields: Record<string, string> = { outreach_generated_at: now };

      if (mode === "email" || mode === "both") {
        const result = await generateEmail(broker);
        fields.outreach_email_subject = result.email_subject;
        fields.outreach_email_body = result.email_body;
      }
      if (mode === "linkedin" || mode === "both") {
        const result = await generateLinkedInMessage(broker);
        fields.outreach_linkedin_message = result.linkedin_message;
      }

      await db.update(brokers).set(fields as any).where(eq(brokers.id, id));

      const updated = await storage.getBroker(id);
      res.json({ broker: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/outreach/batch — batch LinkedIn enrichment + AI outreach (SSE)
  app.post("/api/outreach/batch", async (req, res) => {
    const {
      limit: rawLimit = 20,
      state: stateFilter,
      status: statusFilter,
      search: searchFilter,
      mode = "both",
      skip_enriched = true,
    } = req.body;

    const batchLimit = Math.min(Math.max(1, parseInt(rawLimit) || 20), 100);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const conditions: any[] = [];
      if (stateFilter) conditions.push(eq(brokers.state, stateFilter));
      if (statusFilter) conditions.push(eq(brokers.outreach_status, statusFilter));
      if (searchFilter) {
        const pat = `%${searchFilter}%`;
        conditions.push(
          or(
            like(brokers.full_name, pat),
            like(brokers.email, pat),
            like(brokers.office_name, pat)
          )
        );
      }
      if (skip_enriched && (mode === "enrich" || mode === "both")) {
        conditions.push(isNull(brokers.linkedin_enriched_at));
      }
      if (skip_enriched && mode === "outreach") {
        conditions.push(isNull(brokers.outreach_generated_at));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const batch = await db
        .select()
        .from(brokers)
        .where(whereClause)
        .limit(batchLimit);

      send({ type: "start", total: batch.length });

      const CONCURRENT = 3;
      let processed = 0;
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < batch.length; i += CONCURRENT) {
        const chunk = batch.slice(i, i + CONCURRENT);
        await Promise.all(
          chunk.map(async (broker) => {
            try {
              let linkedinData: any = null;

              if (mode === "enrich" || mode === "both") {
                linkedinData = await searchLinkedInProfile(broker);
                await db
                  .update(brokers)
                  .set({
                    linkedin_url: linkedinData?.linkedin_url ?? null,
                    linkedin_headline: linkedinData?.linkedin_headline ?? null,
                    linkedin_location: linkedinData?.linkedin_location ?? null,
                    linkedin_enriched_at: new Date().toISOString(),
                  })
                  .where(eq(brokers.id, broker.id));
              }

              if (mode === "outreach" || mode === "both") {
                const enrichedBroker = { ...broker, ...(linkedinData || {}) };
                const outreach = await generateOutreachMessages(enrichedBroker);
                await db
                  .update(brokers)
                  .set({
                    outreach_email_subject: outreach.email_subject,
                    outreach_email_body: outreach.email_body,
                    outreach_linkedin_message: outreach.linkedin_message,
                    outreach_generated_at: new Date().toISOString(),
                  })
                  .where(eq(brokers.id, broker.id));
              }

              succeeded++;
              processed++;
              send({
                type: "progress",
                processed,
                total: batch.length,
                succeeded,
                failed,
                broker_name: broker.full_name,
                linkedin_found: !!(linkedinData?.linkedin_url),
              });
            } catch {
              failed++;
              processed++;
              send({
                type: "progress",
                processed,
                total: batch.length,
                succeeded,
                failed,
                broker_name: broker.full_name,
                error: true,
              });
            }
          })
        );
      }

      send({ type: "done", processed, succeeded, failed });
    } catch (err: any) {
      send({ type: "error", message: err.message });
    }

    res.end();
  });

  app.get("/api/ai-leads", async (req, res) => {
    try {
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 100));
      const result = await storage.getAiLeads(limit);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stats — dashboard statistics
  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/import — streaming CSV import from filesystem (handles 2M+ records)
  app.post("/api/import", async (req, res) => {
    const filePath = req.body.filePath || "/home/user/workspace/brokers_consolidated.csv";

    if (!fs.existsSync(filePath)) {
      res.status(400).json({ error: `File not found: ${filePath}` });
      return;
    }

    const readline = require("readline");

    function parseCSVLine(line: string): string[] {
      const fields: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            current += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ",") {
            fields.push(current);
            current = "";
          } else {
            current += ch;
          }
        }
      }
      fields.push(current);
      return fields;
    }

    await storage.clearBrokers();

    const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let headers: string[] | null = null;
    const headerMap: Record<string, number> = {};
    const allRecords: any[] = [];
    const now = new Date().toISOString();

    rl.on("line", (line: string) => {
      if (!headers) {
        headers = parseCSVLine(line);
        headers.forEach((h: string, i: number) => { headerMap[h.trim()] = i; });
        return;
      }
      if (line.trim() === "") return;

      const fields = parseCSVLine(line);
      const get = (col: string): string | null => {
        const idx = headerMap[col];
        if (idx === undefined) return null;
        const val = fields[idx]?.trim();
        return val && val !== "" ? val : null;
      };

      allRecords.push({
        full_name: get("full_name") || "Unknown",
        first_name: get("first_name"),
        last_name: get("last_name"),
        email: get("email"),
        email_secondary: get("email_secondary"),
        phone: get("phone"),
        mobile: get("mobile"),
        fax: get("fax"),
        office_name: get("office_name"),
        job_title: get("job_title"),
        address: get("address"),
        city: get("city"),
        state: get("state"),
        zip_code: get("zip_code"),
        license_number: get("license_number"),
        website: get("website"),
        profile_url: get("profile_url"),
        photo_url: get("photo_url"),
        experience_years: get("experience_years"),
        description: get("description"),
        languages: get("languages"),
        specialties: get("specialties"),
        for_sale_count: get("for_sale_count"),
        recently_sold_count: get("recently_sold_count"),
        average_price: get("average_price"),
        social_media: get("social_media"),
        source_file: get("source_file"),
        source_type: get("source_type"),
        outreach_status: "not_contacted",
        assigned_to: null,
        notes: null,
        last_contacted_at: null,
        created_at: now,
      });
    });

    rl.on("close", async () => {
      try {
        await storage.importBrokersBatch(allRecords);
        res.json({ success: true, imported: allRecords.length, total: allRecords.length });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    rl.on("error", (err: any) => {
      res.status(500).json({ error: err.message });
    });
  });

  // ── Outreach Log ──────────────────────────────────────────────────────────

  // GET /api/outreach-log — all outreach entries with broker join (paginated, filterable)
  app.get("/api/outreach-log", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const status = (req.query.status as string) || undefined;
      const outreach_type = (req.query.outreach_type as string) || undefined;
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo = (req.query.dateTo as string) || undefined;
      const overdue = req.query.overdue === "true" ? true : false;

      const result = await storage.getAllOutreachLog({ page, limit, status, outreach_type, dateFrom, dateTo, overdue });
      res.json({ logs: result.logs, total: result.total, page, totalPages: Math.ceil(result.total / limit) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/outreach-log/stats — summary stats for outreach dashboard
  app.get("/api/outreach-log/stats", async (_req, res) => {
    try {
      const stats = await storage.getOutreachStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/brokers/:id/outreach-log — outreach log for one broker
  app.get("/api/brokers/:id/outreach-log", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const logs = await storage.getOutreachLog(id);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/brokers/:id/outreach-log — log an outreach event
  app.post("/api/brokers/:id/outreach-log", async (req, res) => {
    try {
      const broker_id = parseInt(req.params.id);
      if (isNaN(broker_id)) return res.status(400).json({ error: "Invalid id" });
      const parsed = insertOutreachLogSchema.safeParse({ ...req.body, broker_id });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const log = await storage.createOutreachLog(parsed.data);
      // Auto-update broker outreach_status to "contacted" if it's still "not_contacted"
      const broker = await storage.getBroker(broker_id);
      if (broker && (broker.outreach_status === "not_contacted" || !broker.outreach_status)) {
        await storage.updateBroker(broker_id, { outreach_status: "contacted" });
      }
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/outreach-log/:id — update an outreach log entry
  app.patch("/api/outreach-log/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const parsed = updateOutreachLogSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const log = await storage.updateOutreachLog(id, parsed.data);
      if (!log) return res.status(404).json({ error: "Log entry not found" });
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/outreach-log/:id — delete an outreach log entry
  app.delete("/api/outreach-log/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteOutreachLog(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Message Templates ──────────────────────────────────────────────────────

  // GET /api/message-templates
  app.get("/api/message-templates", async (_req, res) => {
    try {
      const templates = await storage.getMessageTemplates();
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/message-templates
  app.post("/api/message-templates", async (req, res) => {
    try {
      const parsed = insertMessageTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const template = await storage.createMessageTemplate(parsed.data);
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/message-templates/:id
  app.patch("/api/message-templates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const parsed = updateMessageTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const template = await storage.updateMessageTemplate(id, parsed.data);
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/message-templates/:id
  app.delete("/api/message-templates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.deleteMessageTemplate(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Outreach Sequences & Automation ─────────────────────────────────────

  app.get("/api/outreach/sequences", async (_req, res) => {
    try {
      const sequences = await outreachService.listSequences();
      const withSteps = await Promise.all(sequences.map(async (seq) => {
        const steps = await outreachService.getSequenceSteps(seq.id);
        return { ...seq, steps };
      }));
      res.json(withSteps);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/outreach/sequences", async (req, res) => {
    try {
      const parsed = insertOutreachSequenceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const sequence = await outreachService.createSequence(parsed.data);

      if (Array.isArray(req.body.steps)) {
        for (const stepData of req.body.steps) {
          const stepParsed = insertOutreachSequenceStepSchema.safeParse({ ...stepData, sequence_id: sequence.id });
          if (stepParsed.success) {
            await outreachService.createSequenceStep(stepParsed.data);
          }
        }
      }

      const steps = await outreachService.getSequenceSteps(sequence.id);
      res.status(201).json({ ...sequence, steps });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/outreach/enroll", async (req, res) => {
    try {
      const { sequenceId, entityId, entityType, inboxId } = req.body;
      if (!sequenceId || !entityId) return res.status(400).json({ error: "sequenceId and entityId are required" });

      const result = await outreachService.enrollEntityInSequence(
        Number(sequenceId),
        Number(entityId),
        entityType || "broker",
        inboxId ? Number(inboxId) : undefined,
      );

      if (result.error) return res.status(400).json({ error: result.error });
      res.status(201).json(result.enrollment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/outreach/send-due", async (_req, res) => {
    try {
      const result = await outreachService.sendDueEmails();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/outreach/unsubscribe", async (req, res) => {
    try {
      const { entityId, email } = req.body;
      if (!entityId && !email) return res.status(400).json({ error: "entityId or email required" });

      const result = await outreachService.processUnsubscribe({
        entityId: entityId ? Number(entityId) : undefined,
        email: email || undefined,
      });

      if (result.error) return res.status(400).json({ error: result.error });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/outreach/webhooks/reply", async (req, res) => {
    try {
      const result = await outreachService.processReplyWebhook(req.body);
      if (result.error) return res.status(404).json({ error: result.error });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/outreach/webhooks/bounce", async (req, res) => {
    try {
      const { providerMessageId, email, bounceType } = req.body;
      if (!bounceType) return res.status(400).json({ error: "bounceType required (soft or hard)" });

      const result = await outreachService.processBounceWebhook({
        providerMessageId,
        email,
        bounceType,
      });

      if (result.error) return res.status(404).json({ error: result.error });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/outreach/timeline/:entityType/:entityId", async (req, res) => {
    try {
      const entityId = parseInt(req.params.entityId);
      if (isNaN(entityId)) return res.status(400).json({ error: "Invalid entityId" });
      const events = await outreachService.getEntityTimeline(entityId, req.params.entityType);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/outreach/inbox-health", async (_req, res) => {
    try {
      const health = await outreachService.getInboxHealth();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/outreach/suppressions", async (_req, res) => {
    try {
      const rows = await db.select().from(outreachSuppressions).orderBy(sql`created_at DESC`).limit(500);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/outreach/enrollments/:entityType/:entityId", async (req, res) => {
    try {
      const entityId = parseInt(req.params.entityId);
      if (isNaN(entityId)) return res.status(400).json({ error: "Invalid entityId" });
      const rows = await db.select().from(outreachEnrollments)
        .where(and(
          eq(outreachEnrollments.entity_id, entityId),
          eq(outreachEnrollments.entity_type, req.params.entityType),
        ))
        .orderBy(sql`created_at DESC`);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
