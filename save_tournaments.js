// save_tournaments.js
import 'dotenv/config';
import fs from 'fs';

// ---- Config (you can tweak via .env or inline) ----
const ENDPOINT = process.env.GRID_SERIES_STATE_URL;
const AUTH_HEADER_NAME = process.env.GRID_AUTH_HEADER_NAME || 'x-api-key';
const AUTH_HEADER_VALUE = process.env.GRID_AUTH_HEADER_VALUE;

const PAGE_SIZE = Number(process.env.GRID_PAGE_SIZE || 50);       // GRID max is 50
const BASE_DELAY_MS = Number(process.env.GRID_DELAY_MS || 800);   // pause between pages
const RATE_LIMIT_DELAY_MS = Number(process.env.RATE_LIMIT_DELAY_MS || 8000); // wait when rate-limited

// ---- Guards ----
if (!ENDPOINT || !AUTH_HEADER_VALUE) {
  console.error('Missing API endpoint or auth key. Check your .env.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRateLimitError(err) {
  const msg = String(err?.message || '');
  return (
    msg.includes('ENHANCE_YOUR_CALM') ||
    msg.toLowerCase().includes('rate limit') ||
    msg.toLowerCase().includes('unavailable')
  );
}

// --- One page fetch ---
async function fetchPage(afterCursor) {
  const QUERY = `
    query TournamentsPage($first: Int!, $after: Cursor) {
      tournaments(first: $first, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        edges {
          cursor
          node {
            id
            name
            nameShortened
          }
        }
      }
    }
  `;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [AUTH_HEADER_NAME]: AUTH_HEADER_VALUE,
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { first: PAGE_SIZE, after: afterCursor || null },
    }),
  });

  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }
  return json.data.tournaments;
}

// --- Main with polite delay + simple retry on rate limit ---
async function main() {
  console.log('Starting tournaments dump from:', ENDPOINT);
  console.log(`PAGE_SIZE=${PAGE_SIZE}, BASE_DELAY_MS=${BASE_DELAY_MS}, RATE_LIMIT_DELAY_MS=${RATE_LIMIT_DELAY_MS}`);

  let after = null;
  let page = 0;
  const all = [];

  while (true) {
    page++;
    console.log(`Fetching page ${page} (after=${after ?? 'null'})...`);

    try {
      const data = await fetchPage(after);
      const nodes = data.edges.map(e => e.node);
      all.push(...nodes);
      console.log(`  +${nodes.length} items (total so far: ${all.length})`);

      if (!data.pageInfo.hasNextPage) {
        console.log('✅ No more pages.');
        break;
      }

      after = data.pageInfo.endCursor;

      // polite delay between pages
      await sleep(BASE_DELAY_MS);

    } catch (err) {
      if (isRateLimitError(err)) {
        console.log(`⏳ Rate limited. Waiting ${RATE_LIMIT_DELAY_MS} ms then retrying same page...`);
        // retry the same page/cursor after a pause
        page--; // keep page number the same on retry
        await sleep(RATE_LIMIT_DELAY_MS);
        continue;
      }
      console.error('FAILED:', err?.message || err);
      process.exit(1);
    }
  }

  const out = {
    exportedAt: new Date().toISOString(),
    count: all.length,
    items: all,
  };

  fs.writeFileSync('tournaments.json', JSON.stringify(out, null, 2));
  console.log(`✅ Done. Wrote ${all.length} tournaments to tournaments.json`);
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
