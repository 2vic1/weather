<div dir="ltr">

[🇮🇷 فارسی](README.md) | English

</div>

<div align="center">

# 🌤 AsmanNegar (آسمان‌نگار)

**Comprehensive Weather & Atmospheric Monitoring Platform for Iran**

Interactive map with 9 weather layers, live satellite clouds, AI-powered analysis, and 596 Iranian cities — fully bilingual with RTL support

`Next.js 16` `TypeScript` `Leaflet` `Prisma` `Tailwind CSS 4`

</div>

---

## ✨ Features

- 🗺 **Interactive map of Iran** with 596 cities (31 provincial capitals + counties) and instant search
- 🌡 **9 map layers**: temperature, wind, clouds, precipitation, precipitation radar, forecast, dust, air quality & instability (CAPE)
- 🛰 **Live IR satellite clouds** — Meteosat/GOES imagery refreshed every 15 minutes
- ⏱ **Animated timeline** — play any layer through time
- 🎈 **Vertical atmospheric profiles** — temperature, wind & humidity across pressure levels from surface to stratosphere
- 🤖 **AI weather analysis** — multi-section intelligent analysis (optional, requires a Z.ai key)
- 🌙 **Dark/light mode** + fully responsive mobile UI

## 🗺 Layers & Data Sources

