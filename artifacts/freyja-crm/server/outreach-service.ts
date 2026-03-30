import { db, pool } from "./storage";
import { getEmailService } from "./email-service";
import {
  senderInboxes,
  outreachSequences,
  outreachSequenceSteps,
  outreachEnrollments,
  outreachEvents,
  emailMessages,
  outreachSuppressions,
  brokers,
  type OutreachSequence,
  type OutreachSequenceStep,
  type OutreachEnrollment,
  type OutreachEvent,
  type EmailMessage,
  type OutreachSuppression,
  type SenderInbox,
  type Broker,
  type InsertOutreachSequence,
  type UpdateOutreachSequence,
  type InsertOutreachSequenceStep,
  type InsertOutreachEnrollment,
  type InsertOutreachEvent,
  type InsertEmailMessage,
  type InsertOutreachSuppression,
  enrollmentStatusEnum,
} from "@shared/schema";
import { eq, and, lte, sql, desc, asc, inArray } from "drizzle-orm";

function nowISO(): string {
  return new Date().toISOString();
}

async function logEvent(data: InsertOutreachEvent): Promise<void> {
  await db.insert(outreachEvents).values({ ...data, created_at: nowISO() });
}

export async function listSequences(): Promise<OutreachSequence[]> {
  return db.select().from(outreachSequences).orderBy(desc(outreachSequences.created_at));
}

export async function getSequence(id: number): Promise<OutreachSequence | undefined> {
  const rows = await db.select().from(outreachSequences).where(eq(outreachSequences.id, id));
  return rows[0];
}

export async function createSequence(data: InsertOutreachSequence): Promise<OutreachSequence> {
  const now = nowISO();
  const rows = await db.insert(outreachSequences).values({ ...data, created_at: now, updated_at: now }).returning();
  return rows[0];
}

export async function updateSequence(id: number, data: UpdateOutreachSequence): Promise<OutreachSequence | undefined> {
  const rows = await db.update(outreachSequences).set({ ...data, updated_at: nowISO() }).where(eq(outreachSequences.id, id)).returning();
  return rows[0];
}

export async function getSequenceSteps(sequenceId: number): Promise<OutreachSequenceStep[]> {
  return db.select().from(outreachSequenceSteps).where(eq(outreachSequenceSteps.sequence_id, sequenceId)).orderBy(asc(outreachSequenceSteps.step_number));
}

export async function createSequenceStep(data: InsertOutreachSequenceStep): Promise<OutreachSequenceStep> {
  const rows = await db.insert(outreachSequenceSteps).values({ ...data, created_at: nowISO() }).returning();
  return rows[0];
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const rows = await db.select({ id: outreachSuppressions.id }).from(outreachSuppressions).where(eq(outreachSuppressions.email, email.toLowerCase().trim())).limit(1);
  return rows.length > 0;
}

export async function suppressEmail(email: string, reason: string, source: string, entityId?: number): Promise<OutreachSuppression> {
  const normalized = email.toLowerCase().trim();
  const existing = await db.select().from(outreachSuppressions).where(eq(outreachSuppressions.email, normalized)).limit(1);
  if (existing.length > 0) return existing[0];

  const rows = await db.insert(outreachSuppressions).values({
    email: normalized,
    entity_id: entityId ?? null,
    reason,
    source,
    created_at: nowISO(),
  }).returning();

  await stopEnrollmentsByEmail(normalized, reason);
  return rows[0];
}

async function stopEnrollmentsByEmail(email: string, reason: string): Promise<void> {
  const matchingBrokers = await db.select({ id: brokers.id }).from(brokers).where(eq(brokers.email, email)).limit(100);
  if (matchingBrokers.length === 0) return;

  const brokerIds = matchingBrokers.map(b => b.id);
  const activeEnrollments = await db.select().from(outreachEnrollments)
    .where(and(
      inArray(outreachEnrollments.entity_id, brokerIds),
      eq(outreachEnrollments.entity_type, "broker"),
      eq(outreachEnrollments.status, "active"),
    ));

  for (const enrollment of activeEnrollments) {
    await stopEnrollment(enrollment.id, reason === "unsubscribed" ? "unsubscribed" : "failed");
  }
}

