import {
  type Broker,
  type InsertBroker,
  type UpdateBroker,
  brokers,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, like, or, and, sql, desc, asc, count } from "drizzle-orm";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

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
  }): Promise<{ brokers: Broker[]; total: number; page: number; totalPages: number }>;

  getBroker(id: number): Promise<Broker | undefined>;
  updateBroker(id: number, data: UpdateBroker): Promise<Broker | undefined>;
  getStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byState: { state: string; count: number }[];
    bySourceType: { source_type: string; count: number }[];
  }>;
  importBrokers(records: InsertBroker[]): Promise<number>;
  importBrokersBatch(records: InsertBroker[]): Promise<void>;
  clearBrokers(): Promise<void>;
  getFilteredBrokersForExport(params: {
    search?: string;
    state?: string;
    status?: string;
    assigned_to?: string;
  }): Promise<Broker[]>;
}

export class DatabaseStorage implements IStorage {
  async getBrokers(params: {
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

    if (state) conditions.push(eq(brokers.state, state));
    if (status) conditions.push(eq(brokers.outreach_status, status));
    if (assigned_to) conditions.push(eq(brokers.assigned_to, assigned_to));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, results] = await Promise.all([
      db.select({ value: count() }).from(brokers).where(whereClause),
      db
        .select()
        .from(brokers)
        .where(whereClause)
        .orderBy(
          sort_order === "desc"
            ? desc(sort_by && sort_by in brokers ? (brokers as any)[sort_by] : brokers.id)
            : asc(sort_by && sort_by in brokers ? (brokers as any)[sort_by] : brokers.id)
        )
        .limit(limit)
        .offset((page - 1) * limit),
    ]);

    const total = Number(countResult[0]?.value ?? 0);

    return { brokers: results, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getBroker(id: number): Promise<Broker | undefined> {
    const rows = await db.select().from(brokers).where(eq(brokers.id, id));
    return rows[0];
  }

  async updateBroker(id: number, data: UpdateBroker): Promise<Broker | undefined> {
    const updateData: any = {};
    if (data.outreach_status !== undefined) updateData.outreach_status = data.outreach_status;
    if (data.assigned_to !== undefined) updateData.assigned_to = data.assigned_to;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.last_contacted_at !== undefined) updateData.last_contacted_at = data.last_contacted_at;

    if (Object.keys(updateData).length === 0) return this.getBroker(id);

    await db.update(brokers).set(updateData).where(eq(brokers.id, id));
    return this.getBroker(id);
  }

  async getStats() {
    const [totalResult, statusResults, stateResults, sourceResults] = await Promise.all([
      db.select({ value: count() }).from(brokers),
      db.select({ status: brokers.outreach_status, count: count() }).from(brokers).groupBy(brokers.outreach_status),
      db
        .select({ state: brokers.state, count: count() })
        .from(brokers)
        .groupBy(brokers.state)
        .orderBy(desc(count()))
        .limit(10),
      db
        .select({ source_type: brokers.source_type, count: count() })
        .from(brokers)
        .groupBy(brokers.source_type)
        .orderBy(desc(count())),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);

    const byStatus: Record<string, number> = {};
    for (const row of statusResults) {
      byStatus[row.status || "not_contacted"] = Number(row.count);
    }

    const byState = stateResults
      .filter((r) => r.state)
      .map((r) => ({ state: r.state!, count: Number(r.count) }));

    const bySourceType = sourceResults
      .filter((r) => r.source_type)
      .map((r) => ({ source_type: r.source_type!, count: Number(r.count) }));

    return { total, byStatus, byState, bySourceType };
  }

  async importBrokers(records: InsertBroker[]): Promise<number> {
    await db.delete(brokers);
    await this.importBrokersBatch(records);
    return records.length;
  }

  async clearBrokers(): Promise<void> {
    await db.delete(brokers);
  }

  async importBrokersBatch(records: InsertBroker[]): Promise<void> {
    const chunkSize = 500;
    for (let i = 0; i < records.length; i += chunkSize) {
      await db.insert(brokers).values(records.slice(i, i + chunkSize));
    }
  }

  async getFilteredBrokersForExport(params: {
    search?: string;
    state?: string;
    status?: string;
    assigned_to?: string;
  }): Promise<Broker[]> {
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
    return db.select().from(brokers).where(whereClause);
  }
}

export const storage = new DatabaseStorage();
