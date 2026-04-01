# Victor's Strike Counter

A lightweight, cartoon-styled web app that tracks disciplinary **strikes** for Victor. The count is stored in a **Fastify + SQLite** API so **everyone sees the same number**. **David** (admin) stages a count change with +/− buttons and confirms it with a required reason; changes appear in **history**. **Victor** can **appeal** a history entry; **mediators** vote, and as soon as one side reaches a majority the appeal is resolved; unresolved appeals expire after 24 h defaulting to **uphold**.

## Features

- **Shared count** — One canonical strike total for all visitors.
- **Roles** — `david` (change strikes, manage users: create/edit/remove Victor/mediator accounts), `victor` (appeals, max 2 open simultaneously), `mediator` (vote on appeals).
- **History** — Every strike change is logged with an explanation. Any logged-in user can add comments and one level of replies.
- **Appeals** — Victor submits one appeal per history row (max 2 open at once). Mediators vote **overturn** (revert the change) or **uphold** (keep it). Resolves as soon as one side reaches ≥ ⌈total mediators / 2⌉ votes. Expires after **24 h** defaulting to **Uphold**.
- **Input limits** — Explanations: 500 chars. Appeal messages: 1 000 chars. Comments: 1 000 chars.
- **Change password** — Every user can change their own password from the top bar (key icon).
- **Half strikes** — Steps of **0.5** or **1.0**; UI shows a clipped "half" Victor head for 0.5.
- **Timeout** — At **3.0+** strikes, a "VICTOR'S IN TIMEOUT!" banner appears.
- **Zero strikes** — Shows **good_victor.png** and *Victor, you're a good boy!*

## Tech stack

| Layer | Technology |
|--------|------------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide icons |
| Backend | Node.js 22, Fastify 5, better-sqlite3, bcryptjs, cookie sessions |
| Deploy | Docker Compose: **nginx** (static SPA + `/api` proxy) + **api** |

## Repository layout

```
├── api/                 # Fastify API + Dockerfile
├── web/                 # nginx.conf + Dockerfile for the SPA image
├── public/              # Static assets (Victor images, favicon)
├── src/                 # React app
├── docker-compose.yml
├── .env.example         # Bootstrap David + optional SESSION_DAYS
└── package.json
```

## Prerequisites

- **Node.js 22+** (local dev and frontend build)
- **Docker** + Docker Compose (Pi or server deploy)

## Local development

Run the **API** and **frontend** in two terminals.

### 1. API (terminal 1)

```bash
cd api
export BOOTSTRAP_DAVID_USERNAME=david
export BOOTSTRAP_DAVID_PASSWORD=your-local-password
export SQLITE_PATH=./strikes.db
npm install
npm start
```

On **first run** with an empty database, David is created from those env vars. Log in on the site as `david` / `your-local-password`, then use **Controls** to create **Victor** and **mediator** accounts.

Listens on **http://127.0.0.1:3000**.

### 2. Frontend (terminal 2)

```bash
npm install
npm run dev
```

Vite proxies **`/api`** to `http://127.0.0.1:3000`. Open the URL Vite prints (e.g. http://localhost:5173). Use **Log in** with David, Victor, or a mediator account.

### Scripts (frontend)

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with HMR and API proxy |
| `npm run build` | Typecheck + production bundle to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | ESLint |

## HTTP API (summary)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/strikes` | — | `{ count }` |
| `PUT` | `/api/strikes` | Session, role `david` | `{ count, explanation }` — staged change with reason |
| `GET` | `/api/history` | — | Paginated history |
| `POST` | `/api/auth/login` | — | `{ username, password }` → session cookie |
| `POST` | `/api/auth/logout` | Session | |
| `GET` | `/api/auth/me` | Session | |
| `POST` | `/api/auth/change-password` | Any logged-in user | `{ current_password, new_password }` — change own password |
| `GET` / `POST` | `/api/users` | David only | List / create users (`victor` or `mediator`) |
| `PATCH` | `/api/users/:id` | David only | Update password and/or role (`victor` \| `mediator`); cannot edit `david` accounts |
| `DELETE` | `/api/users/:id` | David only | Remove a Victor or mediator; cannot remove `david` or yourself |
| `POST` | `/api/history/:id/appeals` | Victor | `{ message }` — max 2 open appeals per Victor |
| `GET` | `/api/appeals` | David / Victor / Mediator | Role-specific lists |
| `GET` | `/api/appeals/:id` | David only | Full appeal + `votes[]` |
| `POST` | `/api/appeals/:id/vote` | Mediator | `{ vote: "overturn" \| "uphold" }` |
| `GET` | `/api/history/:id/comments` | Any logged-in user | List comments + replies |
| `POST` | `/api/history/:id/comments` | Any logged-in user | `{ body, parent_id? }` — replies flatten to depth 1 |

## Appeal vote semantics

| Vote | Meaning |
|------|---------|
| **Overturn** | Revert David's strike change (count goes back to the previous value) |
| **Uphold** | Keep David's strike change as-is |

An appeal resolves as soon as one side reaches ≥ ⌈mediator count / 2⌉ votes. If neither side reaches the threshold within **24 hours**, the appeal closes as **Upheld**.

## Deploy with Docker Compose (e.g. Raspberry Pi)

Step-by-step: **[docs/DEPLOY-PI.md](docs/DEPLOY-PI.md)** (includes GitHub Actions self-hosted runner).

1. Copy **`.env.example`** to **`.env`** next to `docker-compose.yml`.
2. Set **`BOOTSTRAP_DAVID_USERNAME`** and **`BOOTSTRAP_DAVID_PASSWORD`** for first boot (strong password).
3. `docker compose up -d --build`
4. Open **http://&lt;host-ip&gt;:8080**, log in as David, create Victor and at least one mediator.

SQLite lives in the Docker volume **`strikes-data`** (`/data/strikes.db` in the API container).

### Cross-build for ARM64 (Raspberry Pi from another machine)

```bash
docker buildx build --platform linux/arm64 -f api/Dockerfile -t victor-strikes-api ./api
docker buildx build --platform linux/arm64 -f web/Dockerfile -t victor-strikes-web .
```

### HTTPS / remote access

Use **Caddy**, **Traefik**, or **Cloudflare Tunnel** in front of the stack for TLS. Set **`NODE_ENV=production`** for the API (already in `docker-compose.yml`) so session cookies use the **Secure** flag when served over HTTPS.

## Security

- Passwords are hashed with **bcrypt**; sessions use an **httpOnly** cookie.
- All text inputs (appeals, comments, explanations) are length-capped server-side and trimmed.
- Do **not** commit `.env`. Anyone who can log in as David can change strikes and manage non-David user accounts; mediators collectively decide appeals.
- Suitable for a **trusted group**, not high-assurance scenarios.

## License

This project is **private** (see `package.json`). Add a license file if you open-source it later.
