import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

const SQLITE_PATH = process.env.SQLITE_PATH || "./strikes.db";
const PORT = Number(process.env.PORT || 3000);
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const BOOTSTRAP_USER = process.env.BOOTSTRAP_DAVID_USERNAME?.trim();
const BOOTSTRAP_PASS = process.env.BOOTSTRAP_DAVID_PASSWORD ?? "";
const COOKIE_NAME = "victor_session";

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
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('david', 'victor', 'mediator')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    strike_count REAL NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO app_state (id, strike_count) VALUES (1, 0);

  CREATE TABLE IF NOT EXISTS strike_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    previous_count REAL NOT NULL,
    new_count REAL NOT NULL,
    explanation TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_strike_history_created ON strike_history(created_at DESC);

  CREATE TABLE IF NOT EXISTS appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id INTEGER NOT NULL UNIQUE REFERENCES strike_history(id) ON DELETE CASCADE,
    victor_id INTEGER NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved_overturn', 'resolved_uphold')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS appeal_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appeal_id INTEGER NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
    mediator_id INTEGER NOT NULL REFERENCES users(id),
    vote TEXT NOT NULL CHECK (vote IN ('overturn', 'uphold')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(appeal_id, mediator_id)
  );
`);

const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
if (userCount === 0 && BOOTSTRAP_USER && BOOTSTRAP_PASS) {
  const hash = bcrypt.hashSync(BOOTSTRAP_PASS, 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'david')",
  ).run(BOOTSTRAP_USER, hash);
}

const getCountStmt = db.prepare("SELECT strike_count AS count FROM app_state WHERE id = 1");
const putCountStmt = db.prepare("UPDATE app_state SET strike_count = ? WHERE id = 1");

const getUserBySessionStmt = db.prepare(`
  SELECT u.id, u.username, u.role
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > datetime('now')
`);

const deleteSessionStmt = db.prepare("DELETE FROM sessions WHERE token = ?");
const deleteUserSessionsStmt = db.prepare("DELETE FROM sessions WHERE user_id = ?");
const insertSessionStmt = db.prepare(
  "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, datetime('now', ?))",
);

function newSessionToken() {
  return randomBytes(32).toString("hex");
}

function sessionExpiresOffset() {
  return `+${SESSION_DAYS} days`;
}

function getSessionUser(request) {
  const token = request.cookies[COOKIE_NAME];
  if (!token) return null;
  return getUserBySessionStmt.get(token) ?? null;
}

function requireRole(user, roles) {
  return user && roles.includes(user.role);
}

const mediatorCountStmt = db.prepare(
  "SELECT COUNT(*) AS c FROM users WHERE role = 'mediator'",
);

function tryResolveAppeal(appealId) {
  const M = mediatorCountStmt.get().c;
  if (M === 0) return;

  const voted = db
    .prepare(
      "SELECT COUNT(DISTINCT mediator_id) AS c FROM appeal_votes WHERE appeal_id = ?",
    )
    .get(appealId).c;
  if (voted < M) return;

  const tallies = db
    .prepare(
      `SELECT vote, COUNT(*) AS c FROM appeal_votes WHERE appeal_id = ? GROUP BY vote`,
    )
    .all(appealId);
  let overturn = 0;
  let uphold = 0;
  for (const row of tallies) {
    if (row.vote === "overturn") overturn = row.c;
    if (row.vote === "uphold") uphold = row.c;
  }

  const appeal = db
    .prepare(
      `SELECT a.id, a.history_id, h.previous_count, h.new_count
       FROM appeals a
       JOIN strike_history h ON h.id = a.history_id
       WHERE a.id = ? AND a.status = 'open'`,
    )
    .get(appealId);
  if (!appeal) return;

  const david = db.prepare("SELECT id FROM users WHERE role = 'david' LIMIT 1").get();
  if (!david) return;
  const davidId = david.id;

  if (overturn > uphold) {
    const current = getCountStmt.get().count;
    const target = appeal.previous_count;
    putCountStmt.run(target);
    db.prepare(
      `INSERT INTO strike_history (previous_count, new_count, explanation, created_by)
       VALUES (?, ?, ?, ?)`,
    ).run(
      current,
      target,
      `Appeal #${appealId} approved by mediators (vote overturned the change).`,
      davidId,
    );
    db.prepare(
      `UPDATE appeals SET status = 'resolved_overturn', resolved_at = datetime('now') WHERE id = ?`,
    ).run(appealId);
  } else {
    db.prepare(
      `UPDATE appeals SET status = 'resolved_uphold', resolved_at = datetime('now') WHERE id = ?`,
    ).run(appealId);
  }
}

