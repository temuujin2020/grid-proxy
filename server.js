// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 10000;

const GRID_URL = process.env.GRID_SERIES_STATE_URL || "https://api-op.grid.gg/central-data/graphql";
const API_KEY  = process.env.GRID_API_KEY;

// allow both header styles:
//   - Authorization: Bearer <key>
//   - x-auth-key: <key>
const AUTH_HEADER_NAME  = process.env.GRID_AUTH_HEADER_NAME || "authorization";
const AUTH_HEADER_VALUE = process.env.GRID_AUTH_HEADER_VALUE || (API_KEY ? `Bearer ${API_KEY}` : "");

const UPCOMING_QUERY = `
  query UpcomingSeries($from: String!, $to: String!, $first: Int!) {
    allSeries(
      first: $first
      orderBy: StartTimeScheduled
      orderDirection: ASC
      filter: { startTimeScheduled: { gte: $from, lte: $to } }
    ) {
      edges {
        node {
          id
          startTimeScheduled
          tournament { id name }
          format { id }
          teams { baseInfo { id name } }
        }
      }
      totalCount
    }
  }
`;

function isoUTC(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function gql(query, variables) {
  const headers = { "content-type": "application/json" };
  if (AUTH_HEADER_VALUE) headers[AUTH_HEADER_NAME] = AUTH_HEADER_VALUE;
  if (!AUTH_HEADER_VALUE && API_KEY) headers["x-auth-key"] = API_KEY; // fallback

  const res = await fetch(GRID_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    // surface the error for easier debugging
    throw new Error(
      JSON.stringify({ status: res.status, errors: json.errors, body: json }, null, 2)
    );
  }
  return json.data;
}

function toCard(node) {
  const t1 = node.teams?.[0]?.baseInfo || {};
  const t2 = node.teams?.[1]?.baseInfo || {};
  return {
    id: node.id,
    eventName: node.tournament?.name || "",
    format: node.format?.id ? `BO${node.format.id}` : "",
    time: node.startTimeScheduled ? new Date(node.startTimeScheduled) : null,
    t1Name: t1.name || "",
    t2Name: t2.name || "",
    live: false, s1: "", s2: "", map: "",
  };
}

app.get("/", (_req, res) => {
  res.send("OK – use /health or /matches.json");
});

app.get("/health", async (_req, res) => {
  try {
    const now = new Date();
    const to  = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const data = await gql(UPCOMING_QUERY, { from: isoUTC(now), to: isoUTC(to), first: 5 });
    res.json({ ok: true, sample: data.allSeries?.totalCount ?? 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/matches.json", async (req, res) => {
  try {
    const hours = Number(req.query.hours || 24);
    const first = Number(req.query.first || 50);
    const now = new Date();
    const to  = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const data = await gql(UPCOMING_QUERY, { from: isoUTC(now), to: isoUTC(to), first });
    const edges = data.allSeries?.edges || [];
    const list  = edges.map(e => toCard(e.node));

    res.setHeader("Cache-Control", "no-store");
    res.json(list);
  } catch (e) {
    // return the GraphQL error details to the browser
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => console.log("GRID proxy listening on :" + PORT));
