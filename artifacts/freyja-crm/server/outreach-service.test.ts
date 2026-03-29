import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import {
  brokers,
  senderInboxes,
  outreachSequences,
  outreachSequenceSteps,
  outreachEnrollments,
  outreachEvents,
  emailMessages,
  outreachSuppressions,
} from "@shared/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

let testBrokerId: number;
let testBrokerNoEmailId: number;
let testSequenceId: number;
let testInboxId: number;

async function cleanup() {
  await db.delete(emailMessages).where(eq(emailMessages.entity_id, testBrokerId));
  await db.delete(outreachEvents).where(eq(outreachEvents.entity_id, testBrokerId));
  await db.delete(outreachEnrollments).where(eq(outreachEnrollments.entity_id, testBrokerId));
  if (testBrokerNoEmailId) {
    await db.delete(outreachEnrollments).where(eq(outreachEnrollments.entity_id, testBrokerNoEmailId));
    await db.delete(outreachEvents).where(eq(outreachEvents.entity_id, testBrokerNoEmailId));
  }
  await db.delete(outreachSuppressions).where(eq(outreachSuppressions.email, "test-outreach@example.com"));
  await db.delete(outreachSuppressions).where(eq(outreachSuppressions.email, "suppressed-test@example.com"));
  if (testSequenceId) {
    await db.delete(outreachSequenceSteps).where(eq(outreachSequenceSteps.sequence_id, testSequenceId));
    await db.delete(outreachSequences).where(eq(outreachSequences.id, testSequenceId));
  }
  if (testInboxId) {
    await db.delete(senderInboxes).where(eq(senderInboxes.id, testInboxId));
  }
  if (testBrokerId) await db.delete(brokers).where(eq(brokers.id, testBrokerId));
  if (testBrokerNoEmailId) await db.delete(brokers).where(eq(brokers.id, testBrokerNoEmailId));
}

