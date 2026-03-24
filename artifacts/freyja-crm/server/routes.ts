import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { updateBrokerSchema, brokers } from "@shared/schema";
import type { Broker } from "@shared/schema";
import fs from "fs";
import Papa from "papaparse";
import { eq, isNull, or, and, like, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

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
    config: { maxOutputTokens: 4096, responseMimeType: "application/json" },
  });
  const text = response.text ?? "{}";
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim());
}

async function generateLinkedInMessage(broker: Broker): Promise<{ linkedin_message: string }> {
  const prompt = `You are an expert sales rep for a business financing company that helps real estate professionals grow.

Broker details:
${buildBrokerContext(broker)}

Write a LinkedIn connection request message:
- Friendly and personal, NOT salesy
- Under 280 characters
- Mention something specific about their work or market
- End with a soft reason to connect (no hard pitch)

Respond ONLY with valid JSON (no markdown):
{"linkedin_message": "..."}`;

  const response = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 512, responseMimeType: "application/json" },
  });
  const text = response.text ?? "{}";
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim());
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
  // GET /api/brokers — paginated list with search/filter/sort
  app.get("/api/brokers", (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const search = (req.query.search as string) || undefined;
      const state = (req.query.state as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const assigned_to = (req.query.assigned_to as string) || undefined;
      const sort_by = (req.query.sort_by as string) || undefined;
      const sort_order = (req.query.sort_order as string) || undefined;

      const result = storage.getBrokers({
        page,
        limit,
        search,
        state,
        status,
        assigned_to,
        sort_by,
        sort_order,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/brokers/export — export filtered brokers as CSV
  app.get("/api/brokers/export", (req, res) => {
    try {
      const search = (req.query.search as string) || undefined;
      const state = (req.query.state as string) || undefined;
      const status = (req.query.status as string) || undefined;
      const assigned_to = (req.query.assigned_to as string) || undefined;

      const brokersList = storage.getFilteredBrokersForExport({
        search,
        state,
        status,
        assigned_to,
      });

      const csv = Papa.unparse(brokersList);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=brokers_export.csv");
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/brokers/:id — single broker detail
  app.get("/api/brokers/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid broker ID" });
        return;
      }
      const broker = storage.getBroker(id);
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
  app.patch("/api/brokers/:id", (req, res) => {
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

      const updated = storage.updateBroker(id, parsed.data);
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
      const broker = storage.getBroker(id);
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

      const updated = storage.getBroker(id);
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
      const broker = storage.getBroker(id);
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

      const updated = storage.getBroker(id);
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

  // GET /api/stats — dashboard statistics
  app.get("/api/stats", (_req, res) => {
    try {
      const stats = storage.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/import — streaming CSV import from filesystem (handles 2M+ records)
  app.post("/api/import", (req, res) => {
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

    storage.clearBrokers();

    const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let headers: string[] | null = null;
    const headerMap: Record<string, number> = {};
    let batch: any[] = [];
    const BATCH_SIZE = 5000;
    let totalImported = 0;
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

      batch.push({
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

      if (batch.length >= BATCH_SIZE) {
        storage.importBrokersBatch(batch);
        totalImported += batch.length;
        batch = [];
      }
    });

    rl.on("close", () => {
      if (batch.length > 0) {
        storage.importBrokersBatch(batch);
        totalImported += batch.length;
      }
      res.json({ success: true, imported: totalImported, total: totalImported });
    });

    rl.on("error", (err: any) => {
      res.status(500).json({ error: err.message });
    });
  });

  return httpServer;
}
