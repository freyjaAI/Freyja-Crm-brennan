// Streams SQLite broker data as CSV to stdout with proper backpressure
import Database from "better-sqlite3";
import { Readable } from "stream";
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

const startOffset = parseInt(process.argv[2] || "0");

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const stmt = sqlite.prepare(`SELECT * FROM brokers ORDER BY id LIMIT -1 OFFSET ?`);
const iterator = stmt.iterate(startOffset);

let count = 0;

// Build a Readable that pulls from the SQLite iterator on demand
const readable = new Readable({
  read() {
    // Push up to 1000 rows per read() call to avoid blocking
    for (let i = 0; i < 1000; i++) {
      const { value: row, done } = iterator.next();
      if (done) {
        this.push(null); // end stream
        process.stderr.write(`\nExported ${count.toLocaleString()} rows\n`);
        sqlite.close();
        return;
      }
      this.push(columns.map(c => csvEscape(row[c])).join(',') + '\n');
      count++;
    }
  }
});

readable.pipe(process.stdout);
