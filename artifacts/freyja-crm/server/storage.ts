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

export interface ProspectingFilters {
  page: number;
  limit: number;
  search?: string;
  state?: string;
  states?: string[];
  status?: string;
  assigned_to?: string;
  sort_by?: string;
  sort_order?: string;
  dealsClosedMin?: number;
  dealsClosedMax?: number;
  avgPriceMin?: number;
  avgPriceMax?: number;
  experienceMin?: number;
  experienceMax?: number;
  specialties?: string[];
  brokerage?: string;
  city?: string;
  sourceType?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasLinkedin?: boolean;
}

export interface IStorage {
  getBrokers(params: ProspectingFilters): Promise<{ brokers: Broker[]; total: number; page: number; totalPages: number }>;
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
  getFilterOptions(): Promise<{
    states: string[];
    specialties: string[];
    sourceTypes: string[];
  }>;
}

function buildProspectingConditions(params: ProspectingFilters): any[] {
  const conditions: any[] = [];

  if (params.search) {
    const searchPattern = `%${params.search}%`;
    conditions.push(
      or(
        like(brokers.full_name, searchPattern),
        like(brokers.email, searchPattern),
        like(brokers.office_name, searchPattern),
        like(brokers.city, searchPattern)
      )
    );
  }

  if (params.state) conditions.push(eq(brokers.state, params.state));
  if (params.states && params.states.length > 0) {
    conditions.push(sql`${brokers.state} IN (${sql.join(params.states.map(s => sql`${s}`), sql`, `)})`);
  }
  if (params.status) conditions.push(eq(brokers.outreach_status, params.status));
  if (params.assigned_to) conditions.push(eq(brokers.assigned_to, params.assigned_to));

  if (params.dealsClosedMin !== undefined) {
    conditions.push(sql`REPLACE(${brokers.recently_sold_count}, ',', '') ~ '^[0-9]+$' AND REPLACE(${brokers.recently_sold_count}, ',', '')::int >= ${params.dealsClosedMin}`);
  }
  if (params.dealsClosedMax !== undefined) {
    conditions.push(sql`REPLACE(${brokers.recently_sold_count}, ',', '') ~ '^[0-9]+$' AND REPLACE(${brokers.recently_sold_count}, ',', '')::int <= ${params.dealsClosedMax}`);
  }

  if (params.avgPriceMin !== undefined) {
    conditions.push(sql`${brokers.average_price} ~ '^\\$' AND
      CASE
        WHEN ${brokers.average_price} LIKE '%M' THEN REPLACE(REPLACE(${brokers.average_price}, '$', ''), 'M', '')::float * 1000000
        WHEN ${brokers.average_price} LIKE '%K' THEN REPLACE(REPLACE(${brokers.average_price}, '$', ''), 'K', '')::float * 1000
        ELSE NULLIF(REGEXP_REPLACE(REPLACE(${brokers.average_price}, '$', ''), '[^0-9.]', '', 'g'), '')::float
      END >= ${params.avgPriceMin}
    `);
  }
  if (params.avgPriceMax !== undefined) {
    conditions.push(sql`${brokers.average_price} ~ '^\\$' AND
      CASE
        WHEN ${brokers.average_price} LIKE '%M' THEN REPLACE(REPLACE(${brokers.average_price}, '$', ''), 'M', '')::float * 1000000
        WHEN ${brokers.average_price} LIKE '%K' THEN REPLACE(REPLACE(${brokers.average_price}, '$', ''), 'K', '')::float * 1000
        ELSE NULLIF(REGEXP_REPLACE(REPLACE(${brokers.average_price}, '$', ''), '[^0-9.]', '', 'g'), '')::float
      END <= ${params.avgPriceMax}
    `);
  }

  if (params.experienceMin !== undefined) {
    conditions.push(sql`REGEXP_REPLACE(${brokers.experience_years}, '[^0-9]', '', 'g') ~ '^[0-9]+$' AND REGEXP_REPLACE(${brokers.experience_years}, '[^0-9]', '', 'g')::int >= ${params.experienceMin}`);
  }
  if (params.experienceMax !== undefined) {
    conditions.push(sql`REGEXP_REPLACE(${brokers.experience_years}, '[^0-9]', '', 'g') ~ '^[0-9]+$' AND REGEXP_REPLACE(${brokers.experience_years}, '[^0-9]', '', 'g')::int <= ${params.experienceMax}`);
  }

  if (params.specialties && params.specialties.length > 0) {
    const specConditions = params.specialties.map(s => like(brokers.specialties, `%${s}%`));
    conditions.push(or(...specConditions));
  }

  if (params.brokerage) {
    conditions.push(like(brokers.office_name, `%${params.brokerage}%`));
  }

  if (params.city) {
    conditions.push(like(brokers.city, `%${params.city}%`));
  }

  if (params.sourceType) {
    conditions.push(eq(brokers.source_type, params.sourceType));
  }

  if (params.hasEmail) {
    conditions.push(sql`${brokers.email} IS NOT NULL AND ${brokers.email} != ''`);
  }
  if (params.hasPhone) {
    conditions.push(sql`${brokers.phone} IS NOT NULL AND ${brokers.phone} != ''`);
  }
  if (params.hasLinkedin) {
    conditions.push(sql`${brokers.linkedin_url} IS NOT NULL AND ${brokers.linkedin_url} != ''`);
  }

  return conditions;
}