export async function enrollEntityInSequence(
  sequenceId: number,
  entityId: number,
  entityType: string,
  inboxId?: number
): Promise<{ enrollment?: OutreachEnrollment; error?: string }> {
  const sequence = await getSequence(sequenceId);
  if (!sequence) return { error: "Sequence not found" };
  if (!sequence.active) return { error: "Sequence is not active" };

  const steps = await getSequenceSteps(sequenceId);
  if (steps.length === 0) return { error: "Sequence has no steps" };

  if (entityType === "broker") {
    const brokerRows = await db.select().from(brokers).where(eq(brokers.id, entityId)).limit(1);
    if (brokerRows.length === 0) return { error: "Broker not found" };
    const broker = brokerRows[0];

    if (!broker.email) return { error: "Broker has no email address" };

    const suppressed = await isEmailSuppressed(broker.email);
    if (suppressed) return { error: "Email is suppressed" };
  }

  const existingActive = await db.select().from(outreachEnrollments)
    .where(and(
      eq(outreachEnrollments.sequence_id, sequenceId),
      eq(outreachEnrollments.entity_id, entityId),
      eq(outreachEnrollments.entity_type, entityType),
      eq(outreachEnrollments.status, "active"),
    )).limit(1);

  if (existingActive.length > 0) return { error: "Entity already actively enrolled in this sequence" };

  const firstStep = steps[0];
  const nextSendAt = new Date(Date.now() + firstStep.delay_days * 86400000).toISOString();
  const now = nowISO();

  const rows = await db.insert(outreachEnrollments).values({
    sequence_id: sequenceId,
    entity_id: entityId,
    entity_type: entityType,
    inbox_id: inboxId ?? null,
    status: "active",
    current_step: 1,
    next_send_at: nextSendAt,
    created_at: now,
    updated_at: now,
  }).returning();

  await logEvent({
    entity_id: entityId,
    entity_type: entityType as any,
    channel: "system",
    event_type: "enrolled",
    metadata_json: { sequence_id: sequenceId, sequence_name: sequence.name },
    created_by: "admin",
  });

  return { enrollment: rows[0] };
}

export async function stopEnrollment(enrollmentId: number, reason: string): Promise<{ enrollment?: OutreachEnrollment; error?: string }> {
  const rows = await db.select().from(outreachEnrollments).where(eq(outreachEnrollments.id, enrollmentId)).limit(1);
  if (rows.length === 0) return { error: "Enrollment not found" };

  const enrollment = rows[0];
  const terminalStatuses: string[] = ["completed", "replied", "bounced", "unsubscribed", "failed"];
  if (terminalStatuses.includes(enrollment.status)) {
    return { error: `Enrollment already in terminal status: ${enrollment.status}` };
  }

  const statusMap: Record<string, string> = {
    reply: "replied",
    replied: "replied",
    bounce: "bounced",
    bounced: "bounced",
    hard_bounce: "bounced",
    unsubscribe: "unsubscribed",
    unsubscribed: "unsubscribed",
    completed: "completed",
    failed: "failed",
    manual: "completed",
  };
  const newStatus = statusMap[reason] || "completed";

  const updated = await db.update(outreachEnrollments).set({
    status: newStatus,
    updated_at: nowISO(),
  }).where(eq(outreachEnrollments.id, enrollmentId)).returning();

  await logEvent({
    entity_id: enrollment.entity_id,
    entity_type: enrollment.entity_type as any,
    channel: "system",
    event_type: "status_changed",
    metadata_json: { enrollment_id: enrollmentId, old_status: enrollment.status, new_status: newStatus, reason },
    created_by: "system",
  });

  return { enrollment: updated[0] };
}

export function renderEmailTemplate(
  template: string | null | undefined,
  entity: Broker
): string {
  if (!template) return "";

  const safeGet = (val: string | null | undefined, fallback: string) => val?.trim() || fallback;

  return template
    .replace(/\{\{broker_name\}\}/gi, safeGet(entity.full_name, "there"))
    .replace(/\{\{first_name\}\}/gi, safeGet(entity.first_name, safeGet(entity.full_name?.split(" ")[0], "there")))
    .replace(/\{\{last_name\}\}/gi, safeGet(entity.last_name, ""))
    .replace(/\{\{company_name\}\}/gi, safeGet(entity.office_name, "your brokerage"))
    .replace(/\{\{office_name\}\}/gi, safeGet(entity.office_name, "your brokerage"))
    .replace(/\{\{city\}\}/gi, safeGet(entity.city, "your area"))
    .replace(/\{\{state\}\}/gi, safeGet(entity.state, ""))
    .replace(/\{\{email\}\}/gi, safeGet(entity.email, ""))
    .replace(/\{\{job_title\}\}/gi, safeGet(entity.job_title, "Broker"))
    .replace(/\{\{experience_years\}\}/gi, safeGet(entity.experience_years, ""))
    .replace(/\{\{recently_sold_count\}\}/gi, safeGet(entity.recently_sold_count, ""))
    .replace(/\{\{average_price\}\}/gi, safeGet(entity.average_price, ""));
}

