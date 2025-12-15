import express from "express";
import cors from "cors";
import { getCombinedItems } from "./osrsClient";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "osrs-trading-tools-backend" });
});

app.get("/api/items", async (_req, res) => {
  try {
    const items = await getCombinedItems();
    res.json({ items });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(502).json({ error: "Failed to fetch OSRS prices" });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});



