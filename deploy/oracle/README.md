# Deploy บน Oracle Cloud Always Free (ARM VM)

คู่มือนี้รัน stack ทั้งก้อน (API + client + Postgres) บน VM ฟรีของ Oracle
โดยใช้ `docker-compose.yml` ที่มีอยู่เดิม พร้อม override เพิ่มเพื่อรันไว้หลัง Caddy

ไฟล์ในโฟลเดอร์นี้:

| ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `bootstrap.sh` | ติดตั้ง Docker, Node 22, swap, เปิด firewall ฝั่ง VM (รันครั้งแรก) |
| `compose.oracle.yml` | override ให้ app ฟัง `127.0.0.1` เท่านั้น และ db ผูกกับ loopback |
| `Caddyfile` | reverse proxy + TLS อัตโนมัติสำหรับโดเมน |
| `update.sh` | pull + rebuild + restart ตอนมีการอัปเดตโค้ด |

> ทุก images ที่ใช้รองรับ ARM ตามธรรมชาติ — `node:22-alpine` และ
> `postgres:16-alpine` มี build สำหรับ arm64 อยู่แล้ว และ Prisma engines arm64
> ก็มีให้ จึงไม่ต้องแก้โค้ดหรือ Dockerfile อะไรเลย

---

## 0. สิ่งที่ต้องมี

- บัญชี Oracle Cloud ที่ลงทะเบียนแล้ว (ต้องยืนยันบัตร แต่ Always Free ไม่เรียกเงินตราบเท่าที่ยังใช้ resource ภายในสิทธิ์)
- ที่อยู่ในโดเมนหนึ่ง — **A record หนึ่งรายการชี้มาที่ IP ของ VM** (Cloudflare ใช้ฟรีได้) — **บังคับ ดูข้อ 4**

> ใช้ **subdomain** ได้ และมักเป็นทางที่ปลอดภัยกว่า: ถ้า apex ของโดเมนมีเว็บอื่นรันอยู่แล้ว
> (เช่น `wksl.site` เป็นเว็บ GSO) การไปแก้ A record ของ `@` จะทำให้เว็บนั้นล่มทันที
> ตั้ง host ของแอปให้ตรงกันทั้ง 3 ที่: A record, `PUBLIC_URL`/`CLIENT_ORIGINS` และ Caddyfile
> ตัวอย่าง: `A app → <IP ของ VM>` + `PUBLIC_URL=https://app.wksl.site`

## 1. สร้าง VM

- **Compute → Instances → Create instance**
- Shape: `VM.Standard.A1.Flex` (Ampere ARM) — ตั้งไว้ที่ 2 OCPU / 12 GB RAM ก็ยังอยู่ในวงฟรี
- Image: **Ubuntu 24.04** (ต้องเป็น aarch64)
- เพิ่ม SSH public key ของเครื่องตัวเอง แล้วเก็บ private key ไว้

> ถ้าเจอ **"Out of host capacity"** ถือเป็นเรื่องปกติของ A1 ในยอดนิยม — ลอง region/subnet
> อื่น หรือรัน retry ไปเรื่อย ๆ บางทีต้องรอหลายชั่วโมง ทางเลือกชั่วคราวคือเอา x86 micro
> (1 OCPU / 1 GB) มาก่อน แต่ RAM 1 GB build อาจไม่ผ่าน

## 2. เปิด firewall — Oracle มี **สอง** ที่ อย่าลืมชั้นไหนก็เสี่ยงพลาด

VM ของ Oracle ถูกกันที่สองชั้น ซึ่งคนใหม่มักพลาดชั้นที่สองจนเปิด port ไม่ขึ้นเลย:

1. **VCN Security List (ทาง dashboard)** — Instance → subnet → VCN → Security Lists
   → Add Ingress Rules → เพิ่ม:
   - `0.0.0.0/0` TCP **80**
   - `0.0.0.0/0` TCP **443**
2. **iptables ข้างใน VM** — Ubuntu image ของ Oracle ตั้ง default เป็น REJECT เปิดแค่ SSH
   `bootstrap.sh` เพิ่ม rule ให้เอง

## 3. ลงของบน VM

```bash
ssh -i <key> ubuntu@<public-ip>

git clone <repo-url> ~/app && cd ~/app

cp .env.docker.example .env
# สุ่ม secret ใหม่ทุกตัว (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, APP_ENCRYPTION_KEY)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
nano .env      # ตั้ง POSTGRES_PASSWORD, PUBLIC_URL, CLIENT_ORIGINS = https://โฮสต์ของแอป
               # โฮสต์ของแอป ไม่ใช่โดเมนเปล่า ๆ — ถ้าแอปอยู่ที่ app.wksl.site ก็ใส่ค่านั้น

bash deploy/oracle/bootstrap.sh
exit           # ออกแล้วเข้าใหม่ เพื่อให้สิทธิ์กลุ่ม docker ทำงาน
```

