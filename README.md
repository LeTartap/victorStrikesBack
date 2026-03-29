# Victor's Strike Counter

A lightweight, cartoon-styled web app that tracks disciplinary **strikes** for Victor. The count is stored in a **Fastify + SQLite** API so **everyone sees the same number**. **David** (admin) logs in to change strikes and must give a **reason** each time; changes appear in **history**. **Victor** can **appeal** a history entry; **mediators** vote, and if a majority vote to **overturn** after everyone has voted, the strike change is reverted.

## Features

- **Shared count** — One canonical strike total for all visitors.
- **Roles** — `david` (change strikes, create users), `victor` (appeals), `mediator` (vote on appeals).
- **History** — Every strike change is logged with an explanation.
- **Appeals** — Victor submits one appeal per history row; mediators vote **overturn** or **uphold**; when **all** mediators have voted, the side with more votes wins (ties uphold David’s change).
- **Half strikes** — Steps of **0.5** or **1.0**; UI shows a clipped “half” Victor head for 0.5.
- **Timeout** — At **3.0+** strikes, a “VICTOR'S IN TIMEOUT!” banner appears.
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
| `PUT` | `/api/strikes` | Session, role `david` | `{ count, explanation }` |
| `GET` | `/api/history` | — | Paginated history |
| `POST` | `/api/auth/login` | — | `{ username, password }` → session cookie |
| `POST` | `/api/auth/logout` | Session | |
| `GET` | `/api/auth/me` | Session | |
| `GET` / `POST` | `/api/users` | David only | List / create users (`victor` or `mediator`) |
| `POST` | `/api/history/:id/appeals` | Victor | `{ message }` |
| `GET` | `/api/appeals` | David / Victor / Mediator | Role-specific lists |
| `POST` | `/api/appeals/:id/vote` | Mediator | `{ vote: "overturn" \| "uphold" }` |

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
- Do **not** commit `.env`. Anyone who can log in as David can change strikes and create users; mediators collectively decide appeals.
- Suitable for a **trusted group**, not high-assurance scenarios.

## License

This project is **private** (see `package.json`). Add a license file if you open-source it later.
