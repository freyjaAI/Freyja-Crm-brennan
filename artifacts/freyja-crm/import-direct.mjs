/**
 * Direct streaming CSV import into SQLite for 2.6M+ broker records.
 * Uses better-sqlite3 raw prepared statements + transactions for max speed.
 * Bypasses Drizzle ORM overhead entirely.
 */
import Database from "better-sqlite3";
import fs from "fs";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = process.argv[2] || "/home/user/workspace/brokers_consolidated.csv";
const DB_PATH = path.resolve(__dirname, "data.db");

console.log(`Importing from: ${CSV_PATH}`);
console.log(`Database: ${DB_PATH}`);

if (!fs.existsSync(CSV_PATH)) {
  console.error(`File not found: ${CSV_PATH}`);
  process.exit(1);
}

// Parse a CSV line handling quoted fields
function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = OFF");
sqlite.pragma("cache_size = -64000");
sqlite.pragma("temp_store = MEMORY");

// Clear existing data
console.log("Clearing existing broker data...");
sqlite.exec("DELETE FROM brokers");

// Prepare insert statement
const insertStmt = sqlite.prepare(`
  INSERT INTO brokers (
    full_name, first_name, last_name, email, email_secondary,
    phone, mobile, fax, office_name, job_title,
    address, city, state, zip_code, license_number,
    website, profile_url, photo_url, experience_years, description,
    languages, specialties, for_sale_count, recently_sold_count, average_price,
    social_media, source_file, source_type,
    outreach_status, assigned_to, notes, last_contacted_at, created_at
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    'not_contacted', NULL, NULL, NULL, ?
  )
`);

const insertMany = sqlite.transaction((rows) => {
  for (const row of rows) {
    insertStmt.run(...row);
  }
});

// Read CSV with streaming
const fileStream = fs.createReadStream(CSV_PATH, { encoding: "utf-8" });
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});

let headers = null;
const headerMap = {};
let batch = [];
const BATCH_SIZE = 10000;
let totalImported = 0;
const now = new Date().toISOString();
const startTime = Date.now();

for await (const line of rl) {
  if (!headers) {
    headers = parseCSVLine(line);
    headers.forEach((h, i) => {
      headerMap[h.trim()] = i;
    });
    continue;
  }

  if (line.trim() === "") continue;

  const fields = parseCSVLine(line);

  const get = (col) => {
    const idx = headerMap[col];
    if (idx === undefined) return null;
    const val = fields[idx]?.trim();
    return val && val !== "" ? val : null;
  };

  const row = [
    get("full_name") || "Unknown",
    get("first_name"),
    get("last_name"),
    get("email"),
    get("email_secondary"),
    get("phone"),
    get("mobile"),
    get("fax"),
    get("office_name"),
    get("job_title"),
    get("address"),
    get("city"),
    get("state"),
    get("zip_code"),
    get("license_number"),
    get("website"),
    get("profile_url"),
    get("photo_url"),
    get("experience_years"),
    get("description"),
    get("languages"),
    get("specialties"),
    get("for_sale_count"),
    get("recently_sold_count"),
    get("average_price"),
    get("social_media"),
    get("source_file"),
    get("source_type"),
    now,
  ];

  batch.push(row);

  if (batch.length >= BATCH_SIZE) {
    insertMany(batch);
    totalImported += batch.length;
    if (totalImported % 100000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${totalImported.toLocaleString()} records imported (${elapsed}s elapsed)...`);
    }
    batch = [];
  }
}

// Insert remaining
if (batch.length > 0) {
  insertMany(batch);
  totalImported += batch.length;
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nImport complete: ${totalImported.toLocaleString()} brokers imported in ${totalTime}s.`);

// Verify count
const countResult = sqlite.prepare("SELECT COUNT(*) as cnt FROM brokers").get();
console.log(`Database count: ${countResult.cnt.toLocaleString()}`);

// Show sample stats
const stateCount = sqlite.prepare("SELECT COUNT(DISTINCT state) as cnt FROM brokers WHERE state IS NOT NULL").get();
console.log(`Unique states: ${stateCount.cnt}`);

const topStates = sqlite.prepare("SELECT state, COUNT(*) as cnt FROM brokers WHERE state IS NOT NULL GROUP BY state ORDER BY cnt DESC LIMIT 5").all();
console.log("Top 5 states:");
for (const s of topStates) {
  console.log(`  ${s.state}: ${s.cnt.toLocaleString()}`);
}

sqlite.close();
console.log("Done.");