async function getInboxDailySentCount(inboxId: number, todayStart: string): Promise<number> {
  const result = await db.select({ cnt: sql<number>`count(*)` })
    .from(emailMessages)
    .where(and(
      eq(emailMessages.inbox_id, inboxId),
      eq(emailMessages.send_status, "sent"),
      sql`${emailMessages.sent_at} >= ${todayStart}`,
    ));
  return Number(result[0]?.cnt ?? 0);
}

export async function getDueSequenceSteps(now?: string): Promise<{
  due: Array<{ enrollment: OutreachEnrollment; step: OutreachSequenceStep; entity: Broker; inbox: SenderInbox | null }>;
  skipped: Array<{ enrollmentId: number; reason: string }>;
}> {
  const cutoff = now || nowISO();
  const todayStart = cutoff.slice(0, 10) + "T00:00:00.000Z";

  const dueEnrollments = await db.select().from(outreachEnrollments)
    .where(and(
      eq(outreachEnrollments.status, "active"),
      sql`${outreachEnrollments.next_send_at}::timestamptz <= ${cutoff}::timestamptz`,
      eq(outreachEnrollments.entity_type, "broker"),
    ))
    .orderBy(asc(outreachEnrollments.next_send_at))
    .limit(200);

  const due: Array<{ enrollment: OutreachEnrollment; step: OutreachSequenceStep; entity: Broker; inbox: SenderInbox | null }> = [];
  const skipped: Array<{ enrollmentId: number; reason: string }> = [];
  const inboxSentCounts = new Map<number, number>();

  for (const enrollment of dueEnrollments) {
    const steps = await getSequenceSteps(enrollment.sequence_id);
    const step = steps.find(s => s.step_number === enrollment.current_step);
    if (!step) {
      await stopEnrollment(enrollment.id, "completed");
      skipped.push({ enrollmentId: enrollment.id, reason: "no_more_steps" });
      continue;
    }

    const brokerRows = await db.select().from(brokers).where(eq(brokers.id, enrollment.entity_id)).limit(1);
    if (brokerRows.length === 0) {
      skipped.push({ enrollmentId: enrollment.id, reason: "entity_not_found" });
      continue;
    }
    const broker = brokerRows[0];

    if (!broker.email) {
      await stopEnrollment(enrollment.id, "failed");
      skipped.push({ enrollmentId: enrollment.id, reason: "no_email" });
      continue;
    }

    const suppressed = await isEmailSuppressed(broker.email);
    if (suppressed) {
      await stopEnrollment(enrollment.id, "failed");
      skipped.push({ enrollmentId: enrollment.id, reason: "suppressed" });
      continue;
    }

    let inbox: SenderInbox | null = null;
    if (enrollment.inbox_id) {
      const inboxRows = await db.select().from(senderInboxes).where(eq(senderInboxes.id, enrollment.inbox_id)).limit(1);
      inbox = inboxRows[0] ?? null;
    }
    if (!inbox) {
      const fallbackInboxes = await db.select().from(senderInboxes)
        .where(and(eq(senderInboxes.active, true)))
        .orderBy(asc(senderInboxes.id))
        .limit(1);
      inbox = fallbackInboxes[0] ?? null;
    }

    if (inbox) {
      if (!inboxSentCounts.has(inbox.id)) {
        inboxSentCounts.set(inbox.id, await getInboxDailySentCount(inbox.id, todayStart));
      }
      const sentToday = inboxSentCounts.get(inbox.id)!;
      if (sentToday >= inbox.daily_limit) {
        skipped.push({ enrollmentId: enrollment.id, reason: "inbox_daily_limit_reached" });
        continue;
      }
      inboxSentCounts.set(inbox.id, sentToday + 1);
    }

    due.push({ enrollment, step, entity: broker, inbox });
  }

  return { due, skipped };
}

