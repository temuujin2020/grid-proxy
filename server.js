app.get("/matches.json", async (req, res) => {
  try {
    const query = `
      query {
        allSeries(
          first: 5
          orderBy: UpdatedAt
          orderDirection: DESC
          filter: {
            startTimeScheduled: {
              after: "2025-09-06T00:00:00Z"
              before: "2025-09-08T00:00:00Z"
            }
          }
        ) {
          edges {
            node {
              id
              startTimeScheduled
              tournament { id name }
              teams { baseInfo { id name } }
            }
          }
        }
      }
    `;

    const response = await fetch(process.env.GRID_SERIES_STATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [process.env.GRID_AUTH_HEADER_NAME]: process.env.GRID_AUTH_HEADER_VALUE,
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
