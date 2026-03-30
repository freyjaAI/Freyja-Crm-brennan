import { pgTable, text, serial, integer, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const outreachStatusEnum = [
  "not_contacted",
  "contacted",
  "interested",
  "not_interested",
  "closed",
] as const;

export type OutreachStatus = (typeof outreachStatusEnum)[number];

export const outreachLogStatusEnum = [
  "contacted",
  "opened",
  "responded",
  "meeting_set",
  "closed",
  "no_response",
] as const;
export type OutreachLogStatus = (typeof outreachLogStatusEnum)[number];

export const outreachLogTypeEnum = ["linkedin", "email", "phone"] as const;
export type OutreachLogType = (typeof outreachLogTypeEnum)[number];

export const templateCategoryEnum = ["intro", "follow_up", "reconnect"] as const;
export type TemplateCategory = (typeof templateCategoryEnum)[number];

export const brokers = pgTable("brokers", {
  id: serial("id").primaryKey(),
  full_name: text("full_name").notNull(),
  first_name: text("first_name"),
  last_name: text("last_name"),
  email: text("email"),
  email_secondary: text("email_secondary"),
  phone: text("phone"),
  mobile: text("mobile"),
  fax: text("fax"),
  office_name: text("office_name"),
  job_title: text("job_title"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip_code: text("zip_code"),
  license_number: text("license_number"),
  website: text("website"),
  profile_url: text("profile_url"),
  photo_url: text("photo_url"),
  experience_years: text("experience_years"),
  description: text("description"),
  languages: text("languages"),
  specialties: text("specialties"),
  for_sale_count: text("for_sale_count"),
  recently_sold_count: text("recently_sold_count"),
  average_price: text("average_price"),
  social_media: text("social_media"),
  source_file: text("source_file"),
  source_type: text("source_type"),
  outreach_status: text("outreach_status").default("not_contacted"),
  assigned_to: text("assigned_to"),
  notes: text("notes"),
  last_contacted_at: text("last_contacted_at"),
  created_at: text("created_at"),
  linkedin_url: text("linkedin_url"),
  linkedin_headline: text("linkedin_headline"),
  linkedin_location: text("linkedin_location"),
  linkedin_connections: text("linkedin_connections"),
  linkedin_email_found: text("linkedin_email_found"),
  linkedin_enriched_at: text("linkedin_enriched_at"),
  outreach_email_subject: text("outreach_email_subject"),
  outreach_email_body: text("outreach_email_body"),
  outreach_linkedin_message: text("outreach_linkedin_message"),
  outreach_generated_at: text("outreach_generated_at"),
});

export const insertBrokerSchema = createInsertSchema(brokers).omit({
  id: true,
});

export const updateBrokerSchema = z.object({
  outreach_status: z.enum(outreachStatusEnum).optional(),
  assigned_to: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  last_contacted_at: z.string().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
});

export type InsertBroker = z.infer<typeof insertBrokerSchema>;
export type Broker = typeof brokers.$inferSelect;
export type UpdateBroker = z.infer<typeof updateBrokerSchema>;

export const filterPresets = pgTable("filter_presets", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull().default("admin"),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(),
  created_at: text("created_at"),
});

export type FilterPreset = typeof filterPresets.$inferSelect;
export type InsertFilterPreset = typeof filterPresets.$inferInsert;

export const outreachLog = pgTable("outreach_log", {
  id: serial("id").primaryKey(),
  broker_id: integer("broker_id").notNull(),
  outreach_type: text("outreach_type").notNull(),
  message_template_used: text("message_template_used"),
  status: text("status").notNull().default("contacted"),
  notes: text("notes"),
  created_at: text("created_at").notNull(),
  follow_up_date: text("follow_up_date"),
});

export const insertOutreachLogSchema = z.object({
  broker_id: z.number(),
  outreach_type: z.enum(outreachLogTypeEnum),
  message_template_used: z.string().optional().nullable(),
  status: z.enum(outreachLogStatusEnum).default("contacted"),
  notes: z.string().optional().nullable(),
  follow_up_date: z.string().optional().nullable(),
});

export const updateOutreachLogSchema = z.object({
  status: z.enum(outreachLogStatusEnum).optional(),
  notes: z.string().optional().nullable(),
  follow_up_date: z.string().optional().nullable(),
});

export type OutreachLog = typeof outreachLog.$inferSelect;
export type InsertOutreachLog = z.infer<typeof insertOutreachLogSchema>;
export type UpdateOutreachLog = z.infer<typeof updateOutreachLogSchema>;

export const messageTemplates = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject"),
  category: text("category").notNull(),
  body_text: text("body_text").notNull(),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

export const insertMessageTemplateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().optional().nullable(),
  category: z.enum(templateCategoryEnum),
  body_text: z.string().min(1),
});

