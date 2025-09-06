import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/health", (req, res) => {
  res.json({ ok: true, status: "healthy" });
});

app.get("/matches.json", async (req, res) => {
  try {
    const query = `
      query {
        allSeries(first: 5, orderBy: UpdatedAt, orderDirection: DESC) {
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

    const response = await fetch("https://api-op.grid.gg/central-data/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GRID_API_KEY}`  // use env var
      },
      body: JSON.stringify({ query })
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
