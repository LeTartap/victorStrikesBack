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

// ── Input length limits ────────────────────────────────────────────────────
const MAX_APPEAL_LEN = 1000;
const MAX_COMMENT_LEN = 1000;
const MAX_EXPLANATION_LEN = 500;
const MAX_OPEN_APPEALS_PER_VICTOR = 2;
// Appeals expire 24 h after creation; resolved by threshold or default uphold.
const APPEAL_EXPIRY_HOURS = 24;

function trim(s, max) {
  return typeof s === "string" ? s.trim().slice(0, max) : s;
}

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
db.pragma("foreign_keys = ON");

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

  CREATE TABLE IF NOT EXISTS history_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id INTEGER NOT NULL REFERENCES strike_history(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES history_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_history_comments_hid ON history_comments(history_id);
`);

// ── One-time data cleanup: trim oversized existing texts ───────────────────
db.prepare(
  `UPDATE appeals SET message = substr(message, 1, ?) WHERE length(message) > ?`,
).run(MAX_APPEAL_LEN, MAX_APPEAL_LEN);
db.prepare(
  `UPDATE strike_history SET explanation = substr(explanation, 1, ?) WHERE length(explanation) > ?`,
).run(MAX_EXPLANATION_LEN, MAX_EXPLANATION_LEN);

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

// ── Appeal resolution ──────────────────────────────────────────────────────
// Resolves an open appeal if a side reaches the threshold (ceil(M/2)).
// Pass `reason` to log the cause of resolution (e.g. 'vote' or 'timeout').
function resolveAppeal(appealId, result /* 'overturn' | 'uphold' */, reason) {
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

  if (result === "overturn") {
    const current = getCountStmt.get().count;
    const target = appeal.previous_count;
    putCountStmt.run(target);
    db.prepare(
      `INSERT INTO strike_history (previous_count, new_count, explanation, created_by)
       VALUES (?, ?, ?, ?)`,
    ).run(
      current,
      target,
      `Appeal #${appealId} overturned by mediators (${reason}).`,
      david.id,
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

function tryResolveAppeal(appealId) {
  const M = mediatorCountStmt.get().c;
  if (M === 0) return;

  const threshold = Math.ceil(M / 2);

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

  if (overturn >= threshold) {
    resolveAppeal(appealId, "overturn", "majority vote");
  } else if (uphold >= threshold) {
    resolveAppeal(appealId, "uphold", "majority vote");
  }
  // Otherwise not enough votes yet; expiry will handle it later.
}

// Expire open appeals older than APPEAL_EXPIRY_HOURS → default uphold.
function expireStaleAppeals() {
  const stale = db
    .prepare(
      `SELECT id FROM appeals
       WHERE status = 'open'
         AND created_at <= datetime('now', ?)`,
    )
    .all(`-${APPEAL_EXPIRY_HOURS} hours`);
  for (const { id } of stale) {
    resolveAppeal(id, "uphold", `24h timeout — no majority reached`);
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
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

// Run expiry at most once per minute (lazy — no cron needed).
let lastExpiryCheck = 0;
app.addHook("onRequest", async () => {
  const now = Date.now();
  if (now - lastExpiryCheck >= 60_000) {
    lastExpiryCheck = now;
    expireStaleAppeals();
  }
});

// ── Strikes ────────────────────────────────────────────────────────────────

app.get("/api/strikes", async () => {
  const row = getCountStmt.get();
  return { count: row.count };
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
  const exp = trim(explanation, MAX_EXPLANATION_LEN);
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

// ── History ────────────────────────────────────────────────────────────────

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

// ── Auth ───────────────────────────────────────────────────────────────────

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

// Change own password — any authenticated role.
app.post("/api/auth/change-password", async (request, reply) => {
  const user = getSessionUser(request);
  if (!user) return reply.code(401).send({ error: "Not logged in" });
  const body = request.body;
  if (typeof body !== "object" || body === null) {
    return reply.code(400).send({ error: "Invalid body" });
  }
  const { current_password, new_password } = body;
  if (typeof current_password !== "string" || typeof new_password !== "string") {
    return reply.code(400).send({ error: "current_password and new_password required" });
  }
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  if (!row || !bcrypt.compareSync(current_password, row.password_hash)) {
    return reply.code(401).send({ error: "Current password is incorrect" });
  }
  if (new_password.length < 6) {
    return reply.code(400).send({ error: "new password must be at least 6 characters" });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
  return { ok: true };
});

// ── User management (David only) ───────────────────────────────────────────

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

app.patch("/api/users/:id", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["david"])) return reply.code(403).send({ error: "Forbidden" });
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Invalid id" });

  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);
  if (!target) return reply.code(404).send({ error: "Not found" });
  if (target.role === "david") return reply.code(403).send({ error: "Cannot edit David accounts" });

  const body = request.body;
  if (typeof body !== "object" || body === null) {
    return reply.code(400).send({ error: "Invalid body" });
  }
  const { password, role } = body;
  const updates = [];
  const vals = [];
  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 6) {
      return reply.code(400).send({ error: "password must be at least 6 characters" });
    }
    updates.push("password_hash = ?");
    vals.push(bcrypt.hashSync(password, 10));
  }
  if (role !== undefined) {
    if (typeof role !== "string" || !["victor", "mediator"].includes(role)) {
      return reply.code(400).send({ error: "role must be victor or mediator" });
    }
    updates.push("role = ?");
    vals.push(role);
  }
  if (updates.length === 0) return reply.code(400).send({ error: "password or role required" });
  vals.push(id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...vals);
  const row = db.prepare("SELECT id, username, role, created_at FROM users WHERE id = ?").get(id);
  return { user: row };
});

