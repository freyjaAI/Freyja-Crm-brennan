import {
  type Broker,
  type InsertBroker,
  type UpdateBroker,
  type FilterPreset,
  type OutreachLog,
  type InsertOutreachLog,
  type UpdateOutreachLog,
  type MessageTemplate,
  type InsertMessageTemplate,
  type UpdateMessageTemplate,
  brokers,
  filterPresets,
  outreachLog,
  messageTemplates,
  outreachEnrollments,
  emailMessages,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, like, or, and, sql, desc, asc, count, lte } from "drizzle-orm";

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
  getFilterOptions(): Promise<{
    states: string[];
    specialties: string[];
    sourceTypes: string[];
  }>;
  getAiLeads(limit?: number): Promise<{ brokers: (Broker & { lead_score: number })[]; total: number }>;
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
    if (data.linkedin_url !== undefined) updateData.linkedin_url = data.linkedin_url;

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

  async getFilterPresets(userId: string): Promise<FilterPreset[]> {
    return db.select().from(filterPresets)
      .where(eq(filterPresets.user_id, userId))
      .orderBy(asc(filterPresets.id));
  }

  async createFilterPreset(userId: string, name: string, filters: any): Promise<FilterPreset> {
    const [preset] = await db.insert(filterPresets).values({
      user_id: userId,
      name,
      filters,
      created_at: new Date().toISOString(),
    }).returning();
    return preset;
  }

  async deleteFilterPreset(id: number, userId: string): Promise<boolean> {
    await db.delete(filterPresets)
      .where(and(eq(filterPresets.id, id), eq(filterPresets.user_id, userId)));
    return true;
  }

  // Outreach log
  async getOutreachLog(brokerId: number): Promise<OutreachLog[]> {
    return db.select().from(outreachLog)
      .where(eq(outreachLog.broker_id, brokerId))
      .orderBy(desc(outreachLog.created_at));
  }

  async getAllOutreachLog(params: {
    page: number;
    limit: number;
    status?: string;
    outreach_type?: string;
    dateFrom?: string;
    dateTo?: string;
    overdue?: boolean;
    search?: string;
  }): Promise<{ logs: (OutreachLog & { broker_name: string | null; broker_state: string | null; broker_email: string | null; email_subject: string | null; email_body: string | null; step_number: number | null })[], total: number }> {
    const conditions: any[] = [];
    if (params.status) conditions.push(eq(outreachLog.status, params.status));
    if (params.outreach_type) conditions.push(eq(outreachLog.outreach_type, params.outreach_type));
    if (params.dateFrom) conditions.push(sql`${outreachLog.created_at} >= ${params.dateFrom}`);
    if (params.dateTo) conditions.push(sql`${outreachLog.created_at} <= ${params.dateTo}`);
    if (params.overdue) {
      const today = new Date().toISOString().split("T")[0];
      conditions.push(sql`${outreachLog.follow_up_date} IS NOT NULL AND ${outreachLog.follow_up_date} <= ${today} AND ${outreachLog.status} NOT IN ('closed', 'meeting_set')`);
    }
    if (params.search) {
      const pat = `%${params.search}%`;
      conditions.push(
        or(
          like(brokers.full_name, pat),
          like(brokers.email, pat),
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, baseRows] = await Promise.all([
      db.select({ value: count() })
        .from(outreachLog)
        .leftJoin(brokers, eq(outreachLog.broker_id, brokers.id))
        .where(whereClause),
      db.select({
        id: outreachLog.id,
        broker_id: outreachLog.broker_id,
        outreach_type: outreachLog.outreach_type,
        message_template_used: outreachLog.message_template_used,
        status: outreachLog.status,
        notes: outreachLog.notes,
        created_at: outreachLog.created_at,
        follow_up_date: outreachLog.follow_up_date,
        broker_name: brokers.full_name,
        broker_state: brokers.state,
        broker_email: brokers.email,
      })
        .from(outreachLog)
        .leftJoin(brokers, eq(outreachLog.broker_id, brokers.id))
        .where(whereClause)
        .orderBy(desc(outreachLog.created_at))
        .limit(params.limit)
        .offset((params.page - 1) * params.limit),
    ]);

    const brokerIds = [...new Set(baseRows.map(r => r.broker_id))];
    let emailMap = new Map<number, { subject: string | null; body: string | null }>();
    let stepMap = new Map<number, number>();

    if (brokerIds.length > 0) {
      const [emails, enrolls] = await Promise.all([
        db.select({
          entity_id: emailMessages.entity_id,
          subject: emailMessages.subject,
          body: emailMessages.body_rendered,
        })
          .from(emailMessages)
          .where(and(
            sql`${emailMessages.entity_id} IN (${sql.join(brokerIds.map(id => sql`${id}`), sql`, `)})`,
            sql`${emailMessages.sent_at} IS NOT NULL`
          ))
          .orderBy(desc(emailMessages.sent_at)),
        db.select({
          entity_id: outreachEnrollments.entity_id,
          current_step: outreachEnrollments.current_step,
        })
          .from(outreachEnrollments)
          .where(sql`${outreachEnrollments.entity_id} IN (${sql.join(brokerIds.map(id => sql`${id}`), sql`, `)})`)
          .orderBy(desc(outreachEnrollments.created_at)),
      ]);

      for (const e of emails) {
        if (!emailMap.has(e.entity_id)) emailMap.set(e.entity_id, { subject: e.subject, body: e.body });
      }
      for (const e of enrolls) {
        if (!stepMap.has(e.entity_id)) stepMap.set(e.entity_id, e.current_step);
      }
    }

    const logs = baseRows.map(row => ({
      ...row,
      email_subject: emailMap.get(row.broker_id)?.subject ?? null,
      email_body: emailMap.get(row.broker_id)?.body ?? null,
      step_number: stepMap.get(row.broker_id) ?? null,
    }));

    return { logs: logs as any, total: Number(countResult[0]?.value ?? 0) };
  }

  async getOutreachStats(): Promise<{
    totalContacted: number;
    awaitingResponse: number;
    meetingsSet: number;
    conversions: number;
    overdueFollowUps: number;
  }> {
    const today = new Date().toISOString().split("T")[0];
    const [byStatus, overdue] = await Promise.all([
      db.select({ status: outreachLog.status, count: count() }).from(outreachLog).groupBy(outreachLog.status),
      db.select({ value: count() }).from(outreachLog)
        .where(sql`${outreachLog.follow_up_date} IS NOT NULL AND ${outreachLog.follow_up_date} <= ${today} AND ${outreachLog.status} NOT IN ('closed', 'meeting_set')`),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of byStatus) statusMap[row.status] = Number(row.count);

    return {
      totalContacted: Object.values(statusMap).reduce((a, b) => a + b, 0),
      awaitingResponse: (statusMap["contacted"] || 0) + (statusMap["opened"] || 0) + (statusMap["no_response"] || 0),
      meetingsSet: statusMap["meeting_set"] || 0,
      conversions: statusMap["closed"] || 0,
      overdueFollowUps: Number(overdue[0]?.value ?? 0),
      opened: statusMap["opened"] || 0,
      responded: statusMap["responded"] || 0,
    };
  }

  async createOutreachLog(data: InsertOutreachLog): Promise<OutreachLog> {
    const [row] = await db.insert(outreachLog).values({
      ...data,
      created_at: new Date().toISOString(),
    }).returning();
    return row;
  }

  async updateOutreachLog(id: number, data: UpdateOutreachLog): Promise<OutreachLog | undefined> {
    const updateData: any = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.follow_up_date !== undefined) updateData.follow_up_date = data.follow_up_date;
    await db.update(outreachLog).set(updateData).where(eq(outreachLog.id, id));
    const [row] = await db.select().from(outreachLog).where(eq(outreachLog.id, id));
    return row;
  }

  async deleteOutreachLog(id: number): Promise<void> {
    await db.delete(outreachLog).where(eq(outreachLog.id, id));
  }

  async getRecentActivity(limit: number = 10): Promise<any[]> {
    const rows = await db.select({
      id: emailMessages.id,
      broker_id: emailMessages.entity_id,
      subject: emailMessages.subject,
      send_status: emailMessages.send_status,
      sent_at: emailMessages.sent_at,
      bounce_type: emailMessages.bounce_type,
      broker_name: brokers.full_name,
    })
      .from(emailMessages)
      .leftJoin(brokers, eq(emailMessages.entity_id, brokers.id))
      .orderBy(desc(emailMessages.sent_at))
      .limit(limit);
    return rows;
  }

  async getSequenceEnrollments(sequenceId: number): Promise<any[]> {
    const rows = await db.select({
      id: outreachEnrollments.id,
      entity_id: outreachEnrollments.entity_id,
      priority: outreachEnrollments.priority,
      status: outreachEnrollments.status,
      current_step: outreachEnrollments.current_step,
      next_send_at: outreachEnrollments.next_send_at,
      last_sent_at: outreachEnrollments.last_sent_at,
      created_at: outreachEnrollments.created_at,
      broker_name: brokers.full_name,
      broker_email: brokers.email,
      broker_state: brokers.state,
    })
      .from(outreachEnrollments)
      .leftJoin(brokers, eq(outreachEnrollments.entity_id, brokers.id))
      .where(eq(outreachEnrollments.sequence_id, sequenceId))
      .orderBy(desc(outreachEnrollments.priority), asc(outreachEnrollments.next_send_at));
    return rows;
  }

  // Message templates
  async getMessageTemplates(): Promise<MessageTemplate[]> {
    return db.select().from(messageTemplates).orderBy(asc(messageTemplates.id));
  }

  async getMessageTemplate(id: number): Promise<MessageTemplate | undefined> {
    const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id));
    return row;
  }

  async createMessageTemplate(data: InsertMessageTemplate): Promise<MessageTemplate> {
    const now = new Date().toISOString();
    const [row] = await db.insert(messageTemplates).values({
      ...data,
      created_at: now,
      updated_at: now,
    }).returning();
    return row;
  }

  async updateMessageTemplate(id: number, data: UpdateMessageTemplate): Promise<MessageTemplate | undefined> {
    const updateData: any = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.body_text !== undefined) updateData.body_text = data.body_text;
    await db.update(messageTemplates).set(updateData).where(eq(messageTemplates.id, id));
    return this.getMessageTemplate(id);
  }

  async deleteMessageTemplate(id: number): Promise<void> {
    await db.delete(messageTemplates).where(eq(messageTemplates.id, id));
  }

  async getAiLeads(limit: number = 100): Promise<{ brokers: (Broker & { lead_score: number })[]; total: number }> {
    const queryText = `
      WITH candidates AS (
        SELECT *,
          REPLACE(recently_sold_count, ',', '')::int AS deals_num
        FROM brokers
        WHERE outreach_status = 'not_contacted'
          AND email IS NOT NULL AND email != ''
          AND REPLACE(recently_sold_count, ',', '') ~ '^[0-9]+$'
          AND REPLACE(recently_sold_count, ',', '')::int >= 10
      ),
      scored AS (
        SELECT *,
          (
            CASE
              WHEN deals_num BETWEEN 50 AND 300 THEN 30
              WHEN deals_num BETWEEN 25 AND 49 THEN 15
              WHEN deals_num BETWEEN 301 AND 500 THEN 10
              ELSE 0
            END
            +
            CASE
              WHEN average_price ~ '^\\$' THEN
                CASE
                  WHEN (
                    CASE
                      WHEN average_price LIKE '%M' THEN REPLACE(REPLACE(average_price, '$', ''), 'M', '')::float * 1000000
                      WHEN average_price LIKE '%K' THEN REPLACE(REPLACE(average_price, '$', ''), 'K', '')::float * 1000
                      ELSE COALESCE(NULLIF(REGEXP_REPLACE(REPLACE(average_price, '$', ''), '[^0-9.]', '', 'g'), '')::float, 0)
                    END
                  ) BETWEEN 250000 AND 1000000 THEN 25
                  WHEN (
                    CASE
                      WHEN average_price LIKE '%M' THEN REPLACE(REPLACE(average_price, '$', ''), 'M', '')::float * 1000000
                      WHEN average_price LIKE '%K' THEN REPLACE(REPLACE(average_price, '$', ''), 'K', '')::float * 1000
                      ELSE COALESCE(NULLIF(REGEXP_REPLACE(REPLACE(average_price, '$', ''), '[^0-9.]', '', 'g'), '')::float, 0)
                    END
                  ) BETWEEN 150000 AND 249999 THEN 12
                  ELSE 0
                END
              ELSE 0
            END
            +
            CASE
              WHEN REGEXP_REPLACE(experience_years, '[^0-9]', '', 'g') ~ '^[0-9]+$'
                   AND REGEXP_REPLACE(experience_years, '[^0-9]', '', 'g')::int BETWEEN 5 AND 15 THEN 20
              WHEN REGEXP_REPLACE(experience_years, '[^0-9]', '', 'g') ~ '^[0-9]+$'
                   AND REGEXP_REPLACE(experience_years, '[^0-9]', '', 'g')::int BETWEEN 2 AND 4 THEN 10
              ELSE 0
            END
            +
            10
            +
            CASE WHEN phone IS NOT NULL AND phone != '' THEN 8 ELSE 0 END
            +
            CASE WHEN linkedin_url IS NOT NULL AND linkedin_url != '' THEN 10 ELSE 0 END
            +
            CASE WHEN specialties ILIKE '%House%' THEN 5 ELSE 0 END
            +
            CASE WHEN specialties ILIKE '%Condo%' THEN 5 ELSE 0 END
            +
            CASE WHEN specialties ILIKE '%Commercial%' THEN 5 ELSE 0 END
          ) AS lead_score
        FROM candidates
      ),
      total_count AS (
        SELECT COUNT(*)::int AS cnt FROM candidates
      )
      SELECT s.*, tc.cnt AS total_eligible
      FROM scored s, total_count tc
      ORDER BY s.lead_score DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(queryText, [limit]);
    const total = rows.length > 0 ? rows[0].total_eligible : 0;
    const brokerResults = rows.map((r: any) => {
      const { lead_score, deals_num, total_eligible, ...brokerData } = r;
      return { ...brokerData, lead_score: Number(lead_score) };
    });
    return { brokers: brokerResults, total };
  }
}

export const storage = new DatabaseStorage();