function getSortExpression(sort_by: string | undefined) {
  if (!sort_by) return brokers.id;

  if (sort_by === "recently_sold_count") {
    return sql`CASE WHEN REPLACE(${brokers.recently_sold_count}, ',', '') ~ '^[0-9]+$' THEN REPLACE(${brokers.recently_sold_count}, ',', '')::int ELSE NULL END`;
  }
  if (sort_by === "average_price") {
    return sql`
      CASE
        WHEN ${brokers.average_price} LIKE '$%M' THEN REPLACE(REPLACE(${brokers.average_price}, '$', ''), 'M', '')::float * 1000000
        WHEN ${brokers.average_price} LIKE '$%K' THEN REPLACE(REPLACE(${brokers.average_price}, '$', ''), 'K', '')::float * 1000
        WHEN ${brokers.average_price} ~ '^\\$' THEN NULLIF(REGEXP_REPLACE(REPLACE(${brokers.average_price}, '$', ''), '[^0-9.]', '', 'g'), '')::float
        ELSE NULL
      END
    `;
  }
  if (sort_by === "experience_years") {
    return sql`CASE WHEN REGEXP_REPLACE(${brokers.experience_years}, '[^0-9]', '', 'g') ~ '^[0-9]+$' THEN REGEXP_REPLACE(${brokers.experience_years}, '[^0-9]', '', 'g')::int ELSE NULL END`;
  }

  if (sort_by in brokers) return (brokers as any)[sort_by];
  return brokers.id;
}

export class DatabaseStorage implements IStorage {
  async getBrokers(params: ProspectingFilters) {
    const { page, limit, sort_by, sort_order } = params;
    const conditions = buildProspectingConditions(params);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const sortExpr = getSortExpression(sort_by);

    const [countResult, results] = await Promise.all([
      db.select({ value: count() }).from(brokers).where(whereClause),
      db
        .select()
        .from(brokers)
        .where(whereClause)
        .orderBy(sort_order === "desc" ? desc(sortExpr) : asc(sortExpr))
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

  async getFilterOptions() {
    const [stateResults, sourceResults] = await Promise.all([
      db.select({ state: brokers.state }).from(brokers).groupBy(brokers.state).orderBy(asc(brokers.state)),
      db.select({ source_type: brokers.source_type }).from(brokers).groupBy(brokers.source_type).orderBy(asc(brokers.source_type)),
    ]);

    const states = stateResults.filter(r => r.state).map(r => r.state!);
    const sourceTypes = sourceResults.filter(r => r.source_type).map(r => r.source_type!);
    const specialties = ["House", "Condo", "Townhouse", "Commercial", "Lot/Land", "Manufactured", "Other"];

    return { states, specialties, sourceTypes };
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
