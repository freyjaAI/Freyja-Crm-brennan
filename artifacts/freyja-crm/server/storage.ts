import {
  type Broker,
  type InsertBroker,
  type UpdateBroker,
  brokers,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, like, or, and, sql, desc, asc, count } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  getBrokers(params: {
    page: number;
    limit: number;
    search?: string;
    state?: string;
    status?: string;
    assigned_to?: string;
    sort_by?: string;
    sort_order?: string;
  }): { brokers: Broker[]; total: number; page: number; totalPages: number };

  getBroker(id: number): Broker | undefined;
  updateBroker(id: number, data: UpdateBroker): Broker | undefined;
  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    byState: { state: string; count: number }[];
    bySourceType: { source_type: string; count: number }[];
  };
  importBrokers(records: InsertBroker[]): number;
  importBrokersBatch(records: InsertBroker[]): void;
  clearBrokers(): void;
  getFilteredBrokersForExport(params: {
    search?: string;
    state?: string;
    status?: string;
    assigned_to?: string;
  }): Broker[];
}

export class DatabaseStorage implements IStorage {
  getBrokers(params: {
    page: number;
    limit: number;
    search?: string;
    state?: string;
    status?: string;
    assigned_to?: string;
    sort_by?: string;
    sort_order?: string;
  }) {
    const { page, limit, search, state, status, assigned_to, sort_by, sort_order } = params;
    const conditions: any[] = [];

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          like(brokers.full_name, searchPattern),
          like(brokers.email, searchPattern),
          like(brokers.office_name, searchPattern),
          like(brokers.city, searchPattern)
        )
      );
    }

    if (state) {
      conditions.push(eq(brokers.state, state));
    }

    if (status) {
      conditions.push(eq(brokers.outreach_status, status));
    }

    if (assigned_to) {
      conditions.push(eq(brokers.assigned_to, assigned_to));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = db
      .select({ value: count() })
      .from(brokers)
      .where(whereClause)
      .get();
    const total = countResult?.value ?? 0;

    // Determine sort column
    const sortColumn = sort_by && sort_by in brokers
      ? (brokers as any)[sort_by]
      : brokers.id;
    const sortDirection = sort_order === "desc" ? desc(sortColumn) : asc(sortColumn);

    const offset = (page - 1) * limit;

    const results = db
      .select()
      .from(brokers)
      .where(whereClause)
      .orderBy(sortDirection)
      .limit(limit)
      .offset(offset)
      .all();

    return {
      brokers: results,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  getBroker(id: number): Broker | undefined {
    return db.select().from(brokers).where(eq(brokers.id, id)).get();
  }

  updateBroker(id: number, data: UpdateBroker): Broker | undefined {
    const updateData: any = {};
    if (data.outreach_status !== undefined) updateData.outreach_status = data.outreach_status;
    if (data.assigned_to !== undefined) updateData.assigned_to = data.assigned_to;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.last_contacted_at !== undefined) updateData.last_contacted_at = data.last_contacted_at;

    if (Object.keys(updateData).length === 0) return this.getBroker(id);

    db.update(brokers).set(updateData).where(eq(brokers.id, id)).run();
    return this.getBroker(id);
  }

  getStats() {
    const totalResult = db.select({ value: count() }).from(brokers).get();
    const total = totalResult?.value ?? 0;

    // By status
    const statusResults = db
      .select({
        status: brokers.outreach_status,
        count: count(),
      })
      .from(brokers)
      .groupBy(brokers.outreach_status)
      .all();

    const byStatus: Record<string, number> = {};
    for (const row of statusResults) {
      byStatus[row.status || "not_contacted"] = row.count;
    }

    // By state (top 10)
    const stateResults = db
      .select({
        state: brokers.state,
        count: count(),
      })
      .from(brokers)
      .groupBy(brokers.state)
      .orderBy(desc(count()))
      .limit(10)
      .all();

    const byState = stateResults
      .filter((r) => r.state)
      .map((r) => ({
        state: r.state!,
        count: r.count,
      }));

    // By source type
    const sourceResults = db
      .select({
        source_type: brokers.source_type,
        count: count(),
      })
      .from(brokers)
      .groupBy(brokers.source_type)
      .orderBy(desc(count()))
      .all();

    const bySourceType = sourceResults
      .filter((r) => r.source_type)
      .map((r) => ({
        source_type: r.source_type!,
        count: r.count,
      }));

    return { total, byStatus, byState, bySourceType };
  }

  importBrokers(records: InsertBroker[]): number {
    // Clear existing data before import
    db.delete(brokers).run();
    let imported = 0;
    // batch insert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      db.insert(brokers).values(chunk).run();
      imported += chunk.length;
    }
    return imported;
  }

  clearBrokers(): void {
    db.delete(brokers).run();
  }

  importBrokersBatch(records: InsertBroker[]): void {
    // Insert a batch of records (used by streaming import)
    const chunkSize = 500;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      db.insert(brokers).values(chunk).run();
    }
  }

  getFilteredBrokersForExport(params: {
    search?: string;
    state?: string;
    status?: string;
    assigned_to?: string;
  }): Broker[] {
    const { search, state, status, assigned_to } = params;
    const conditions: any[] = [];

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          like(brokers.full_name, searchPattern),
          like(brokers.email, searchPattern),
          like(brokers.office_name, searchPattern),
          like(brokers.city, searchPattern)
        )
      );
    }

    if (state) conditions.push(eq(brokers.state, state));
    if (status) conditions.push(eq(brokers.outreach_status, status));
    if (assigned_to) conditions.push(eq(brokers.assigned_to, assigned_to));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select().from(brokers).where(whereClause).all();
  }
}

export const storage = new DatabaseStorage();
