import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { updateBrokerSchema } from "@shared/schema";
import fs from "fs";
import Papa from "papaparse";

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

    // Use streaming approach to avoid Node.js string size limit
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

    // Clear existing data
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