const app = Fastify({ logger: true });

await app.register(cookie, {
  hook: "onRequest",
  parseOptions: {},
});

await app.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

app.get("/api/strikes", async () => {
  const row = getCountStmt.get();
  return { count: row.count };
});

app.post("/api/auth/login", async (request, reply) => {
  const body = request.body;
  if (typeof body !== "object" || body === null) {
    return reply.code(400).send({ error: "Invalid body" });
  }
  const { username, password } = body;
  if (typeof username !== "string" || typeof password !== "string") {
    return reply.code(400).send({ error: "username and password required" });
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return reply.code(401).send({ error: "Invalid credentials" });
  }
  const token = newSessionToken();
  deleteUserSessionsStmt.run(user.id);
  insertSessionStmt.run(user.id, token, sessionExpiresOffset());
  reply.setCookie(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  return {
    user: { id: user.id, username: user.username, role: user.role },
  };
});

app.post("/api/auth/logout", async (request, reply) => {
  const token = request.cookies[COOKIE_NAME];
  if (token) deleteSessionStmt.run(token);
  reply.clearCookie(COOKIE_NAME, { path: "/" });
  return { ok: true };
});

app.get("/api/auth/me", async (request, reply) => {
  const user = getSessionUser(request);
  if (!user) return reply.code(401).send({ error: "Not logged in" });
  return { user };
});

app.get("/api/users", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["david"])) return reply.code(403).send({ error: "Forbidden" });
  const rows = db
    .prepare("SELECT id, username, role, created_at FROM users ORDER BY username")
    .all();
  return { users: rows };
});

app.post("/api/users", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["david"])) return reply.code(403).send({ error: "Forbidden" });
  const body = request.body;
  if (typeof body !== "object" || body === null) {
    return reply.code(400).send({ error: "Invalid body" });
  }
  const { username, password, role } = body;
  if (typeof username !== "string" || typeof password !== "string" || typeof role !== "string") {
    return reply.code(400).send({ error: "username, password, role required" });
  }
  if (!["victor", "mediator"].includes(role)) {
    return reply.code(400).send({ error: "role must be victor or mediator" });
  }
  if (password.length < 6) {
    return reply.code(400).send({ error: "password must be at least 6 characters" });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const r = db
      .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
      .run(username.trim(), hash, role);
    return {
      user: { id: Number(r.lastInsertRowid), username: username.trim(), role },
    };
  } catch {
    return reply.code(400).send({ error: "username taken" });
  }
});

app.put("/api/strikes", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["david"])) return reply.code(403).send({ error: "Forbidden" });
  const body = request.body;
  if (typeof body !== "object" || body === null) {
    return reply.code(400).send({ error: "Invalid body" });
  }
  const { count, explanation } = body;
  if (typeof count !== "number" || typeof explanation !== "string") {
    return reply.code(400).send({ error: "count and explanation required" });
  }
  const exp = explanation.trim();
  if (!exp) {
    return reply.code(400).send({ error: "explanation must not be empty" });
  }
  if (!validHalfStepCount(count)) {
    return reply.code(400).send({ error: "count must be a non-negative multiple of 0.5" });
  }
  const next = clampHalf(count);
  const prev = getCountStmt.get().count;
  if (prev === next) {
    return reply.code(400).send({ error: "no change" });
  }
  putCountStmt.run(next);
  db.prepare(
    `INSERT INTO strike_history (previous_count, new_count, explanation, created_by)
     VALUES (?, ?, ?, ?)`,
  ).run(prev, next, exp, user.id);
  return { count: next };
});

