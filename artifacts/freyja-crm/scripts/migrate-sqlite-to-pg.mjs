import Database from "better-sqlite3";
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "../data.db");

const sqlite = new Database(dbPath, { readonly: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const columns = [
  "full_name","first_name","last_name","email","email_secondary",
  "phone","mobile","fax","office_name","job_title","address","city",
  "state","zip_code","license_number","website","profile_url","photo_url",
  "experience_years","description","languages","specialties","for_sale_count",
  "recently_sold_count","average_price","social_media","source_file",
  "source_type","outreach_status","assigned_to","notes","last_contacted_at",
  "created_at","linkedin_url","linkedin_headline","linkedin_location",
  "linkedin_connections","linkedin_email_found","linkedin_enriched_at",
  "outreach_email_subject","outreach_email_body","outreach_linkedin_message",
  "outreach_generated_at"
];

// Keep batch small enough to stay under PostgreSQL's 65535 parameter limit
// 44 columns * 1000 rows = 44,000 params — safely under the limit
const BATCH = 1000;

const total = sqlite.prepare("SELECT COUNT(*) as c FROM brokers").get().c;
console.log(`Migrating ${total.toLocaleString()} records in batches of ${BATCH}...`);

// Check how many are already in postgres to allow resuming
const existing = (await pool.query("SELECT COUNT(*) as c FROM brokers")).rows[0].c;
console.log(`Already in PostgreSQL: ${Number(existing).toLocaleString()} — resuming from there`);

const selectBatch = sqlite.prepare("SELECT * FROM brokers ORDER BY id LIMIT ? OFFSET ?");
const colList = columns.join(",");

let offset = Number(existing);
let migrated = 0;
const start = Date.now();

while (offset < total) {
  const rows = selectBatch.all(BATCH, offset);
  if (rows.length === 0) break;

  const placeholders = rows.map((_, ri) =>
    `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(",")})`
  ).join(",");

  const values = rows.flatMap(r => columns.map(c => r[c] ?? null));

  await pool.query(
    `INSERT INTO brokers (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values
  );

  migrated += rows.length;
  offset += rows.length;

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  const totalDone = Number(existing) + migrated;
  const pct = ((totalDone / total) * 100).toFixed(1);
  process.stdout.write(`\r  ${totalDone.toLocaleString()} / ${total.toLocaleString()} (${pct}%) — ${elapsed}s`);
}

console.log(`\nDone. Migrated ${migrated.toLocaleString()} new records in ${((Date.now() - start) / 1000).toFixed(1)}s`);

sqlite.close();
await pool.end();
