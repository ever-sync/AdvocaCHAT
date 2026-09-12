import express from "express";
import { installBaileysRoutes } from "./baileys.js";

const app = express();
const port = Number(process.env.PORT) || 8080;
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));
await installBaileysRoutes(app);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.listen(port, "0.0.0.0", () => console.log(`[baileys] listening on :${port}`));
