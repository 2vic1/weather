<div dir="rtl">

🇬🇧 [English](README.en.md) | فارسی

</div>

<div align="center">

# 🌤 آسمان‌نگار

**سامانه جامع هواشناسی و رصد جوّ ایران**

نقشه تعاملی با ۹ لایه هواشناسی، ماهواره ابر زنده، تحلیل هوش مصنوعی و ۵۹۶ شهر ایران — کاملاً فارسی و راست‌چین

`Next.js 16` `TypeScript` `Leaflet` `Prisma` `Tailwind CSS 4`

</div>

---

## ✨ امکانات

- 🗺 **نقشه تعاملی ایران** با ۵۹۶ شهر (۳۱ مرکز استان + شهرستان‌ها) و جست‌وجوی سریع
- 🌡 **۹ لایه نقشه**: دما، باد، ابر، بارش، رادار بارش، پیش‌بینی، غبار، کیفیت هوا و ناپایداری (CAPE)
- 🛰 **ماهواره ابر زنده (IR)** — تصاویر Meteosat/GOES با به‌روزرسانی هر ۱۵ دقیقه
- ⏱ **خط زمانی متحرک** — پخش انیمیشن همه لایه‌ها در گذر زمان
- 🎈 **نیم‌رخ جوّی** — دما، باد و رطوبت در ترازهای فشاری از سطح تا استراتوسفر
- 🤖 **تحلیل هوشمند هوا** — تحلیل چندبخشی با هوش مصنوعی (اختیاری، نیاز به کلید Z.ai)
- 🌙 **حالت روشن/تاریک** + رابط کاملاً واکنش‌گرا برای موبایل

## 🗺 لایه‌ها و منابع داده

