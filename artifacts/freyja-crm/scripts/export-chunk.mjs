// Exports a chunk of SQLite rows as CSV to stdout
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlite = new Database(join(__dirname, "../data.db"), { readonly: true });

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

const offset = parseInt(process.argv[2] || "0");
const limit  = parseInt(process.argv[3] || "200000");

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const stmt = sqlite.prepare("SELECT * FROM brokers ORDER BY id LIMIT ? OFFSET ?");
const rows = stmt.all(limit, offset);

const lines = [];
for (const row of rows) {
  lines.push(columns.map(c => csvEscape(row[c])).join(','));
}

process.stdout.write(lines.join('\n'));
if (lines.length > 0) process.stdout.write('\n');

process.stderr.write(`${rows.length} rows\n`);
sqlite.close();