export async function sendDueEmails(now?: string, maxSend?: number): Promise<{
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ enrollmentId: number; status: string; error?: string }>;
}> {
  const { due, skipped } = await getDueSequenceSteps(now);
  const details: Array<{ enrollmentId: number; status: string; error?: string }> = [];
  let sentCount = 0;
  let errorCount = 0;

  for (const s of skipped) {
    details.push({ enrollmentId: s.enrollmentId, status: "skipped", error: s.reason });
  }

  const emailService = getEmailService();
  const limit = maxSend != null ? maxSend : Infinity;

  for (const item of due) {
    if (sentCount >= limit) break;
    const { enrollment, step, entity, inbox } = item;

    try {
      const subject = renderEmailTemplate(step.subject_template, entity);
      const bodyHtml = renderEmailTemplate(step.body_template, entity);
      const fromAddr = inbox?.email_address || "noreply@freyja.biz";

      const msgRow = await db.insert(emailMessages).values({
        enrollment_id: enrollment.id,
        entity_id: entity.id,
        inbox_id: inbox?.id ?? null,
        subject,
        body_rendered: bodyHtml,
        send_status: "sending",
        created_at: nowISO(),
      } as InsertEmailMessage).returning();

      const result = await emailService.send({
        from: fromAddr,
        to: entity.email!,
        subject,
        bodyHtml,
      });

      if (result.success) {
        await db.update(emailMessages).set({
          send_status: "sent",
          sent_at: nowISO(),
          provider_message_id: result.providerMessageId ?? null,
        }).where(eq(emailMessages.id, msgRow[0].id));

        const steps = await getSequenceSteps(enrollment.sequence_id);
        const nextStepDef = steps.find(s => s.step_number === enrollment.current_step + 1);

        if (nextStepDef) {
          const nextSendAt = new Date(Date.now() + nextStepDef.delay_days * 86400000).toISOString();
          await db.update(outreachEnrollments).set({
            current_step: enrollment.current_step + 1,
            last_sent_at: nowISO(),
            next_send_at: nextSendAt,
            updated_at: nowISO(),
          }).where(eq(outreachEnrollments.id, enrollment.id));
        } else {
          await db.update(outreachEnrollments).set({
            last_sent_at: nowISO(),
            next_send_at: null,
            updated_at: nowISO(),
          }).where(eq(outreachEnrollments.id, enrollment.id));
          await stopEnrollment(enrollment.id, "completed");
        }

        await logEvent({
          entity_id: entity.id,
          entity_type: enrollment.entity_type as any,
          channel: "email",
          event_type: "email_sent",
          metadata_json: {
            enrollment_id: enrollment.id,
            step_number: step.step_number,
            subject,
            inbox_id: inbox?.id,
            provider_message_id: result.providerMessageId,
          },
          created_by: "system",
        });

        sentCount++;
        details.push({ enrollmentId: enrollment.id, status: "sent" });
      } else {
        await db.update(emailMessages).set({
          send_status: "failed",
        }).where(eq(emailMessages.id, msgRow[0].id));

        errorCount++;
        details.push({ enrollmentId: enrollment.id, status: "error", error: result.error });
      }
    } catch (err: any) {
      errorCount++;
      details.push({ enrollmentId: enrollment.id, status: "error", error: err.message });
    }
  }

  return { sent: sentCount, skipped: skipped.length, errors: errorCount, details };
}

export async function processReplyWebhook(payload: {
  providerMessageId?: string;
  entityEmail?: string;
  entityId?: number;
}): Promise<{ processed: boolean; error?: string }> {
  let enrollment: OutreachEnrollment | undefined;
  let matchedMessage: EmailMessage | undefined;

  if (payload.providerMessageId) {
    const msgRows = await db.select().from(emailMessages).where(eq(emailMessages.provider_message_id, payload.providerMessageId)).limit(1);
    if (msgRows.length > 0) {
      matchedMessage = msgRows[0];
      await db.update(emailMessages).set({ reply_status: "replied" }).where(eq(emailMessages.id, msgRows[0].id));

      if (msgRows[0].enrollment_id) {
        const enrollRows = await db.select().from(outreachEnrollments).where(eq(outreachEnrollments.id, msgRows[0].enrollment_id)).limit(1);
        enrollment = enrollRows[0];
      }
    }
  }

  if (!enrollment && payload.entityId) {
    const activeRows = await db.select().from(outreachEnrollments)
      .where(and(
        eq(outreachEnrollments.entity_id, payload.entityId),
        eq(outreachEnrollments.entity_type, "broker"),
        eq(outreachEnrollments.status, "active"),
      )).limit(1);
    enrollment = activeRows[0];
  }

  if (!enrollment) return { processed: false, error: "No matching enrollment found" };

  let shouldStop = true;
  if (enrollment.status === "active") {
    const steps = await getSequenceSteps(enrollment.sequence_id);
    const currentStep = steps.find(s => s.step_number === enrollment!.current_step)
      || steps.find(s => s.step_number === enrollment!.current_step - 1);
    if (currentStep && !currentStep.stop_on_reply) {
      shouldStop = false;
    }
  }

  await db.update(outreachEnrollments).set({
    reply_detected_at: nowISO(),
    updated_at: nowISO(),
    ...(shouldStop ? { status: "replied" } : {}),
  }).where(eq(outreachEnrollments.id, enrollment.id));

  await logEvent({
    entity_id: enrollment.entity_id,
    entity_type: enrollment.entity_type as any,
    channel: "email",
    event_type: "email_replied",
    metadata_json: {
      enrollment_id: enrollment.id,
      provider_message_id: payload.providerMessageId,
      stopped: shouldStop,
    },
    created_by: "system",
  });

  return { processed: true };
}

