import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 10000;

const GRID_URL = process.env.GRID_SERIES_STATE_URL;
const GRID_HEADER_NAME = process.env.GRID_AUTH_HEADER_NAME || 'x-api-key';
const GRID_HEADER_VALUE = process.env.GRID_AUTH_HEADER_VALUE;

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'healthy', url: GRID_URL, headerName: GRID_HEADER_NAME });
});

app.get('/matches.json', async (req, res) => {
  try {
    const query = `
      query ($first: Int!, $from: String!, $to: String!) {
        allSeries(
          first: $first,
          orderBy: UpdatedAt,
          orderDirection: DESC,
          filter: { startTimeScheduled: { from: $from, to: $to } }
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
        }
      }
    `;

    const now = new Date();
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const response = await fetch(GRID_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [GRID_HEADER_NAME]: GRID_HEADER_VALUE,
      },
      body: JSON.stringify({
        query,
        variables: {
          first: 20,
          from: now.toISOString(),
          to: to.toISOString(),
        },
      }),
    });

    const data = await response.json();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
