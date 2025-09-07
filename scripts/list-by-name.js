// scripts/list-by-name.js
import fs from "fs";

const data = JSON.parse(fs.readFileSync("tournaments.json", "utf8"));
const q = (process.argv[2] || "").toLowerCase();

const results = data.items.filter(t =>
  t.name.toLowerCase().includes(q)
);

console.log(`Found ${results.length} tournaments containing "${q}"`);
for (const t of results.slice(0, 50)) {
  console.log(`${t.id}  ${t.name}`);
}
