// server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

// --- ENV (Render dashboard) ---
// GRID_AUTH_HEADER_NAME = x-api-key
// GRID_AUTH_HEADER_VALUE = <your key>
// GRID_SERIES_STATE_URL = https://api-op.grid.gg/central-data/graphql
const GRID_HEADER = process.env.GRID_AUTH_HEADER_NAME || "x-api-key";
const GRID_TOKEN  = process.env.GRID_AUTH_HEADER_VALUE;
const GRID_URL    = process.env.GRID_SERIES_STATE_URL;

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;

// small helper: get now -> now + N hours window
function getWindow(hours = 36) {
  const now = new Date();
  const to  = new Date(now.getTime() + Number(hours) * 60 * 60 * 1000);
  return { now, to };
}

// minimal root
app.get("/", (_req, res) => {
  res.type("text/plain").send("OK – use /health or /matches.json");
});

// health
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    message: "healthy",
    url: GRID_URL,
    headerName: GRID_HEADER,
  });
});

// main endpoint
app.get("/matches.json", async (req, res) => {
  try {
    const hours = Number(req.query.hours || 36); // allow ?hours=48 etc.
    const { now, to } = getWindow(hours);

    // NOTE: we avoid schema-specific DateTimeFilter confusion by
    // requesting a reasonable page and filtering server-side.
    const query = `
      query AllSeries($first: Int!, $orderBy: SeriesOrderBy!, $orderDirection: OrderDirection!) {
        allSeries(first: $first, orderBy: $orderBy, orderDirection: $orderDirection) {
          edges {
            node {
              id
              startTimeScheduled
              updatedAt
              format { id }
              tournament { id name }
              teams { baseInfo { id name } }
            }
          }
          totalCount
        }
      }
    `;

    const variables = {
      first: 100,                      // pull a page
      orderBy: "StartTimeScheduled",   // per your schema enum
      orderDirection: "ASC",
    };

    const resp = await fetch(GRID_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [GRID_HEADER]: GRID_TOKEN,     // e.g. { "x-api-key": "..."}
      },
      body: JSON.stringify({ query, variables }),
    });

    const body = await resp.json();

    // Pass through provider errors transparently
    if (body.errors) {
      return res.status(200).json({ ok: true, data: body, note: "Upstream returned errors" });
    }

    const edges = body?.data?.allSeries?.edges ?? [];
    const inWindow = edges
      .map(e => e.node)
      .filter(n => {
        const ts = new Date(n.startTimeScheduled);
        return ts >= now && ts <= to;
      });

    res.json({
      ok: true,
      windowHours: hours,
      count: inWindow.length,
      matches: inWindow,
      rawCount: edges.length,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
