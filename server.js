import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// ===== Config =====
const app = express();
const PORT = process.env.PORT || 10000;

// GRID auth/header (works with x-api-key or whatever your tenant uses)
const ENDPOINT = process.env.GRID_SERIES_STATE_URL || 'https://api-op.grid.gg/central-data/graphql';
const AUTH_HEADER_NAME = process.env.GRID_AUTH_HEADER_NAME || 'x-api-key';
const AUTH_HEADER_VALUE = process.env.GRID_AUTH_HEADER_VALUE;
if (!AUTH_HEADER_VALUE) {
  console.error('Missing GRID_AUTH_HEADER_VALUE in environment');
  process.exit(1);
}

app.use(cors());

// ===== Helpers =====
const iso = d => new Date(d).toISOString();

async function gql(query, variables = {}) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [AUTH_HEADER_NAME]: AUTH_HEADER_VALUE,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await r.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const SERIES_FIELDS = `
  id
  startTimeScheduled
  updatedAt
  format { id }
  tournament { id name }
  teams { baseInfo { id name } }
`;

// ===== Keep your simple routes =====
app.get('/', (_req, res) => {
  res.type('text').send('grid-proxy: ok');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, message: 'healthy', url: ENDPOINT, headerName: AUTH_HEADER_NAME });
});

app.get('/matches.json', async (_req, res) => {
  try {
    const query = `
      query {
        allSeries(first: 5, orderBy: UPDATED_AT, orderDirection: DESC) {
          edges { node { ${SERIES_FIELDS} } }
        }
      }
    `;
    const data = await gql(query);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ===== NEW: Upcoming within next N hours =====
app.get('/api/series/upcoming', async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(Number(req.query.hours || 24), 72));
    const now = new Date();
    const to = new Date(now.getTime() + hours * 3600_000);

    const query = `
      query Upcoming($first: Int!, $from: String!, $to: String!) {
        allSeries(
          first: $first,
          orderBy: UPDATED_AT,
          orderDirection: DESC,
          filter: { startTimeScheduled: { from: $from, to: $to } }
        ) {
          totalCount
          edges { node { ${SERIES_FIELDS} } }
        }
      }
    `;

    const data = await gql(query, { first: 50, from: iso(now), to: iso(to) });
    const items = (data.allSeries?.edges || []).map(({ node: n }) => ({
      id: n.id,
      time: n.startTimeScheduled,
      event: n.tournament?.name || '',
      format: n.format?.id || '',
      teams: (n.teams || []).map(t => t?.baseInfo?.name || '').filter(Boolean),
    }));

    res.json({ ok: true, strategy: 'scheduledWindow', count: items.length, items, windowHours: hours, asOf: iso(now) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// ===== NEW: Live now (try live flag, else fallback to +/-2h) =====
app.get('/api/series/live', async (_req, res) => {
  const now = new Date();

  const queryLive = `
    query LiveNow($first: Int!) {
      allSeries(
        first: $first,
        orderBy: UPDATED_AT,
        orderDirection: DESC,
        filter: { live: { isLive: true } }
      ) {
        edges { node { ${SERIES_FIELDS} } }
      }
    }
  `;

  const queryNearNow = `
    query NearNow($first: Int!, $from: String!, $to: String!) {
      allSeries(
        first: $first,
        orderBy: UPDATED_AT,
        orderDirection: DESC,
        filter: { startTimeScheduled: { from: $from, to: $to } }
      ) {
        edges { node { ${SERIES_FIELDS} } }
      }
    }
  `;

  try {
    // Strategy A: real live flag (if supported on your tenant)
    try {
      const live = await gql(queryLive, { first: 50 });
      const edges = live.allSeries?.edges || [];
      const items = edges.map(({ node: n }) => ({
        id: n.id,
        time: n.startTimeScheduled,
        event: n.tournament?.name || '',
        format: n.format?.id || '',
        teams: (n.teams || []).map(t => t?.baseInfo?.name || '').filter(Boolean),
      }));
      return res.json({ ok: true, strategy: 'liveFilter', count: items.length, items, asOf: iso(now) });
    } catch {
      // fall back if live filter isn’t available
    }

    // Strategy B: time window around now
    const from = new Date(now.getTime() - 2 * 3600_000);
    const to = new Date(now.getTime() + 2 * 3600_000);
    const win = await gql(queryNearNow, { first: 50, from: iso(from), to: iso(to) });
    const edges2 = win.allSeries?.edges || [];
    const items2 = edges2.map(({ node: n }) => ({
      id: n.id,
      time: n.startTimeScheduled,
      event: n.tournament?.name || '',
      format: n.format?.id || '',
      teams: (n.teams || []).map(t => t?.baseInfo?.name || '').filter(Boolean),
    }));
    res.json({ ok: true, strategy: 'timeWindow', count: items2.length, items: items2, asOf: iso(now) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