export const updateMessageTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().optional().nullable(),
  category: z.enum(templateCategoryEnum).optional(),
  body_text: z.string().min(1).optional(),
});

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;
export type UpdateMessageTemplate = z.infer<typeof updateMessageTemplateSchema>;


export const warmupStatusEnum = ["warming", "warm", "paused", "suspended"] as const;
export type WarmupStatus = (typeof warmupStatusEnum)[number];

export const emailProviderEnum = ["smtp", "google", "microsoft", "sendgrid", "ses"] as const;
export type EmailProvider = (typeof emailProviderEnum)[number];

export const senderInboxes = pgTable("sender_inboxes", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull().default("admin"),
  label: text("label").notNull(),
  email_address: text("email_address").notNull(),
  sending_domain: text("sending_domain"),
  provider: text("provider").notNull().default("smtp"),
  warmup_status: text("warmup_status").notNull().default("warming"),
  daily_limit: integer("daily_limit").notNull().default(50),
  active: boolean("active").notNull().default(true),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
}, (table) => [
  uniqueIndex("idx_sender_inboxes_email").on(table.email_address),
  index("idx_sender_inboxes_user_id").on(table.user_id),
]);

export const insertSenderInboxSchema = z.object({
  user_id: z.string().default("admin"),
  label: z.string().min(1),
  email_address: z.string().email(),
  sending_domain: z.string().optional().nullable(),
  provider: z.enum(emailProviderEnum).default("smtp"),
  warmup_status: z.enum(warmupStatusEnum).default("warming"),
  daily_limit: z.number().int().min(1).max(2000).default(50),
  active: z.boolean().default(true),
});

export const updateSenderInboxSchema = z.object({
  label: z.string().min(1).optional(),
  email_address: z.string().email().optional(),
  sending_domain: z.string().optional().nullable(),
  provider: z.enum(emailProviderEnum).optional(),
  warmup_status: z.enum(warmupStatusEnum).optional(),
  daily_limit: z.number().int().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});

export type SenderInbox = typeof senderInboxes.$inferSelect;
export type InsertSenderInbox = z.infer<typeof insertSenderInboxSchema>;
export type UpdateSenderInbox = z.infer<typeof updateSenderInboxSchema>;


export const channelTypeEnum = ["email", "linkedin", "multi"] as const;
export type ChannelType = (typeof channelTypeEnum)[number];

export const targetEntityTypeEnum = ["broker", "contact", "lead"] as const;
export type TargetEntityType = (typeof targetEntityTypeEnum)[number];

export const outreachSequences = pgTable("outreach_sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  channel_type: text("channel_type").notNull().default("email"),
  target_entity_type: text("target_entity_type").notNull().default("broker"),
  active: boolean("active").notNull().default(true),
  created_by: text("created_by").notNull().default("admin"),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
});

export const insertOutreachSequenceSchema = z.object({
  name: z.string().min(1),
  channel_type: z.enum(channelTypeEnum).default("email"),
  target_entity_type: z.enum(targetEntityTypeEnum).default("broker"),
  active: z.boolean().default(true),
  created_by: z.string().default("admin"),
});

export const updateOutreachSequenceSchema = z.object({
  name: z.string().min(1).optional(),
  channel_type: z.enum(channelTypeEnum).optional(),
  target_entity_type: z.enum(targetEntityTypeEnum).optional(),
  active: z.boolean().optional(),
});

export type OutreachSequence = typeof outreachSequences.$inferSelect;
export type InsertOutreachSequence = z.infer<typeof insertOutreachSequenceSchema>;
export type UpdateOutreachSequence = z.infer<typeof updateOutreachSequenceSchema>;


export const stepTypeEnum = ["email", "manual_task", "linkedin"] as const;
export type StepType = (typeof stepTypeEnum)[number];

export const outreachSequenceSteps = pgTable("outreach_sequence_steps", {
  id: serial("id").primaryKey(),
  sequence_id: integer("sequence_id").notNull(),
  step_number: integer("step_number").notNull(),
  step_type: text("step_type").notNull().default("email"),
  subject_template: text("subject_template"),
  body_template: text("body_template"),
  delay_days: integer("delay_days").notNull().default(0),
  stop_on_reply: boolean("stop_on_reply").notNull().default(true),
  created_at: text("created_at"),
}, (table) => [
  index("idx_sequence_steps_sequence_id").on(table.sequence_id),
  uniqueIndex("idx_sequence_steps_unique_order").on(table.sequence_id, table.step_number),
]);

