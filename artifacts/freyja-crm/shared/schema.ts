import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
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
