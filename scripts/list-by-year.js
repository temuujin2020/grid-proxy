// scripts/list-by-year.js
import fs from "fs";

// Load the data
const data = JSON.parse(fs.readFileSync("../tournaments.json", "utf8"));

// Get year from command line (e.g. node list-by-year.js 2023)
const year = process.argv[2];
if (!year || !/^\d{4}$/.test(year)) {
  console.error("❌ Please provide a year, e.g.: node list-by-year.js 2023");
  process.exit(1);
}

// Filter by year using the name (since start dates aren’t in your dump yet)
const results = data.items.filter(t => t.name.includes(year));

console.log(`Found ${results.length} tournaments in ${year}`);
for (const t of results.slice(0, 50)) {
  console.log(`${t.id}  ${t.name}`);
}