export const insertOutreachSequenceStepSchema = z.object({
  sequence_id: z.number().int(),
  step_number: z.number().int().min(1),
  step_type: z.enum(stepTypeEnum).default("email"),
  subject_template: z.string().optional().nullable(),
  body_template: z.string().optional().nullable(),
  delay_days: z.number().int().min(0).default(0),
  stop_on_reply: z.boolean().default(true),
});

export const updateOutreachSequenceStepSchema = z.object({
  step_number: z.number().int().min(1).optional(),
  step_type: z.enum(stepTypeEnum).optional(),
  subject_template: z.string().optional().nullable(),
  body_template: z.string().optional().nullable(),
  delay_days: z.number().int().min(0).optional(),
  stop_on_reply: z.boolean().optional(),
});

export type OutreachSequenceStep = typeof outreachSequenceSteps.$inferSelect;
export type InsertOutreachSequenceStep = z.infer<typeof insertOutreachSequenceStepSchema>;
export type UpdateOutreachSequenceStep = z.infer<typeof updateOutreachSequenceStepSchema>;


export const enrollmentStatusEnum = [
  "active",
  "paused",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "failed",
] as const;
export type EnrollmentStatus = (typeof enrollmentStatusEnum)[number];

export const outreachEnrollments = pgTable("outreach_enrollments", {
  id: serial("id").primaryKey(),
  sequence_id: integer("sequence_id").notNull(),
  entity_id: integer("entity_id").notNull(),
  entity_type: text("entity_type").notNull().default("broker"),
  inbox_id: integer("inbox_id"),
  priority: integer("priority").notNull().default(0),
  status: text("status").notNull().default("active"),
  current_step: integer("current_step").notNull().default(1),
  next_send_at: text("next_send_at"),
  last_sent_at: text("last_sent_at"),
  reply_detected_at: text("reply_detected_at"),
  created_at: text("created_at"),
  updated_at: text("updated_at"),
}, (table) => [
  index("idx_enrollments_sequence_id").on(table.sequence_id),
  index("idx_enrollments_entity").on(table.entity_id, table.entity_type),
  index("idx_enrollments_next_send").on(table.next_send_at),
  index("idx_enrollments_status").on(table.status),
  index("idx_enrollments_priority").on(table.priority),
]);

export const insertOutreachEnrollmentSchema = z.object({
  sequence_id: z.number().int(),
  entity_id: z.number().int(),
  entity_type: z.enum(targetEntityTypeEnum).default("broker"),
  inbox_id: z.number().int().optional().nullable(),
  priority: z.number().int().min(0).max(10).default(0),
  status: z.enum(enrollmentStatusEnum).default("active"),
  current_step: z.number().int().min(1).default(1),
  next_send_at: z.string().optional().nullable(),
});

export const updateOutreachEnrollmentSchema = z.object({
  inbox_id: z.number().int().optional().nullable(),
  priority: z.number().int().min(0).max(10).optional(),
  status: z.enum(enrollmentStatusEnum).optional(),
  current_step: z.number().int().min(1).optional(),
  next_send_at: z.string().optional().nullable(),
  last_sent_at: z.string().optional().nullable(),
  reply_detected_at: z.string().optional().nullable(),
});

export type OutreachEnrollment = typeof outreachEnrollments.$inferSelect;
export type InsertOutreachEnrollment = z.infer<typeof insertOutreachEnrollmentSchema>;
export type UpdateOutreachEnrollment = z.infer<typeof updateOutreachEnrollmentSchema>;


export const outreachEventTypeEnum = [
  "enrolled",
  "email_sent",
  "email_opened",
  "email_clicked",
  "email_replied",
  "email_bounced",
  "unsubscribed",
  "manual_task_completed",
  "linkedin_sent",
  "linkedin_replied",
  "status_changed",
  "note_added",
] as const;
export type OutreachEventType = (typeof outreachEventTypeEnum)[number];

export const outreachEventChannelEnum = ["email", "linkedin", "phone", "system"] as const;
export type OutreachEventChannel = (typeof outreachEventChannelEnum)[number];

export const outreachEvents = pgTable("outreach_events", {
  id: serial("id").primaryKey(),
  entity_id: integer("entity_id").notNull(),
  entity_type: text("entity_type").notNull().default("broker"),
  channel: text("channel").notNull(),
  event_type: text("event_type").notNull(),
  metadata_json: jsonb("metadata_json"),
  created_by: text("created_by").notNull().default("admin"),
  created_at: text("created_at"),
}, (table) => [
  index("idx_events_entity").on(table.entity_id, table.entity_type),
  index("idx_events_entity_timeline").on(table.entity_id, table.entity_type, table.created_at),
]);