app.get("/api/history", async (request) => {
  const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
  const offset = Math.max(0, Number(request.query.offset) || 0);
  const rows = db
    .prepare(
      `SELECT h.id, h.previous_count, h.new_count, h.explanation, h.created_at,
              u.username AS actor_username,
              a.id AS appeal_id, a.status AS appeal_status, a.message AS appeal_message
       FROM strike_history h
       JOIN users u ON u.id = h.created_by
       LEFT JOIN appeals a ON a.history_id = h.id
       ORDER BY h.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
  return { entries: rows };
});

app.post("/api/history/:hid/appeals", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["victor"])) return reply.code(403).send({ error: "Forbidden" });
  const hid = Number(request.params.hid);
  const hist = db.prepare("SELECT id FROM strike_history WHERE id = ?").get(hid);
  if (!hist) return reply.code(404).send({ error: "history not found" });
  const existing = db.prepare("SELECT id FROM appeals WHERE history_id = ?").get(hid);
  if (existing) return reply.code(400).send({ error: "An appeal already exists for this entry" });
  const body = request.body;
  if (typeof body !== "object" || body === null || typeof body.message !== "string") {
    return reply.code(400).send({ error: "message required" });
  }
  const msg = body.message.trim();
  if (!msg) return reply.code(400).send({ error: "message must not be empty" });
  const r = db
    .prepare(
      `INSERT INTO appeals (history_id, victor_id, message, status) VALUES (?, ?, ?, 'open')`,
    )
    .run(hid, user.id, msg);
  return { appeal: { id: Number(r.lastInsertRowid), history_id: hid, status: "open" } };
});

app.get("/api/appeals", async (request, reply) => {
  const user = getSessionUser(request);
  if (!user) return reply.code(401).send({ error: "Not logged in" });

  if (user.role === "david") {
    const rows = db
      .prepare(
        `SELECT a.*, h.previous_count, h.new_count, h.explanation AS history_explanation,
                vu.username AS victor_username
         FROM appeals a
         JOIN strike_history h ON h.id = a.history_id
         JOIN users vu ON vu.id = a.victor_id
         ORDER BY a.id DESC`,
      )
      .all();
    return { appeals: rows };
  }

  if (user.role === "victor") {
    const rows = db
      .prepare(
        `SELECT a.*, h.previous_count, h.new_count, h.explanation AS history_explanation
         FROM appeals a
         JOIN strike_history h ON h.id = a.history_id
         WHERE a.victor_id = ?
         ORDER BY a.id DESC`,
      )
      .all(user.id);
    return { appeals: rows };
  }

  if (user.role === "mediator") {
    const rows = db
      .prepare(
        `SELECT a.*, h.previous_count, h.new_count, h.explanation AS history_explanation,
                vu.username AS victor_username,
                (SELECT COUNT(*) FROM appeal_votes av WHERE av.appeal_id = a.id) AS vote_count
         FROM appeals a
         JOIN strike_history h ON h.id = a.history_id
         JOIN users vu ON vu.id = a.victor_id
         WHERE a.status = 'open'
         ORDER BY a.id ASC`,
      )
      .all();
    return { appeals: rows, mediator_total: mediatorCountStmt.get().c };
  }

  return reply.code(403).send({ error: "Forbidden" });
});

app.post("/api/appeals/:aid/vote", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["mediator"])) return reply.code(403).send({ error: "Forbidden" });
  const aid = Number(request.params.aid);
  const appeal = db
    .prepare("SELECT id, status FROM appeals WHERE id = ?")
    .get(aid);
  if (!appeal) return reply.code(404).send({ error: "not found" });
  if (appeal.status !== "open") return reply.code(400).send({ error: "appeal is closed" });

  const body = request.body;
  if (typeof body !== "object" || body === null || typeof body.vote !== "string") {
    return reply.code(400).send({ error: "vote required" });
  }
  if (!["overturn", "uphold"].includes(body.vote)) {
    return reply.code(400).send({ error: "vote must be overturn or uphold" });
  }

  try {
    db.prepare(
      `INSERT INTO appeal_votes (appeal_id, mediator_id, vote) VALUES (?, ?, ?)`,
    ).run(aid, user.id, body.vote);
  } catch {
    return reply.code(400).send({ error: "already voted" });
  }

  tryResolveAppeal(aid);
  return { ok: true };
});

await app.listen({ port: PORT, host: "0.0.0.0" });
