import 'dotenv/config';
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 10000;

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "healthy" });
});

// Matches endpoint
app.get("/matches.json", async (req, res) => {
  try {
    const query = `
      query {
        allSeries(first: 5, orderBy: UPDATED_AT, orderDirection: DESC) {
          edges {
            node {
              id
              startTimeScheduled
              tournament { id name }
              teams { baseInfo { id name } }
              updatedAt
            }
          }
        }
      }
    `;

    const response = await fetch("https://api-op.grid.gg/central-data/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GRID_API_KEY}` // API key from env vars
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return res.status(500).json({ ok: false, errors: data.errors });
    }

    res.json({ ok: true, data: data.data });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