async function setup() {
  await cleanup();

  const [broker] = await db.insert(brokers).values({
    full_name: "Test Outreach Broker",
    first_name: "Test",
    last_name: "Broker",
    email: "test-outreach@example.com",
    office_name: "Test Realty",
    city: "Austin",
    state: "TX",
    outreach_status: "not_contacted",
    created_at: new Date().toISOString(),
  }).returning();
  testBrokerId = broker.id;

  const [brokerNoEmail] = await db.insert(brokers).values({
    full_name: "No Email Broker",
    first_name: "NoEmail",
    outreach_status: "not_contacted",
    created_at: new Date().toISOString(),
  }).returning();
  testBrokerNoEmailId = brokerNoEmail.id;

  const [inbox] = await db.insert(senderInboxes).values({
    user_id: "admin",
    label: "Test Inbox",
    email_address: "test-sender-outreach@freyja.biz",
    provider: "smtp",
    warmup_status: "warm",
    daily_limit: 5,
    active: true,
    created_at: new Date().toISOString(),
  }).returning();
  testInboxId = inbox.id;

  const [seq] = await db.insert(outreachSequences).values({
    name: "Test Sequence",
    channel_type: "email",
    target_entity_type: "broker",
    active: true,
    created_by: "admin",
    created_at: new Date().toISOString(),
  }).returning();
  testSequenceId = seq.id;

  await db.insert(outreachSequenceSteps).values([
    {
      sequence_id: testSequenceId,
      step_number: 1,
      step_type: "email",
      subject_template: "Hi {{first_name}}, quick question about {{company_name}}",
      body_template: "Hello {{broker_name}}, I noticed you work at {{office_name}} in {{city}}...",
      delay_days: 0,
      stop_on_reply: true,
      created_at: new Date().toISOString(),
    },
    {
      sequence_id: testSequenceId,
      step_number: 2,
      step_type: "email",
      subject_template: "Re: quick question about {{company_name}}",
      body_template: "Just following up, {{first_name}}...",
      delay_days: 3,
      stop_on_reply: true,
      created_at: new Date().toISOString(),
    },
  ]);
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

async function run() {
  const svc = await import("./outreach-service");

  console.log("\n=== Setup ===");
  await setup();
  console.log(`  Created broker ${testBrokerId}, sequence ${testSequenceId}, inbox ${testInboxId}`);

  console.log("\n=== Test: renderEmailTemplate ===");
  {
    const broker = (await db.select().from(brokers).where(eq(brokers.id, testBrokerId)))[0];
    const rendered = svc.renderEmailTemplate("Hi {{first_name}}, about {{company_name}} in {{city}}", broker);
    assert(rendered === "Hi Test, about Test Realty in Austin", `Template rendered: "${rendered}"`);

    const fallback = svc.renderEmailTemplate("Hi {{first_name}}, your {{average_price}} deals", broker);
    assert(fallback.includes("Hi Test"), "Fallback on missing fields works");
  }

  console.log("\n=== Test: enrollEntityInSequence ===");
  {
    const result = await svc.enrollEntityInSequence(testSequenceId, testBrokerId, "broker", testInboxId);
    assert(!result.error, `Enrolled successfully: ${JSON.stringify(result.enrollment?.id)}`);
    assert(result.enrollment?.status === "active", "Status is active");
    assert(result.enrollment?.current_step === 1, "Starts at step 1");
  }

  console.log("\n=== Test: duplicate enrollment blocked ===");
  {
    const result = await svc.enrollEntityInSequence(testSequenceId, testBrokerId, "broker");
    assert(!!result.error, `Duplicate blocked: ${result.error}`);
  }

  console.log("\n=== Test: no-email broker rejected ===");
  {
    const result = await svc.enrollEntityInSequence(testSequenceId, testBrokerNoEmailId, "broker");
    assert(!!result.error && result.error.includes("no email"), `No-email rejected: ${result.error}`);
  }

  console.log("\n=== Test: suppression blocks enrollment ===");
  {
    await svc.suppressEmail("suppressed-test@example.com", "manual", "user");
    const [suppBroker] = await db.insert(brokers).values({
      full_name: "Suppressed Broker",
      email: "suppressed-test@example.com",
      outreach_status: "not_contacted",
      created_at: new Date().toISOString(),
    }).returning();

    const result = await svc.enrollEntityInSequence(testSequenceId, suppBroker.id, "broker");
    assert(!!result.error && result.error.includes("suppressed"), `Suppressed email blocked: ${result.error}`);

    await db.delete(brokers).where(eq(brokers.id, suppBroker.id));
  }

  console.log("\n=== Test: getDueSequenceSteps ===");
  {
    const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
    const { due, skipped } = await svc.getDueSequenceSteps(futureDate);
    assert(due.length >= 1, `Found ${due.length} due step(s)`);
    if (due.length > 0) {
      assert(due[0].step.step_number === 1, "Step 1 is due");
      assert(due[0].entity.id === testBrokerId, "Correct entity");
    }
  }

  console.log("\n=== Test: sendDueEmails (via console service) ===");
  {
    const result = await svc.sendDueEmails(new Date(Date.now() + 86400000 * 2).toISOString());
    assert(result.sent >= 1, `Sent ${result.sent} email(s)`);
    assert(result.errors === 0, `No errors: ${result.errors}`);

    const enrollment = (await db.select().from(outreachEnrollments)
      .where(and(eq(outreachEnrollments.entity_id, testBrokerId), eq(outreachEnrollments.sequence_id, testSequenceId))))[0];
    assert(enrollment.current_step === 2, `Advanced to step 2 (got ${enrollment.current_step})`);
    assert(enrollment.last_sent_at !== null, "last_sent_at set");

    const msgs = await db.select().from(emailMessages).where(eq(emailMessages.entity_id, testBrokerId));
    assert(msgs.length >= 1, `Email message recorded (${msgs.length})`);
    assert(msgs[0].send_status === "sent", `Status is sent (${msgs[0].send_status})`);
  }

  console.log("\n=== Test: stopEnrollment ===");
  {
    const enrollments = await db.select().from(outreachEnrollments)
      .where(and(eq(outreachEnrollments.entity_id, testBrokerId), eq(outreachEnrollments.sequence_id, testSequenceId)));
    const result = await svc.stopEnrollment(enrollments[0].id, "manual");
    assert(!result.error, "Stopped successfully");
    assert(result.enrollment?.status === "completed", `Status: ${result.enrollment?.status}`);

    const again = await svc.stopEnrollment(enrollments[0].id, "manual");
    assert(!!again.error, `Re-stop blocked: ${again.error}`);
  }

  console.log("\n=== Test: processUnsubscribe ===");
  {
    const result = await svc.processUnsubscribe({ email: "test-outreach@example.com" });
    assert(result.processed, "Unsubscribe processed");

    const suppressed = await svc.isEmailSuppressed("test-outreach@example.com");
    assert(suppressed, "Email now suppressed");
  }

  console.log("\n=== Test: suppressEmail idempotent ===");
  {
    const first = await svc.suppressEmail("test-outreach@example.com", "manual", "user");
    const second = await svc.suppressEmail("test-outreach@example.com", "manual", "user");
    assert(first.id === second.id, "Idempotent suppression returns same record");
  }

  console.log("\n=== Test: inbox daily limit ===");
  {
    const lowLimitInbox = (await db.insert(senderInboxes).values({
      user_id: "admin",
      label: "Low Limit Inbox",
      email_address: "lowlimit-test@freyja.biz",
      provider: "smtp",
      daily_limit: 1,
      active: true,
      created_at: new Date().toISOString(),
    }).returning())[0];

    await db.insert(emailMessages).values({
      entity_id: testBrokerId,
      inbox_id: lowLimitInbox.id,
      send_status: "sent",
      sent_at: new Date().toISOString(),
      reply_status: "none",
      bounce_type: "none",
      created_at: new Date().toISOString(),
    });

    await db.delete(outreachSuppressions).where(eq(outreachSuppressions.email, "test-outreach@example.com"));

    const [newEnroll] = await db.insert(outreachEnrollments).values({
      sequence_id: testSequenceId,
      entity_id: testBrokerId,
      entity_type: "broker",
      inbox_id: lowLimitInbox.id,
      status: "active",
      current_step: 1,
      next_send_at: new Date(Date.now() - 60000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).returning();

    const { due, skipped } = await svc.getDueSequenceSteps();
    const thisSkipped = skipped.find(s => s.enrollmentId === newEnroll.id);
    assert(
      !!thisSkipped && thisSkipped.reason === "inbox_daily_limit_reached",
      `Daily limit enforced: ${thisSkipped?.reason || "not found in skipped"}`
    );

    await db.delete(emailMessages).where(eq(emailMessages.inbox_id, lowLimitInbox.id));
    await db.delete(outreachEnrollments).where(eq(outreachEnrollments.id, newEnroll.id));
    await db.delete(senderInboxes).where(eq(senderInboxes.id, lowLimitInbox.id));
  }

  console.log("\n=== Test: getEntityTimeline ===");
  {
    const events = await svc.getEntityTimeline(testBrokerId, "broker");
    assert(events.length >= 2, `Timeline has ${events.length} events (enrolled + email_sent + ...)`);
    const types = events.map(e => e.event_type);
    assert(types.includes("enrolled"), "Has enrolled event");
    assert(types.includes("email_sent"), "Has email_sent event");
  }

  console.log("\n=== Cleanup ===");
  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("Failures:");
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log(`${"=".repeat(50)}\n`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error("Test runner error:", err);
  await cleanup().catch(() => {});
  await pool.end();
  process.exit(1);
});
