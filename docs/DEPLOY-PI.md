# Deploy on Raspberry Pi

Target layout on the Pi (example):

```text
/opt/docker/projects/victorStrikesBack/
├── docker-compose.yml
├── .env                 # you create this (not in git)
├── api/
├── web/
├── src/
└── ...
```

## 1. Prerequisites on the Pi

SSH in as your user (e.g. `ssh david@192.168.10.116`).

Install Docker if needed (Debian/Raspberry Pi OS):

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in (or `newgrp docker`) so `docker` works without `sudo`.

## 2. Get the project onto the Pi

**Option A — Git clone** (if the repo is on GitHub/GitLab):

```bash
sudo mkdir -p /opt/docker/projects
sudo chown "$USER:$USER" /opt/docker/projects
cd /opt/docker/projects
git clone <YOUR_REPO_URL> victorStrikesBack
cd victorStrikesBack
```

**Option B — Copy from your Mac** (repo on your laptop):

```bash
# On your Mac, from the project root (adjust user/host/path)
rsync -avz --exclude node_modules --exclude dist --exclude .git \
  ./ david@192.168.10.116:/opt/docker/projects/victorStrikesBack/
```

Then on the Pi:

```bash
cd /opt/docker/projects/victorStrikesBack
```

## 3. Create `.env` with bootstrap credentials for David

On the Pi, in the same folder as `docker-compose.yml`:

```bash
cd /opt/docker/projects/victorStrikesBack
cp .env.example .env
nano .env   # or vim
```

Set **first-boot only** variables (used when the SQLite database has **no users** yet):

```env
BOOTSTRAP_DAVID_USERNAME=david
BOOTSTRAP_DAVID_PASSWORD=use-a-strong-unique-password
```

Pick a strong password (you can generate random bytes with `openssl rand -base64 24`). After the first deploy, log in on the website as David and create **Victor** and at least one **mediator** under **Controls → Add user**. You can remove or rotate `BOOTSTRAP_DAVID_PASSWORD` from `.env` later if you prefer (new databases on empty volumes would need bootstrap again).

**Migrating from the old `ADMIN_TOKEN`-only setup:** the API no longer uses `ADMIN_TOKEN`. If you have an existing `strikes.db` with data but no `users` table, back up the volume, set bootstrap env, redeploy, then log in and recreate accounts. For a clean start you can remove the old volume: `docker compose down -v` (this **deletes** stored strikes).

## 4. Build and start

```bash
docker compose up -d --build
```

Check:

```bash
docker compose ps
docker compose logs -f --tail=50
```

## 5. Open the app

From another machine on the LAN:

`http://<PI_IP>:8080`

Example: `http://192.168.10.116:8080`

In the app: **Log in** as David (or Victor / a mediator). David uses **Controls** to change strikes (with a required explanation) and to create other users.

### Where the SQLite files live on disk

Inside the API container, the database is `/data/strikes.db` (plus WAL sidecar files). Those files are **not** in your git checkout; they are stored in the **named Docker volume** `strikes-data` from `docker-compose.yml`.

On the Pi, Docker keeps that volume under its data root, usually:

`/var/lib/docker/volumes/<compose_project>_strikes-data/_data/`

The compose project name defaults to the **folder name** of the project (e.g. `victorstrikesback_strikes-data`). To see the exact path:

```bash
cd /opt/docker/projects/victorStrikesBack
docker volume ls | grep strikes
docker volume inspect "$(docker volume ls -q | grep strikes-data)" --format '{{ .Mountpoint }}'
```

You normally **do not** edit files there by hand; use backups (`docker run` with a volume mount, or `docker cp`) if you need a copy. Removing the volume (`docker compose down -v`) **deletes** this data.

### Safe reset of the database (fresh start)

**Do not** delete `strikes.db` (or WAL files) under `/var/lib/docker/volumes/.../_data` while the **api** container is running — SQLite may corrupt or behave oddly. Prefer one of these:

**Option A — let Compose remove the volume (simplest)**

```bash
cd /opt/docker/projects/victorStrikesBack
docker compose down -v    # -v removes the strikes-data volume and its contents
```

Ensure `.env` has `BOOTSTRAP_DAVID_USERNAME` and `BOOTSTRAP_DAVID_PASSWORD`, then:

```bash
docker compose up -d --build
```

On first API start with an empty DB, David is created from those variables.

**Option B — stop first, then delete files**

