app.get("/matches.json", async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);

    const query = `
      query($from: String!, $to: String!) {
        allSeries(
          first: 20
          orderBy: UpdatedAt
          orderDirection: DESC
          filter: {
            startTimeScheduled: {
              after: $from
              before: $to
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

    const variables = {
      from: today.toISOString(),
      to: tomorrow.toISOString()
    };

    const response = await fetch(process.env.GRID_SERIES_STATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [process.env.GRID_AUTH_HEADER_NAME]: process.env.GRID_AUTH_HEADER_VALUE,
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
