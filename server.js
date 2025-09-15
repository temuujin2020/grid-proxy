import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// ===== Config =====
const app = express();
const PORT = process.env.PORT || 10000;

// GRID endpoint + auth
const ENDPOINT = process.env.GRID_SERIES_STATE_URL || 'https://api-op.grid.gg/central-data/graphql';
const AUTH_HEADER_NAME = process.env.GRID_AUTH_HEADER_NAME || 'x-api-key';
const AUTH_HEADER_VALUE = process.env.GRID_AUTH_HEADER_VALUE;

// PandaScore API
const PANDASCORE_API = "https://api.pandascore.co";
const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

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
  format { id }
  tournament { id name }
  teams { baseInfo { id name } }
`;

// ===== Basic routes =====
app.get('/', (_req, res) => {
  res.type('text').send('grid-proxy: ok');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, message: 'healthy', url: ENDPOINT, headerName: AUTH_HEADER_NAME });
});

// Debug route: recent matches (simple + safe)
const MATCHES_QUERY = `
  query Matches {
    allSeries(first: 5) {
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
    }
  }
`;

app.get('/matches.json', async (_req, res) => {
  try {
    const data = await gql(MATCHES_QUERY);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Optional: see the exact query text we’re sending
app.get('/debug/matches-query', (_req, res) => {
  res.type('text/plain').send(MATCHES_QUERY);
});

// ===== Upcoming within next N hours =====
app.get('/api/series/upcoming', async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(Number(req.query.hours || 24), 72));
    const now = new Date();
    const to = new Date(now.getTime() + hours * 3600_000);

    const query = `
      query Upcoming($first: Int!, $from: String!, $to: String!) {
        allSeries(
          first: $first,
          filter: { startTimeScheduled: { gte: $from, lte: $to } }
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

    res.json({
      ok: true,
      strategy: 'scheduledWindow',
      count: items.length,
      items,
      windowHours: hours,
      asOf: iso(now),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// ===== Live now (try live flag, else fallback to +/-2h) =====
app.get('/api/series/live', async (_req, res) => {
  const now = new Date();

  const queryLive = `
    query LiveNow($first: Int!) {
      allSeries(
        first: $first,
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
        filter: { startTimeScheduled: { gte: $from, lte: $to } }
      ) {
        edges { node { ${SERIES_FIELDS} } }
      }
    }
  `;

  try {
    // Strategy A: live flag
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
      if (items.length > 0) {
        return res.json({ ok: true, strategy: 'liveFilter', count: items.length, items, asOf: iso(now) });
      }
    } catch { /* fall through */ }

    // Strategy B: time window +/- 2h
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

// ===== PandaScore API Routes =====
// CS2 matches
app.get('/api/cs2/live', async (req, res) => {
  try {
    if (!PANDASCORE_TOKEN) {
      return res.status(500).json({ error: 'PandaScore token not configured' });
    }
    const response = await fetch(`${PANDASCORE_API}/csgo/matches/running?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch CS2 live matches' });
  }
});

app.get('/api/cs2/upcoming', async (req, res) => {
  try {
    if (!PANDASCORE_TOKEN) {
      return res.status(500).json({ error: 'PandaScore token not configured' });
    }
    const response = await fetch(`${PANDASCORE_API}/csgo/matches/upcoming?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch CS2 upcoming matches' });
  }
});

// DOTA 2 matches
app.get('/api/dota2/live', async (req, res) => {
  try {
    if (!PANDASCORE_TOKEN) {
      return res.status(500).json({ error: 'PandaScore token not configured' });
    }
    const response = await fetch(`${PANDASCORE_API}/dota2/matches/running?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch DOTA 2 live matches' });
  }
});

app.get('/api/dota2/upcoming', async (req, res) => {
  try {
    if (!PANDASCORE_TOKEN) {
      return res.status(500).json({ error: 'PandaScore token not configured' });
    }
    const response = await fetch(`${PANDASCORE_API}/dota2/matches/upcoming?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch DOTA 2 upcoming matches' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
