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

## 3. Create `.env` with a strong admin token

On the Pi, in the same folder as `docker-compose.yml`:

```bash
cd /opt/docker/projects/victorStrikesBack
cp .env.example .env
nano .env   # or vim
```

Set:

```env
ADMIN_TOKEN=paste-a-long-random-secret-here
```

Generate one on the Pi:

```bash
openssl rand -hex 32
```

Paste that value as `ADMIN_TOKEN=...` in `.env`. Save the file.

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

In the app: **Controls → Unlock to change strikes** and enter the same string as `ADMIN_TOKEN`.

## 6. Firewall (if enabled)

If `ufw` is on:

```bash
sudo ufw allow 8080/tcp comment 'victor strikes'
sudo ufw reload
```

## 7. Updates after you change code

On your Mac, push to git and on the Pi:

```bash
cd /opt/docker/projects/victorStrikesBack
git pull
docker compose up -d --build
```

Or `rsync` again, then `docker compose up -d --build` on the Pi.

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| `permission denied` on Docker | `sudo usermod -aG docker $USER` and re-login |
| Port 8080 in use | Change `8080:80` in `docker-compose.yml` to e.g. `8888:80` |
| `ADMIN_TOKEN` empty | `PUT` returns 503; set `ADMIN_TOKEN` in `.env` and `docker compose up -d` again |
| Build fails on Pi (memory) | Build on a PC with `docker buildx build --platform linux/arm64` and load images, or add swap on the Pi |

Strike data lives in the Docker volume `strikes-data` (SQLite under `/data` in the API container). It survives container rebuilds unless you remove the volume.
