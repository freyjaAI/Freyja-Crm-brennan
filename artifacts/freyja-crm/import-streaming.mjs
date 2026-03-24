/**
 * Streaming CSV import using PapaParse's streaming mode.
 * Properly handles multiline quoted fields, Windows line endings, etc.
 * Uses better-sqlite3 prepared statements + transactions for max insert speed.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
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

let batch = [];
const BATCH_SIZE = 10000;
let totalImported = 0;
const now = new Date().toISOString();
const startTime = Date.now();

function getVal(row, col) {
  const val = row[col];
  if (val === undefined || val === null || val === "") return null;
  const trimmed = String(val).trim();
  return trimmed === "" ? null : trimmed;
}

function processRow(row) {
  const record = [
    getVal(row, "full_name") || "Unknown",
    getVal(row, "first_name"),
    getVal(row, "last_name"),
    getVal(row, "email"),
    getVal(row, "email_secondary"),
    getVal(row, "phone"),
    getVal(row, "mobile"),
    getVal(row, "fax"),
    getVal(row, "office_name"),
    getVal(row, "job_title"),
    getVal(row, "address"),
    getVal(row, "city"),
    getVal(row, "state"),
    getVal(row, "zip_code"),
    getVal(row, "license_number"),
    getVal(row, "website"),
    getVal(row, "profile_url"),
    getVal(row, "photo_url"),
    getVal(row, "experience_years"),
    getVal(row, "description"),
    getVal(row, "languages"),
    getVal(row, "specialties"),
    getVal(row, "for_sale_count"),
    getVal(row, "recently_sold_count"),
    getVal(row, "average_price"),
    getVal(row, "social_media"),
    getVal(row, "source_file"),
    getVal(row, "source_type"),
    now,
  ];

  batch.push(record);

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

// Use PapaParse streaming mode — reads chunks from the file stream, never loads entire file
const fileStream = fs.createReadStream(CSV_PATH);

await new Promise((resolve, reject) => {
  Papa.parse(fileStream, {
    header: true,
    skipEmptyLines: true,
    step: (results) => {
      if (results.data) {
        processRow(results.data);
      }
    },
    complete: () => {
      // Insert remaining batch
      if (batch.length > 0) {
        insertMany(batch);
        totalImported += batch.length;
      }
      resolve();
    },
    error: (err) => {
      reject(err);
    },
  });
});

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nImport complete: ${totalImported.toLocaleString()} brokers imported in ${totalTime}s.`);

// Verify
const countResult = sqlite.prepare("SELECT COUNT(*) as cnt FROM brokers").get();
console.log(`Database count: ${countResult.cnt.toLocaleString()}`);

const stateCount = sqlite.prepare("SELECT COUNT(DISTINCT state) as cnt FROM brokers WHERE state IS NOT NULL").get();
console.log(`Unique states: ${stateCount.cnt}`);

const nullState = sqlite.prepare("SELECT COUNT(*) as cnt FROM brokers WHERE state IS NULL").get();
console.log(`Null state records: ${nullState.cnt.toLocaleString()}`);

const topStates = sqlite.prepare("SELECT state, COUNT(*) as cnt FROM brokers WHERE state IS NOT NULL GROUP BY state ORDER BY cnt DESC LIMIT 10").all();
console.log("Top 10 states:");
for (const s of topStates) {
  console.log(`  ${s.state}: ${s.cnt.toLocaleString()}`);
}

const srcTypes = sqlite.prepare("SELECT source_type, COUNT(*) as cnt FROM brokers GROUP BY source_type ORDER BY cnt DESC LIMIT 10").all();
console.log("Source types:");
for (const s of srcTypes) {
  console.log(`  ${s.source_type || "NULL"}: ${s.cnt.toLocaleString()}`);
}

sqlite.close();
console.log("Done.");