export const insertOutreachEventSchema = z.object({
  entity_id: z.number().int(),
  entity_type: z.enum(targetEntityTypeEnum).default("broker"),
  channel: z.enum(outreachEventChannelEnum),
  event_type: z.enum(outreachEventTypeEnum),
  metadata_json: z.any().optional().nullable(),
  created_by: z.string().default("admin"),
});

export type OutreachEvent = typeof outreachEvents.$inferSelect;
export type InsertOutreachEvent = z.infer<typeof insertOutreachEventSchema>;


export const sendStatusEnum = ["queued", "sending", "sent", "failed", "cancelled"] as const;
export type SendStatus = (typeof sendStatusEnum)[number];

export const replyStatusEnum = ["none", "replied", "auto_reply"] as const;
export type ReplyStatus = (typeof replyStatusEnum)[number];

export const bounceTypeEnum = ["none", "soft", "hard"] as const;
export type BounceType = (typeof bounceTypeEnum)[number];

export const emailMessages = pgTable("email_messages", {
  id: serial("id").primaryKey(),
  enrollment_id: integer("enrollment_id"),
  entity_id: integer("entity_id").notNull(),
  inbox_id: integer("inbox_id"),
  provider_message_id: text("provider_message_id"),
  subject: text("subject"),
  body_rendered: text("body_rendered"),
  send_status: text("send_status").notNull().default("queued"),
  sent_at: text("sent_at"),
  reply_status: text("reply_status").notNull().default("none"),
  bounce_type: text("bounce_type").notNull().default("none"),
  created_at: text("created_at"),
}, (table) => [
  index("idx_email_messages_enrollment").on(table.enrollment_id),
  index("idx_email_messages_entity").on(table.entity_id),
  index("idx_email_messages_inbox").on(table.inbox_id),
  index("idx_email_messages_provider_msg").on(table.provider_message_id),
  index("idx_email_messages_status").on(table.send_status),
]);

export const insertEmailMessageSchema = z.object({
  enrollment_id: z.number().int().optional().nullable(),
  entity_id: z.number().int(),
  inbox_id: z.number().int().optional().nullable(),
  provider_message_id: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  body_rendered: z.string().optional().nullable(),
  send_status: z.enum(sendStatusEnum).default("queued"),
  sent_at: z.string().optional().nullable(),
  reply_status: z.enum(replyStatusEnum).default("none"),
  bounce_type: z.enum(bounceTypeEnum).default("none"),
});

export const updateEmailMessageSchema = z.object({
  provider_message_id: z.string().optional().nullable(),
  send_status: z.enum(sendStatusEnum).optional(),
  sent_at: z.string().optional().nullable(),
  reply_status: z.enum(replyStatusEnum).optional(),
  bounce_type: z.enum(bounceTypeEnum).optional(),
});

export type EmailMessage = typeof emailMessages.$inferSelect;
export type InsertEmailMessage = z.infer<typeof insertEmailMessageSchema>;
export type UpdateEmailMessage = z.infer<typeof updateEmailMessageSchema>;


export const suppressionReasonEnum = [
  "bounce_hard",
  "bounce_soft",
  "unsubscribed",
  "spam_complaint",
  "manual",
  "invalid_email",
] as const;
export type SuppressionReason = (typeof suppressionReasonEnum)[number];

export const suppressionSourceEnum = ["system", "user", "provider", "import"] as const;
export type SuppressionSource = (typeof suppressionSourceEnum)[number];

export const outreachSuppressions = pgTable("outreach_suppressions", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  entity_id: integer("entity_id"),
  reason: text("reason").notNull(),
  source: text("source").notNull().default("system"),
  created_at: text("created_at"),
}, (table) => [
  uniqueIndex("idx_suppressions_email").on(table.email),
  index("idx_suppressions_entity").on(table.entity_id),
]);

export const insertOutreachSuppressionSchema = z.object({
  email: z.string().email(),
  entity_id: z.number().int().optional().nullable(),
  reason: z.enum(suppressionReasonEnum),
  source: z.enum(suppressionSourceEnum).default("system"),
});

export type OutreachSuppression = typeof outreachSuppressions.$inferSelect;
export type InsertOutreachSuppression = z.infer<typeof insertOutreachSuppressionSchema>;
