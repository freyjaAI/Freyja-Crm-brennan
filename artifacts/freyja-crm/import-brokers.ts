/**
 * Streaming CSV import for 2.6M+ broker records.
 * Uses readline + manual CSV parsing to avoid loading entire file into memory.
 * better-sqlite3 prepared statements in a transaction for max insert speed.
 */
import Database from "better-sqlite3";
import fs from "fs";
import readline from "readline";
import path from "path";

const CSV_PATH = process.argv[2] || "/home/user/workspace/brokers_consolidated.csv";
const DB_PATH = path.resolve(__dirname, "data.db");

console.log(`Importing from: ${CSV_PATH}`);
console.log(`Database: ${DB_PATH}`);

if (!fs.existsSync(CSV_PATH)) {
  console.error(`File not found: ${CSV_PATH}`);
  process.exit(1);
}

// Parse a CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
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

async function main() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = OFF");
  sqlite.pragma("cache_size = -64000"); // 64MB cache

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

  const insertMany = sqlite.transaction((rows: any[][]) => {
    for (const row of rows) {
      insertStmt.run(...row);
    }
  });

  // Read CSV header
  const fileStream = fs.createReadStream(CSV_PATH, { encoding: "utf-8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;
  let batch: any[][] = [];
  const BATCH_SIZE = 5000;
  let totalImported = 0;
  const now = new Date().toISOString();

  const headerMap: Record<string, number> = {};

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

    const get = (col: string): string | null => {
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
      now, // created_at
    ];

    batch.push(row);

    if (batch.length >= BATCH_SIZE) {
      insertMany(batch);
      totalImported += batch.length;
      if (totalImported % 100000 === 0 || totalImported === batch.length) {
        console.log(`  Imported ${totalImported.toLocaleString()} records...`);
      }
      batch = [];
    }
  }

  // Insert remaining
  if (batch.length > 0) {
    insertMany(batch);
    totalImported += batch.length;
  }

  console.log(`\nImport complete: ${totalImported.toLocaleString()} brokers imported.`);

  // Verify count
  const countResult = sqlite.prepare("SELECT COUNT(*) as cnt FROM brokers").get() as any;
  console.log(`Database count: ${countResult.cnt.toLocaleString()}`);

  sqlite.close();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