| لایه | منبع | کلید API | توضیح |
|------|------|:--------:|-------|
| دما / باد / ابر / بارش / پیش‌بینی | [Open-Meteo](https://open-meteo.com) | ❌ | داده پیش‌بینی و تحلیلی |
| رادار بارش | [RainViewer](https://www.rainviewer.com) | ❌ | رادار جهانی با تأخیر ~۱۰ دقیقه |
| ماهواره ابر زنده | RainViewer IR | ❌ | ۱۲ فریم ۱۵ دقیقه‌ای |
| غبار (شاخص آئروسل) | [NASA GIBS — OMPS](https://worldview.earthdata.nasa.gov) | ❌ | تایل‌های ماهواره‌ای ناسا با تأخیر ~۱ روز |
| کیفیت هوا (PM2.5، PM10، غبار سطحی) | Open-Meteo Air Quality (CAMS) | ❌ | ۴۰ نقطه شهری، هر ۱۵ دقیقه |
| ناپایداری و رعدوبرق (CAPE) | Open-Meteo | ❌ | انرژی فرکانس بالقوه همرفتی |
| تحلیل هوشمند | [Z.ai](https://z.ai) | ✅ اختیاری | فقط برای بخش تحلیل AI |

> 💡 تمام داده‌های اصلی از APIهای آزاد و **بدون کلید** دریافت می‌شوند؛ بدون هیچ تنظیمی کار می‌کنند.

## 🧰 پیش‌نیازها

- [Bun](https://bun.sh) ≥ 1.2 (یا Node.js ≥ 20)
- لینوکس / macOS / ویندوز (با WSL)

## 🚀 اجرای محلی (Local Development)

```bash
# ۱) کلون پروژه
git clone https://github.com/2vic1/weather.git
cd weather

# ۲) نصب وابستگی‌ها
bun install        # یا: npm install

# ۳) ساخت فایل محیطی
cp .env.example .env
# مسیر DATABASE_URL را به مسیر مطلقِ db/custom.db در سیستم خودتان تغییر دهید:
#   Linux/macOS: DATABASE_URL="file:/home/YOU/weather/db/custom.db"
#   Windows:     DATABASE_URL="file:C:/projects/weather/db/custom.db"

# ۴) ساخت کلاینت Prisma
bun run db:generate

# ۵) اجرا در حالت توسعه
bun run dev        # یا: npm run dev
```

سپس مرورگر را باز کنید: **http://localhost:3000**

> 💾 **دیتابیس آماده است!** فایل `db/custom.db` حاوی هر ۵۹۶ شهر داخل ریپو کامیت شده و نیازی به seed نیست.
> اگر خواستید دیتابیس را از صفر بسازید:
>
> ```bash
> bun run db:push
> bun prisma/seed.ts
> ```

### 🤖 فعال‌سازی تحلیل هوشمند (اختیاری)

فایلی به نام `.z-ai-config` در ریشه پروژه بسازید:

```json
{
  "baseUrl": "https://api.z.ai/api/paas/v4",
  "apiKey": "کلید_Z.ai_شما"
}
```

بدون این فایل هم همه امکانات دیگر (لایه‌ها، پیش‌بینی، ماهواره و…) بدون مشکل کار می‌کنند.

## 🖥 استقرار روی سرور شخصی (VPS)

### روش ۱: اجرای مستقیم

```bash
bun install
bun run db:generate
bun run build      # خروجی standalone در .next/standalone
bun run start      # سرور روی پورت 3000
```

<details>
<summary>🍏 اجرا با Node.js به‌جای Bun</summary>

```bash
npm install
npx prisma generate
npm run build
NODE_ENV=production node .next/standalone/server.js
```

</details>

> ⚠️ **نکته مهم:** در تولید (production) حتماً `DATABASE_URL` را **مسیر مطلق** بدهید، چون سرور standalone از مسیر `.next/standalone` اجرا می‌شود.

### اجرای دائمی با systemd

فایل `/etc/systemd/system/asmanegar.service` بسازید:

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

### اجرای دائمی با PM2

```bash
npm i -g pm2
cd /var/www/weather
DATABASE_URL="file:/var/www/weather/db/custom.db" NODE_ENV=production pm2 start .next/standalone/server.js --name asmanegar
pm2 save && pm2 startup
```

### پشت Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name  your-domain.com;   # دامنه خودتان

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

سپس با certbot ارتقا دهید به HTTPS:

```bash
sudo certbot --nginx -d your-domain.com
```

### روش ۲: با Docker (ساده‌ترین راه) 🐳

```bash
docker build -t asmanegar .
docker run -d --name asmanegar -p 3000:3000 --restart unless-stopped asmanegar
```

یا با Docker Compose — فایل `docker-compose.yml`:

```yaml
services:
  asmanegar:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
    volumes:
      - ./db:/app/db        # دیتابیس بیرون از کانتینر بماند
```

```bash
docker compose up -d
```

> 🤖 برای فعال‌سازی تحلیل هوشمند در Docker، فایل `.z-ai-config` را کنار `docker-compose.yml` بگذارید و در سرویس `volumes` اضافه کنید: `- ./.z-ai-config:/root/.z-ai-config:ro`

## ▲ استقرار روی Vercel

1. ریپو را در [vercel.com/new](https://vercel.com/new) **Import** کنید (فریم‌ورک Next.js خودکار تشخیص داده می‌شود)
2. در بخش **Environment Variables** متغیر زیر را بسازید:

| کلید | مقدار |
|------|-------|
| `DATABASE_URL` | `file:/var/task/db/custom.db` |

3. **Deploy** بزنید — تمام! 🎉

> ⚠️ **محدودیت‌های ورسل را بدانید:**
> - دیتابیس SQLite روی ورسل فقط **خواندنی** است — برای این اپ مشکلی نیست چون فقط لیست شهرها خوانده می‌شود.
> - تحلیل هوشمند (AI) روی ورسل کار نمی‌کند، چون SDK کلید را از فایل `.z-ai-config` می‌خواند و ورسل اجازه ساخت فایل در زمان اجرا نمی‌دهد. اگر AI برایتان مهم است، از **VPS یا Docker** استفاده کنید.
> - کران‌جاب‌ها و کش دائمی هم روی VPS بهتر کار می‌کنند.

## 🛜 متغیرهای محیطی

| متغیر | الزامی | توضیح |
|-------|:------:|-------|
| `DATABASE_URL` | ✅ | مسیر فایل SQLite (ترجیحاً مطلق) — نمونه در `.env.example` |
| `.z-ai-config` | ❌ | فایل JSON با `baseUrl` و `apiKey` برای تحلیل هوشمند |

## 📜 اسکریپت‌ها

| دستور | کار |
|-------|-----|
| `bun run dev` | اجرای توسعه روی پورت 3000 |
| `bun run build` | بیلد تولیدی (standalone) |
| `bun run start` | اجرای نسخه بیلدشده |
| `bun run lint` | بررسی کیفیت کد |
| `bun run db:push` | اعمال اسکیما روی دیتابیس |
| `bun run db:generate` | ساخت کلاینت Prisma |
| `bun prisma/seed.ts` | بارگذاری ۵۹۶ شهر ایران |

## 💛 حمایت مالی | Support

اگه این پروژه برات مفید بود، می‌تونی ازم حمایت کنی:

### 🪙 کریپتو (Crypto)

| شبکه | آدرس |
|------|------|
| **Bitcoin (BTC)** | `bc1pj3dmcgpzf9d6vdm36tk2acx2xw9n5zgjljf9knaddpcmpvqsnw6sk3rfjh` |
| **Ethereum (ETH) / USDT (ERC20)** | `0xe5f078820f26eaf15f7c763c40fc5044270050ec` |
| **Tron (TRX) / USDT (TRC20)** | `TEaaV5RhYSWZs841dUxxYg5cVrUHteG3Rr` |

> 💡 برای انتقال USDT با کمترین کارمزد، از شبکه **Tron (TRC20)** استفاده کنید.

### 💳 روش‌های دیگر

- **GitHub Sponsors**: [github.com/sponsors/2vic1](https://github.com/sponsors/2vic1)

متشکرم از حمایتت! 🙏

---

<div align="center">

ساخته شده با ❤️ برای ایران

📊 داده‌ها: Open-Meteo · NASA GIBS · RainViewer · CAMS

</div>

</div>