| Layer | Source | API Key | Notes |
|-------|--------|:-------:|-------|
| Temperature / Wind / Clouds / Precip / Forecast | [Open-Meteo](https://open-meteo.com) | ❌ | Forecast & analysis data |
| Precipitation radar | [RainViewer](https://www.rainviewer.com) | ❌ | Global radar, ~10 min latency |
| Live satellite clouds | RainViewer IR | ❌ | 12 frames @ 15-min intervals |
| Dust (Aerosol Index) | [NASA GIBS — OMPS](https://worldview.earthdata.nasa.gov) | ❌ | NASA tile service, ~1 day latency |
| Air quality (PM2.5, PM10, surface dust) | Open-Meteo Air Quality (CAMS) | ❌ | 40 urban points, refreshed every 15 min |
| Instability & thunderstorms (CAPE) | Open-Meteo | ❌ | Convective Available Potential Energy |
| AI analysis | [Z.ai](https://z.ai) | ✅ optional | Only for the AI analysis section |

> 💡 All core data comes from open, **key-free** APIs — everything works out of the box with zero configuration.

## 🧰 Prerequisites

- [Bun](https://bun.sh) ≥ 1.2 (or Node.js ≥ 20)
- Linux / macOS / Windows (WSL recommended)

## 🚀 Local Development

```bash
# 1) Clone
git clone https://github.com/2vic1/weather.git
cd weather

# 2) Install dependencies
bun install        # or: npm install

# 3) Create your env file
cp .env.example .env
# Point DATABASE_URL to the ABSOLUTE path of db/custom.db on your machine:
#   Linux/macOS: DATABASE_URL="file:/home/YOU/weather/db/custom.db"
#   Windows:     DATABASE_URL="file:C:/projects/weather/db/custom.db"

# 4) Generate the Prisma client
bun run db:generate

# 5) Start the dev server
bun run dev        # or: npm run dev
```

Open **http://localhost:3000**

> 💾 **The database ships pre-seeded!** `db/custom.db` contains all 596 cities and is committed to the repo — no seeding required.
> To rebuild it from scratch:
>
> ```bash
> bun run db:push
> bun prisma/seed.ts
> ```

### 🤖 Enabling AI analysis (optional)

Create a `.z-ai-config` file in the project root:

```json
{
  "baseUrl": "https://api.z.ai/api/paas/v4",
  "apiKey": "YOUR_Z_AI_API_KEY"
}
```

Without it, every other feature (layers, forecasts, satellite imagery…) keeps working perfectly.

## 🖥 Self-Hosting on Your Own Server (VPS)

### Option 1: Direct run

```bash
bun install
bun run db:generate
bun run build      # standalone output in .next/standalone
bun run start      # server on port 3000
```

<details>
<summary>🍏 Running with Node.js instead of Bun</summary>

```bash
npm install
npx prisma generate
npm run build
NODE_ENV=production node .next/standalone/server.js
```

</details>

> ⚠️ **Important:** in production, always set `DATABASE_URL` to an **absolute path**, because the standalone server runs from `.next/standalone`.

### Keep it running with systemd

Create `/etc/systemd/system/asmanegar.service`:

```ini
[Unit]
Description=AsmanNegar Weather App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/weather
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:/var/www/weather/db/custom.db
ExecStart=/usr/local/bin/bun .next/standalone/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now asmanegar
```

### Keep it running with PM2

```bash
npm i -g pm2
cd /var/www/weather
DATABASE_URL="file:/var/www/weather/db/custom.db" NODE_ENV=production pm2 start .next/standalone/server.js --name asmanegar
pm2 save && pm2 startup
```

### Behind Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name  your-domain.com;   # your domain

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then upgrade to HTTPS with certbot:

```bash
sudo certbot --nginx -d your-domain.com
```

### Option 2: Docker (easiest) 🐳

```bash
docker build -t asmanegar .
docker run -d --name asmanegar -p 3000:3000 --restart unless-stopped asmanegar
```

Or with Docker Compose — create `docker-compose.yml`:

```yaml
services:
  asmanegar:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
    volumes:
      - ./db:/app/db        # keep the database outside the container
```

```bash
docker compose up -d
```

> 🤖 To enable AI analysis in Docker, place `.z-ai-config` next to `docker-compose.yml` and mount it: `- ./.z-ai-config:/root/.z-ai-config:ro`

## ▲ Deploying to Vercel

1. **Import** the repo at [vercel.com/new](https://vercel.com/new) (Next.js is auto-detected)
2. Under **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `file:/var/task/db/custom.db` |

3. Hit **Deploy** — done! 🎉

> ⚠️ **Know Vercel's limits:**
> - SQLite on Vercel is **read-only** — fine for this app, since only the city list is read.
> - The AI analysis does **not** work on Vercel: the SDK reads the key from a `.z-ai-config` file, which can't be created at runtime. If AI matters to you, use a **VPS or Docker**.
> - Caching and scheduled jobs also work better on a VPS.

## 🛜 Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | ✅ | SQLite file path (absolute recommended) — see `.env.example` |
| `.z-ai-config` | ❌ | JSON file with `baseUrl` & `apiKey` for AI analysis |

## 📜 Scripts

| Command | Purpose |
|---------|---------|
| `bun run dev` | Dev server on port 3000 |
| `bun run build` | Production build (standalone) |
| `bun run start` | Run the built server |
| `bun run lint` | Lint the codebase |
| `bun run db:push` | Push the Prisma schema to the database |
| `bun run db:generate` | Generate the Prisma client |
| `bun prisma/seed.ts` | Seed all 596 Iranian cities |

## 💛 Donation | Support

If you find this project useful, please consider supporting me:

### 🪙 Crypto

| Network | Address |
|---------|---------|
| **Bitcoin (BTC)** | `bc1pj3dmcgpzf9d6vdm36tk2acx2xw9n5zgjljf9knaddpcmpvqsnw6sk3rfjh` |
| **Ethereum (ETH) / USDT (ERC20)** | `0xe5f078820f26eaf15f7c763c40fc5044270050ec` |
| **Tron (TRX) / USDT (TRC20)** | `TEaaV5RhYSWZs841dUxxYg5cVrUHteG3Rr` |

> 💡 For the lowest USDT transfer fees, use the **Tron (TRC20)** network.

### 💳 Other ways

- **GitHub Sponsors**: [github.com/sponsors/2vic1](https://github.com/sponsors/2vic1)

Thank you for your support! 🙏

---

<div align="center">

Made with ❤️ for Iran

📊 Data: Open-Meteo · NASA GIBS · RainViewer · CAMS

</div>