app.delete("/api/users/:id", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["david"])) return reply.code(403).send({ error: "Forbidden" });
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Invalid id" });
  if (id === user.id) return reply.code(400).send({ error: "Cannot delete your own account" });

  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);
  if (!target) return reply.code(404).send({ error: "Not found" });
  if (target.role === "david") return reply.code(403).send({ error: "Cannot delete David accounts" });

  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM appeal_votes WHERE appeal_id IN (SELECT id FROM appeals WHERE victor_id = ?)",
    ).run(id);
    db.prepare("DELETE FROM appeals WHERE victor_id = ?").run(id);
    db.prepare("DELETE FROM appeal_votes WHERE mediator_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  tx();
  return { ok: true };
});

// ── Appeals ────────────────────────────────────────────────────────────────

app.post("/api/history/:hid/appeals", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["victor"])) return reply.code(403).send({ error: "Forbidden" });
  const hid = Number(request.params.hid);
  const hist = db.prepare("SELECT id FROM strike_history WHERE id = ?").get(hid);
  if (!hist) return reply.code(404).send({ error: "history not found" });
  const existing = db.prepare("SELECT id FROM appeals WHERE history_id = ?").get(hid);
  if (existing) return reply.code(400).send({ error: "An appeal already exists for this entry" });

  // Max 2 simultaneous open appeals per victor.
  const openCount = db
    .prepare(`SELECT COUNT(*) AS c FROM appeals WHERE victor_id = ? AND status = 'open'`)
    .get(user.id).c;
  if (openCount >= MAX_OPEN_APPEALS_PER_VICTOR) {
    return reply.code(400).send({
      error: `You already have ${MAX_OPEN_APPEALS_PER_VICTOR} open appeals. Wait for one to resolve before submitting another.`,
    });
  }

  const body = request.body;
  if (typeof body !== "object" || body === null || typeof body.message !== "string") {
    return reply.code(400).send({ error: "message required" });
  }
  const msg = trim(body.message, MAX_APPEAL_LEN);
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
                vu.username AS victor_username,
                (SELECT COUNT(*) FROM appeal_votes av WHERE av.appeal_id = a.id) AS vote_count
         FROM appeals a
         JOIN strike_history h ON h.id = a.history_id
         JOIN users vu ON vu.id = a.victor_id
         ORDER BY a.id DESC`,
      )
      .all();
    return { appeals: rows, mediator_total: mediatorCountStmt.get().c };
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

app.get("/api/appeals/:id", async (request, reply) => {
  const user = getSessionUser(request);
  if (!requireRole(user, ["david"])) return reply.code(403).send({ error: "Forbidden" });
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Invalid id" });

  const appeal = db
    .prepare(
      `SELECT a.*, h.previous_count, h.new_count, h.explanation AS history_explanation,
              vu.username AS victor_username
       FROM appeals a
       JOIN strike_history h ON h.id = a.history_id
       JOIN users vu ON vu.id = a.victor_id
       WHERE a.id = ?`,
    )
    .get(id);
  if (!appeal) return reply.code(404).send({ error: "not found" });

  const votes = db
    .prepare(
      `SELECT u.username AS mediator_username, av.vote, av.created_at
       FROM appeal_votes av
       JOIN users u ON u.id = av.mediator_id
       WHERE av.appeal_id = ?
       ORDER BY av.created_at ASC`,
    )
    .all(id);

  return {
    appeal: { ...appeal, votes },
    mediator_total: mediatorCountStmt.get().c,
  };
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

// ── History comments ───────────────────────────────────────────────────────

app.get("/api/history/:hid/comments", async (request, reply) => {
  const hid = Number(request.params.hid);
  if (!Number.isInteger(hid) || hid <= 0) return reply.code(400).send({ error: "Invalid id" });

  const rows = db
    .prepare(
      `SELECT c.id, c.parent_id, c.body, c.created_at, u.username AS author_username, u.role AS author_role
       FROM history_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.history_id = ?
       ORDER BY c.created_at ASC`,
    )
    .all(hid);
  return { comments: rows };
});

app.post("/api/history/:hid/comments", async (request, reply) => {
  const user = getSessionUser(request);
  if (!user) return reply.code(401).send({ error: "Not logged in" });
  const hid = Number(request.params.hid);
  if (!Number.isInteger(hid) || hid <= 0) return reply.code(400).send({ error: "Invalid id" });

  const hist = db.prepare("SELECT id FROM strike_history WHERE id = ?").get(hid);
  if (!hist) return reply.code(404).send({ error: "history entry not found" });

  const threadCount = db
    .prepare("SELECT COUNT(*) AS c FROM history_comments WHERE history_id = ?")
    .get(hid).c;
  if (threadCount >= 50) {
    return reply.code(400).send({ error: "This thread has reached the maximum of 50 comments." });
  }

  const body = request.body;
  if (typeof body !== "object" || body === null || typeof body.body !== "string") {
    return reply.code(400).send({ error: "body required" });
  }
  const text = trim(body.body, MAX_COMMENT_LEN);
  if (!text) return reply.code(400).send({ error: "comment must not be empty" });

  // Flatten depth: if parent_id provided, resolve its real top-level parent.
  let parentId = null;
  if (body.parent_id != null) {
    const pid = Number(body.parent_id);
    if (!Number.isInteger(pid) || pid <= 0) {
      return reply.code(400).send({ error: "invalid parent_id" });
    }
    const parent = db
      .prepare("SELECT id, parent_id FROM history_comments WHERE id = ? AND history_id = ?")
      .get(pid, hid);
    if (!parent) return reply.code(404).send({ error: "parent comment not found" });
    // Always attach to the top-level ancestor (depth 1 max).
    parentId = parent.parent_id ?? parent.id;
  }

  const r = db
    .prepare(
      `INSERT INTO history_comments (history_id, author_id, parent_id, body) VALUES (?, ?, ?, ?)`,
    )
    .run(hid, user.id, parentId, text);

  const created = db
    .prepare(
      `SELECT c.id, c.parent_id, c.body, c.created_at, u.username AS author_username, u.role AS author_role
       FROM history_comments c JOIN users u ON u.id = c.author_id
       WHERE c.id = ?`,
    )
    .get(Number(r.lastInsertRowid));
  return { comment: created };
});

await app.listen({ port: PORT, host: "0.0.0.0" });
