import Fastify from "fastify";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SQLITE_PATH = process.env.SQLITE_PATH || "./strikes.db";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const PORT = Number(process.env.PORT || 3000);

function validHalfStepCount(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return false;
  const rounded = Math.round(n * 2) / 2;
  return Math.abs(n - rounded) < 1e-9;
}

function clampHalf(n) {
  return Math.max(0, Math.round(n * 2) / 2);
}

mkdirSync(dirname(SQLITE_PATH), { recursive: true });

const db = new Database(SQLITE_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    strike_count REAL NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO app_state (id, strike_count) VALUES (1, 0);
`);

const getStmt = db.prepare("SELECT strike_count AS count FROM app_state WHERE id = 1");
const putStmt = db.prepare("UPDATE app_state SET strike_count = ? WHERE id = 1");

const app = Fastify({ logger: true });

app.get("/api/strikes", async () => {
  const row = getStmt.get();
  return { count: row.count };
});

app.put("/api/strikes", async (request, reply) => {
  if (!ADMIN_TOKEN) {
    return reply.code(503).send({ error: "Server not configured with ADMIN_TOKEN" });
  }
  const auth = request.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== ADMIN_TOKEN) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const body = request.body;
  if (typeof body !== "object" || body === null || typeof body.count !== "number") {
    return reply.code(400).send({ error: "Body must be { count: number }" });
  }
  if (!validHalfStepCount(body.count)) {
    return reply.code(400).send({ error: "count must be a non-negative multiple of 0.5" });
  }
  const next = clampHalf(body.count);
  putStmt.run(next);
  return { count: next };
});

await app.listen({ port: PORT, host: "0.0.0.0" });