```bash
docker compose down
# now safe to remove files in the volume’s _data folder, or use `docker volume rm ...` after down
```

Then `docker compose up -d` again.

## 6. Firewall (if enabled)

If `ufw` is on:

```bash
sudo ufw allow 8080/tcp comment 'victor strikes'
sudo ufw reload
```

## 7. Updates after you change code

**If you use auto-deploy (section 8):** push to `main` or `master` on GitHub; the Pi runner pulls and rebuilds for you.

**Manual update** on the Pi:

```bash
cd /opt/docker/projects/victorStrikesBack
git pull
docker compose up -d --build
```

Or `rsync` again, then `docker compose up -d --build` on the Pi.

## 8. Auto-deploy with a self-hosted GitHub Actions runner

GitHub’s cloud runners cannot reach a Pi on a private LAN. A **[self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners)** on the Pi runs the deploy job locally after each push.

### One-time setup

1. On the Pi, ensure the project is a **git clone** at `/opt/docker/projects/victorStrikesBack` (same path as above), with `.env` present. The clone’s `origin` must point at this GitHub repo.
2. The Linux user that will run the runner must be in the **`docker`** group. If you already installed Docker before adding this user, run (replace `YOUR_USER` with the account that runs the runner — often your login user, e.g. `david`):

   ```bash
   sudo usermod -aG docker YOUR_USER
   ```

   Then **restart the runner** so it picks up the new group (logging out is not enough for a systemd service):

   ```bash
   # If you used GitHub’s install script as a service (common):
   sudo systemctl restart actions.runner.*

   # Or from the runner folder:
   sudo ./svc.sh stop && sudo ./svc.sh start
   ```

   If you only use `./run.sh` in a terminal, stop it and start it again in a **new** SSH session (or run `newgrp docker` once in that shell before `./run.sh`).

   **Symptom:** `permission denied while trying to connect to the Docker daemon socket` during `docker compose` in Actions — almost always means the runner user is **not** in group `docker` or the runner was not restarted after `usermod`.

3. In GitHub: repo **Settings → Actions → Runners → New self-hosted runner**. Choose Linux and arm64 (Raspberry Pi), then run the download and `config.sh` commands **on the Pi**. When asked for labels, you can add `pi` (optional); the workflow uses `runs-on: self-hosted` only, so any self-hosted runner for this repo will pick up the job.
4. Start the runner: `./run.sh` (or install as a service per GitHub’s instructions so it survives reboot).

### What the workflow does

The workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs on **push** to **`main`** or **`master`** (and can be run manually via **Actions → Deploy to Raspberry Pi → Run workflow**). It:

1. **Fails early** if `/opt/docker/projects/victorStrikesBack/.env` is missing (so you don’t deploy with no bootstrap credentials on a fresh DB).
2. `cd` to `/opt/docker/projects/victorStrikesBack`
3. `git fetch` and `git reset --hard` to match the branch that triggered the run (`origin/main` or `origin/master`)
4. `docker compose up -d --build`

The workflow does **not** set `BOOTSTRAP_DAVID_*` or any API secrets — those must come from **`.env` on the Pi** (see section 3). GitHub repo secrets are not used unless you extend the workflow yourself.

Your `.env` on the Pi is **not** overwritten; it stays next to `docker-compose.yml`.

### Custom deploy path

If the project lives elsewhere, edit `DEPLOY_PATH` in `.github/workflows/deploy.yml` to match.

### Private repository

Configure the Pi clone with SSH **deploy keys** or credentials so `git fetch` works without prompts. For a **public** repo, no extra git auth is needed.

### Security note

Anyone who can push to the tracked branches can trigger a deploy on the Pi. Restrict write access to the repo and keep the runner machine trusted.

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| `permission denied` … `docker.sock` (Actions runner) | `sudo usermod -aG docker <runner-user>`, then `sudo systemctl restart actions.runner.*` (see section 8) |
| `permission denied` on Docker (your shell) | `sudo usermod -aG docker $USER` and open a new SSH session |
| Port 8080 in use | Change `8080:80` in `docker-compose.yml` to e.g. `8888:80` |
| No David user / wrong password | Set `BOOTSTRAP_DAVID_*` for first boot on an empty DB, or log in with an existing David account |
| Build fails on Pi (memory) | Build on a PC with `docker buildx build --platform linux/arm64` and load images, or add swap on the Pi |

Strike data lives in the Docker volume `strikes-data` (SQLite under `/data` in the API container). It survives container rebuilds unless you remove the volume.