## 4. ทำไมต้องมี HTTPS จริง ๆ

`server/src/lib/tokens.ts:52-53` — เมื่อ `NODE_ENV=production` refresh cookie จะถูก
กำหนดเป็น `secure` + `sameSite=none` ถ้ารันบน HTTP เปล่า ๆ browser จะ**ไม่เก็บ cookie**
แล้ว login ไม่ได้ เลยจำเป็นต้องมี TLS ติดตั้ง Caddy (จัดการใบรับรอง Let's Encrypt
ให้เองตลอดอายุ):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo apt update && sudo apt install -y caddy

sudo cp deploy/oracle/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile    # ใส่โฮสต์ของแอป + อีเมล (ตอนนี้ไฟล์ตั้งไว้ที่ app.wksl.site)
sudo systemctl reload caddy
```

ก่อน reload ต้องให้ A record ของ **โฮสต์ที่จะใช้** ชี้มาที่ IP ของ VM แล้ว (DNS ยังไม่ชี้ Caddy จะออกใบรับรองไม่ผ่าน) — Caddy ควรตั้งชื่อเฉพาะโฮสต์ของแอป ไม่ต้องใส่ apex ถ้า apex เป็นเว็บอื่น

## 5. Deploy ครั้งแรก

```bash
cd ~/app
docker compose -f docker-compose.yml -f deploy/oracle/compose.oracle.yml up -d --build
```

entrypoint ของ container จะรัน `prisma migrate deploy` ก่อนเริ่ม server เอง
build ครั้งแรกบน ARM ใช้เวลาหลายนาที (เป็นเรื่องปกติ)

สร้างบัญชีแอดมิน (db ผูกไว้ที่ loopback เพื่อให้สคริปต์พวกนี้เชื่อมต่อได้):

```bash
export DATABASE_URL="postgresql://$(grep ^POSTGRES_USER .env | cut -d= -f2):$(grep ^POSTGRES_PASSWORD .env | cut -d= -f2)@127.0.0.1:5432/$(grep ^POSTGRES_DB .env | cut -d= -f2)?schema=public"
node server/scripts/create-admin.mjs you@example.com 'YourStrongPass1'
```

ตรวจว่าใช้งานได้:

```bash
curl -fsS http://127.0.0.1:4000/api/ready    # จากตัว VM
curl -fsS https://โดเมนของคุณ/api/ready      # จากนอกเครื่อง
```

## 6. สำรองข้อมูล

ฐานข้อมูล (เพิ่มใน `crontab -e` ให้รันทุกวันตีหนึ่ง):

```bash
0 1 * * * cd ~/app && DATABASE_URL='...' ./scripts/backup.sh >> backups/cron.log 2>&1
```

ไฟล์แนบ (อยู่ใน docker volume ไม่ใช่โฟลเดอร์ธรรมดา) — สำรองแยกจากกัน:

```bash
docker run --rm -v nimbus_uploads-data:/data -v ~/app/backups:/backup alpine \
  tar czf "/backup/uploads-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" -C /data .
```

> ชื่อ volume อาจขึ้นต้นด้วยชื่อโปรเจกต์ (`app_uploads-data` ตามชื่อโฟลเดอร์) — เช็คว่าถูกต้องกับ `docker volume ls`
> สำรองขึ้น off-site ด้วย (Backblaze B2 / S3) — disk บน VM ไม่ใช่ backup
> กู้คืนได้ด้วย `scripts/restore.sh` (ดูวิธีใช้ใน README หลัก)

## 7. อัปเดตโค้ดทีหลัง

```bash
~/app/deploy/oracle/update.sh
```

## 8. ใช้เป็น

- ดู log: `docker compose -f docker-compose.yml -f deploy/oracle/compose.oracle.yml logs -f app`
- ไม่ตั้ง SMTP = อีเมลยืนยันตัวตน/กู้คืนรหัสผ่านถูกพิมพ์ลง log แทน (`docker compose ... logs app`) — พอสำหรับ dev, ขึ้นโปรดักชันจริงค่อยต่อ SMTP จริง
- ปิด/เปิด migration ตอน deploy: `RUN_MIGRATIONS=false` ใน `.env` (entry อ่านค่าตรงนี้)
- เฝ้าดู resource: `docker stats` — วงฟรีมี RAM 24 GB ใช้แค่ container สองตัวก็ยังเหลือเฟือ
