import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve paths relative to this script, not the current working dir
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const inputPath = path.join(projectRoot, "tournaments.json");

const year = process.argv[2];
if (!year || !/^\d{4}$/.test(year)) {
  console.error("Usage: node scripts/export-by-year-csv.js 2023");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const rows = data.items
  .filter(t => t.name.includes(year))
  .map(t => ({
    id: t.id,
    name: t.name,
    nameShortened: t.nameShortened || ""
  }));

// CSV escape helper
const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;

const csv = [
  "id,name,nameShortened",
  ...rows.map(r => [r.id, esc(r.name), esc(r.nameShortened)].join(","))
].join("\n");

const outPath = path.join(projectRoot, `tournaments_${year}.csv`);
fs.writeFileSync(outPath, csv);
console.log(`Wrote ${outPath} with ${rows.length} rows`);