export async function processBounceWebhook(payload: {
  providerMessageId?: string;
  email?: string;
  bounceType: "soft" | "hard";
}): Promise<{ processed: boolean; error?: string }> {
  if (payload.providerMessageId) {
    await db.update(emailMessages).set({
      bounce_type: payload.bounceType,
      send_status: "failed",
    }).where(eq(emailMessages.provider_message_id, payload.providerMessageId));
  }

  let enrollment: OutreachEnrollment | undefined;
  let resolvedEmail = payload.email;
  let resolvedEntityId: number | undefined;

  if (payload.providerMessageId) {
    const msgRows = await db.select().from(emailMessages).where(eq(emailMessages.provider_message_id, payload.providerMessageId)).limit(1);
    if (msgRows.length > 0) {
      resolvedEntityId = msgRows[0].entity_id;
      if (msgRows[0].enrollment_id) {
        const enrollRows = await db.select().from(outreachEnrollments).where(eq(outreachEnrollments.id, msgRows[0].enrollment_id)).limit(1);
        enrollment = enrollRows[0];
      }
      if (!resolvedEmail) {
        const brokerRows = await db.select().from(brokers).where(eq(brokers.id, msgRows[0].entity_id)).limit(1);
        resolvedEmail = brokerRows[0]?.email ?? undefined;
        resolvedEntityId = brokerRows[0]?.id;
      }
    }
  }

  if (payload.bounceType === "hard") {
    if (enrollment) {
      await stopEnrollment(enrollment.id, "bounced");
    }

    if (resolvedEmail) {
      await suppressEmail(resolvedEmail, "bounce_hard", "provider", resolvedEntityId);
    }
  }

  await logEvent({
    entity_id: enrollment?.entity_id ?? resolvedEntityId ?? 0,
    entity_type: (enrollment?.entity_type ?? "broker") as any,
    channel: "email",
    event_type: "email_bounced",
    metadata_json: {
      provider_message_id: payload.providerMessageId,
      bounce_type: payload.bounceType,
      email: resolvedEmail,
    },
    created_by: "system",
  });

  return { processed: true };
}

export async function processUnsubscribe(params: {
  entityId?: number;
  email?: string;
}): Promise<{ processed: boolean; error?: string }> {
  let email = params.email;

  if (!email && params.entityId) {
    const brokerRows = await db.select().from(brokers).where(eq(brokers.id, params.entityId)).limit(1);
    email = brokerRows[0]?.email ?? undefined;
  }

  if (!email) return { processed: false, error: "No email found for unsubscribe" };

  await suppressEmail(email, "unsubscribed", "user", params.entityId);

  await logEvent({
    entity_id: params.entityId ?? 0,
    entity_type: "broker",
    channel: "email",
    event_type: "unsubscribed",
    metadata_json: { email },
    created_by: params.entityId ? "user" : "system",
  });

  return { processed: true };
}

export async function getEntityTimeline(entityId: number, entityType: string): Promise<OutreachEvent[]> {
  return db.select().from(outreachEvents)
    .where(and(
      eq(outreachEvents.entity_id, entityId),
      eq(outreachEvents.entity_type, entityType),
    ))
    .orderBy(desc(outreachEvents.created_at))
    .limit(200);
}

export async function getInboxHealth(): Promise<Array<{
  inbox: SenderInbox;
  sentToday: number;
  remainingToday: number;
  utilizationPct: number;
}>> {
  const allInboxes = await db.select().from(senderInboxes).orderBy(asc(senderInboxes.id));
  const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";

  const results = [];
  for (const inbox of allInboxes) {
    const sentToday = await getInboxDailySentCount(inbox.id, todayStart);
    results.push({
      inbox,
      sentToday,
      remainingToday: Math.max(0, inbox.daily_limit - sentToday),
      utilizationPct: inbox.daily_limit > 0 ? Math.round((sentToday / inbox.daily_limit) * 100) : 0,
    });
  }
  return results;
}
