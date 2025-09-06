import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/matches.json", async (req, res) => {
  try {
    const response = await fetch(process.env.GRID_SERIES_STATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [process.env.GRID_AUTH_HEADER_NAME || "authorization"]:
          process.env.GRID_AUTH_HEADER_VALUE || `Bearer ${process.env.GRID_API_KEY}`,
      },
      body: JSON.stringify({
        query: `
          query UpcomingMatches($from: String!, $to: String!) {
            allSeries(
              filter: { startTimeScheduled: { from: $from, to: $to } }
              orderBy: StartTimeScheduled
              orderDirection: asc
              first: 20
            ) {
              edges {
                node {
                  id
                  startTimeScheduled
                  tournament { id name }
                  teams { baseInfo { id name } }
                }
              }
              totalCount
            }
          }
        `,
        variables: {
          from: new Date().toISOString(),
          to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      }),
    });

    const json = await response.json();
    res.json(json.data.allSeries.edges.map(e => e.node));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
