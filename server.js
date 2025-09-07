// server.js
import 'dotenv/config';                 // <-- load .env locally
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 10000;

// ---- Build headers with flexible auth (Bearer/x-api-key/x-auth-key) ----
function authHeaders() {
  const h = { "content-type": "application/json" };
  const name  = process.env.GRID_AUTH_HEADER_NAME;
  const value = process.env.GRID_AUTH_HEADER_VALUE;
  const key   = process.env.GRID_API_KEY;

  if (name && value) {
    h[name] = value;                    // e.g. x-api-key: <key>  OR  x-auth-key: <key>
  } else if (key) {
    h["authorization"] = `Bearer ${key}`;
  }
  return h;
}

// ---- Minimal auth sanity check ----
async function gqlAuthPing() {
  const res = await fetch(process.env.GRID_SERIES_STATE_URL || "https://api-op.grid.gg/central-data/graphql", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query: "query { __typename }" })
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && !json.errors, status: res.status, json };
}

// ---- Upcoming (next 24h) query that matches YOUR schema ----
// Your schema supports: orderBy: StartTimeScheduled | UpdatedAt | ID  (note the casing)
const UPCOMING_QUERY = `
  query UpcomingSeries($from: String!, $to: String!, $first: Int!) {
    allSeries(
      first: $first
      orderBy: StartTimeScheduled
      orderDirection: ASC
      filter: { startTimeScheduled: { gte: $from, lte: $to } }
    ) {
      totalCount
      edges {
        node {
          id
          startTimeScheduled
          updatedAt
          tournament { id name }
          format { id }
          teams { baseInfo { id name } }
        }
      }
    }
  }
`;

function isoUTC(d) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }

async function gql(query, variables) {
  const url = process.env.GRID_SERIES_STATE_URL || "https://api-op.grid.gg/central-data/graphql";
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json().catch(() => ({}));

  // If GraphQL returns errors, surface them to the caller
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify({ status: res.status, errors: json.errors, body: json }, null, 2));
  }
  return json.data;
}

// Health endpoint tells you if auth is valid
app.get("/health", async (_req, res) => {
  try {
    // quick ping
    const ping = await gqlAuthPing();
    if (!ping.ok) return res.status(500).json({ ok: false, auth: ping });

    // tiny upcoming sample just to prove end-to-end
    const now = new Date();
    const to  = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const data = await gql(UPCOMING_QUERY, { from: isoUTC(now), to: isoUTC(to), first: 3 });
    res.json({ ok: true, auth: { ok: true }, sampleCount: data.allSeries?.totalCount ?? 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// JSON for your frontend
app.get("/matches.json", async (req, res) => {
  try {
    const hours = Number(req.query.hours || 24);
    const first = Number(req.query.first || 50);
    const now = new Date();
    const to  = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const data = await gql(UPCOMING_QUERY, { from: isoUTC(now), to: isoUTC(to), first });
    const edges = data.allSeries?.edges || [];

    // normalize a bit
    const out = edges.map(e => {
      const n = e.node;
      const t1 = n.teams?.[0]?.baseInfo?.name || "";
      const t2 = n.teams?.[1]?.baseInfo?.name || "";
      return {
        id: n.id,
        eventName: n.tournament?.name || "",
        format: n.format?.id ? `BO${n.format.id}` : "",
        time: n.startTimeScheduled,
        updatedAt: n.updatedAt,
        t1Name: t1,
        t2Name: t2,
        live: false, s1: "", s2: "", map: ""
      };
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(out);
  } catch (e) {
    // Return detailed error so you can see what's wrong in the browser
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/", (_req, res) => res.send("OK – use /health or /matches.json"));

app.listen(PORT, () => console.log(`GRID proxy listening on :${PORT}`));
