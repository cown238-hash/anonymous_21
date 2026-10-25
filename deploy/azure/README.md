# Deploy บน Azure for Students (WM บอกไม่ต้องใช้บัตร)

ขั้นตอนนี้ย้าย stack ทั้งก้อน (API + Postgres + cloudflared tunnel) ขึ้น Azure VM
โดยใช้ `docker-compose.yml` ที่มีอยู่เดิม รัน container เดียว + cloudflared บน VM
ทุกอย่างรันผ่าน tunnel เดิมอยู่แล้ว → **DNS ไม่ต้องแก้เลย** (`app.wksl.site` + `wksl.site` ชี้มาที่ tunnel เดิม)

ค่าใช้จ่าย:
- **B1s VM (1 vCPU / 1 GB RAM)** ฟรี 750 ชั่วโมง/เดือน สำหรับ 12 เดือนแรก → เปิด 24/7 ได้เต็มเดือน (720 ชั่วโมง/เดือน)
- หลัง 12 เดือน หรือถ้าโควตาหมด: ใช้เครดิต $100 (ต่ออายุรายปีได้ขณะเป็นนักศึกษา) B1s เปิด 24/7 ประมาณ $90/ปี
- Postgres รันใน container เดียวกัน ไม่ต้องจ่ายค่าฐานข้อมูลแยก
- ท่อข้อมูลออกของ Azure ฟรี 15 GB/เดือน (เพียงพอสำหรับเว็บขนาดนี้)

> ⚠️ **ข้อควรระวังสำคัญของ Azure for Students:** บัญชีนักศึกษาบางราย **สร้าง VM ไม่ได้** (地域เฉพาะ / โควตา vCPU = 0 / ไม่มีขนาด VM ให้เลือก) ถ้าเกิดขึ้นให้เปลี่ยนไปใช้ทางเลือกอื่น (เช่น เช่า VPS ถูก หรือ Oracle Cloud) แทน

---

## ก่อนเริ่ม (บนคอมของคุณ)

1. **เข้าสู่ระบบ Azure for Students** ที่ <https://azure.microsoft.com/free/students> (ถ้ายังไม่ได้เปิดใช้ให้เปิดก่อน)
2. **ตรวจสอบว่าสร้าง VM ได้หรือไม่** → เปิด Azure Portal → Virtual Machines → Create → Azure virtual machine
   - ถ้าเห็นขนาด VM ให้เลือก (B1s, B2pts v2 ฯลฯ) → ต่อไปได้
   - ถ้าไม่มีขนาดให้เลือกเลย → บัญชีนี้ถูกจำกัด โปรดหยุดแล้วแจ้งผม
3. **ทิ้ง Portal เปิดไว้** เราจะกลับมาทีละขั้น

---

## ขั้นตอนที่ 1 — สร้าง VM บน Azure Portal

ใน Azure Portal → Create a resource → Virtual machine:

| ตัวเลือก | ค่าที่ตั้ง |
| --- | --- |
| Subscription | `Azure for Students` |
| Resource group | สร้างใหม่ เช่น `wksl-rg` |
| Virtual machine name | `wksl-vm` |
| Region | **Southeast Asia** (ใกล้ประเทศไทยที่สุด) |
| Availability options | No infrastructure redundancy required |
| Security type | Standard |
| Image | **Ubuntu Server 24.04 LTS** |
| Size | **Standard_B1s** (ถ้ามี) หรือ `Standard_B2pts_v2` (ARM, 2 vCPU) |
| Authentication type | **SSH public key** |
| Username | เช่น `azureuser` |
| SSH public key | ใส่ public key ของเครื่องคุณ (ถ้ายังไม่มี ให้รัน `ssh-keygen -t ed25519` แล้วคัดลอก `.pub`) |
| Public inbound ports | **Allow selected ports** → เลือก **22 (SSH)** เท่านั้น (แอปเข้าผ่าน tunnel ไม่ต้องเปิด 80/443) |

ถ้าเสร็จแล้วคลิก Review + create → Create รอประมาณ 2–3 นาที

หลังสร้างเสร็จ จด **Public IP address** ของ VM ไว้ ใช้ตอน SSH เข้าไปตั้งค่า

---

## ขั้นตอนที่ 2 — เตรียม GitHub Container Registry (สำหรับเก็บ image)

ไปที่ <https://github.com/cown238-hash/anonymous_21/settings/secrets/actions> (ต้อง login GitHub ก่อน):

เพิ่ม **Repository secret** 2 ตัว:
- `REGISTRY_USERNAME` = ชื่อผู้ใช้ GitHub ของคุณ
- `REGISTRY_PASSWORD` = Personal Access Token (scope `write:packages`) — สร้างได้ที่ Settings → Developer settings → Personal access tokens → Fine-grained

จากนั้นไปที่ **Actions** tab ของ repo → workflow `image` → **Run workflow** (จะสร้าง container image และส่งขึ้น `ghcr.io/cown238-hash/anonymous_21:latest`)

รอให้สำเร็จ (ประมาณ 3–5 นาที) ถ้าล้มเหลวแจ้งผมพร้อม error log

---

## ขั้นตอนที่ 3 — รัน bootstrap.sh บน VM

SSH เข้า VM:

```bash
ssh azureuser@<PUBLIC_IP>
```

จากนั้นรัน:

```bash
curl -fsSL https://raw.githubusercontent.com/cown238-hash/anonymous_21/main/deploy/azure/bootstrap.sh | bash
```

สคริปต์นี้จะ:
1. ติดตั้ง Docker + compose plugin
2. ติดตั้ง `cloudflared`
3. สร้าง swap 4 GB (B1s RAM แค่ 1 GB ต้องมี swap เป็นตัวช่วย)
4. ติดตั้ง systemd unit `cloudflared` (เปิดใช้งานไว้ แต่ยังไม่เริ่มรัน เพราะยังไม่มี config)
5. เปิด ufw ให้ SSH เท่านั้น (ป้องกันไม่ให้คนอื่นเข้าถึง VM โดยตรง)

เมื่อเสร็จ **ล็อกเอาท์แล้วล็อกอินใหม่** (`exit` แล้ว `ssh azureuser@<PUBLIC_IP>` อีกรอบ) เพื่อให้กลุ่ม docker ใช้งานได้

---

## ขั้นตอนที่ 4 — เตรียมไฟล์ 환경 (บนคอมของคุณ)

สร้างไฟล์ `server/.env` บน VM (อ่านจาก `.env` ของคุณบนเครื่องนี้ แล้วปรับตาม):

ตัวอย่างโครงสร้าง `server/.env` บน VM:

```
DATABASE_URL=postgresql://postgres:<รหัสผ่านที่คุณตั้ง>@db:5432/nimbus?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<รหัสผ่านเดียวกัน>
POSTGRES_DB=nimbus
DB_PORT=5432
APP_PORT=4000

NODE_ENV=production
TRUST_PROXY=true
TRUST_PROXY_HOPS=1

JWT_ACCESS_SECRET=<สุ่มอย่างน้อย 16 ตัวอักษร>
JWT_REFRESH_SECRET=<สุ่มอย่างน้อย 16 ตัวอักษร>
APP_ENCRYPTION_KEY=<สุ่มอย่างน้อย 32 ตัวอักษร>

PUBLIC_URL=https://app.wksl.site
CLIENT_ORIGINS=https://app.wksl.site,https://wksl.site

MAX_UPLOAD_MB=50
MAX_FILES_PER_UPLOAD=20
MAX_ATTACHMENTS_PER_POST=10

ENABLE_JOBS=true
JOB_INTERVAL_MINUTES=30

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM=WKSL <no-reply@nimbus.local>

VAPID_PUBLIC_KEY=<คัดลอกจาก .env บนเครื่องคุณ>
VAPID_PRIVATE_KEY=<คัดลอกจาก .env บนเครื่องคุณ>
VAPID_SUBJECT=https://app.wksl.site
```

วิธีสุ่มรหัส (รันบนคอมของคุณก็ได้):

```powershell
[System.Web.Security.Membership]::GeneratePassword(32, 8)
```

สร้างไฟล์บน VM:

```bash
nano ~/server.env
# วางเนื้อหาตามตัวอย่างด้านบน แล้วกด Ctrl+O, Enter, Ctrl+X
```

---

## ขั้นตอนที่ 5 — อัปโหลด tunnel config + credentials (DNS ไม่ต้องแก้)

จากคอมของคุณ ให้ส่งไฟล์ tunnel ทั้ง 3 ไปที่ VM:

```powershell
scp C:\Users\admin123\.cloudflared\config.yml azureuser@<PUBLIC_IP>:~/
scp C:\Users\admin123\.cloudflared\cert.pem azureuser@<PUBLIC_IP>:~/
scp C:\Users\admin123\.cloudflared\b1bc5863-17b8-435f-9df6-556b66be50c1.json azureuser@<PUBLIC_IP>:~/
```

บน VM:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ~/config.yml ~/cert.pem ~/b1bc5863-17b8-435f-9df6-556b66be50c1.json /etc/cloudflared/
sudo chmod 600 /etc/cloudflared/b1bc5863-17b8-435f-9df6-556b66be50c1.json
```

ตรวจสอบ `config.yml` ว่ามี ingress ตามนี้ (ควรจะมีอยู่แล้วจากไฟล์เดิม):

```yaml
tunnel: b1bc5863-17b8-435f-9df6-556b66be50c1
credentials-file: /etc/cloudflared/b1bc5863-17b8-435f-9df6-556b66be50c1.json

ingress:
  - hostname: app.wksl.site
    service: http://localhost:4000
  - hostname: wksl.site
    service: http://localhost:4000
  - service: http_status:404
```

---

## ขั้นตอนที่ 6 — ย้ายข้อมูล (ฐานข้อมูล + ไฟล์แนบ)

> ถ้าคุณเลือก **เริ่มใหม่ ไม่ย้ายข้อมูลเดิม** ให้ข้ามขั้นนี้ แล้วข้ามไปขั้น 7 โดยตรง (container จะสร้างฐานข้อมูลเปล่าให้เอง)

### 6.1 ดump ฐานข้อมูลจากเครื่องคุณ (รันบน Windows PowerShell)

คุณมี PostgreSQL 18 รันอยู่ที่ `127.0.0.1:5432` ให้ดump ออกมา:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  -U postgres -d nimbus -h 127.0.0.1 -p 5432 `
  --format=custom --compress=9 --no-owner --no-acl `
  -f $env:TEMP\nimbus-backup.dump
```

แล้วส่งไฟล์ไป VM:

```powershell
scp $env:TEMP\nimbus-backup.dump azureuser@<PUBLIC_IP>:~/
```

### 6.2 ส่งไฟล์แนบ (uploads)

```powershell
scp -r C:\Users\admin123\Anounymos-app\server\uploads azureuser@<PUBLIC_IP>:~/
```

### 6.3 รีสโตร์บน VM

บน VM:

```bash
# เริ่มเฉพาะ db container ก่อน (ให้พร้อมรับ restore)
cd ~
mkdir -p wksl
cp server.env wksl/.env  # ถ้ายังไม่มี

# สร้าง docker-compose ไฟล์ชั่วคราวสำหรับเริ่ม db
cat > docker-compose.db.yml <<'EOF'
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:
EOF

export $(grep -v '^#' wksl/.env | xargs)
docker compose -f docker-compose.db.yml up -d db
sleep 5

# รีสโตร์
cat nimbus-backup.dump | docker exec -i wksl-db-1 pg_restore --dbname="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB?schema=public" --clean --if-exists --no-owner --no-acl

# ปิด db container ชั่วคราว (จะเริ่มรวมกับ app ในขั้น 7)
docker compose -f docker-compose.db.yml down
```

### 6.4 ย้ายไฟล์แนบเข้าที่

```bash
sudo mkdir -p /var/lib/wksl/uploads
sudo cp -r ~/uploads/* /var/lib/wksl/uploads/
sudo chown -R root:root /var/lib/wksl/uploads
```

---

## ขั้นตอนที่ 7 — รันแอป + tunnel บน VM

บน VM:

```bash
cd ~
mkdir -p wksl && cd wksl
cp ../server.env .env
```

สร้าง `docker-compose.yml` (ใช้ root ไฟล์ + override ของ Azure):

```yaml
# ~/wksl/docker-compose.yml
name: nimbus

services:
  app:
    image: ghcr.io/cown238-hash/anonymous_21:latest
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      DB_PORT: 5432
      APP_PORT: 4000
      TRUST_PROXY: 'true'
      TRUST_PROXY_HOPS: '1'
      PUBLIC_URL: ${PUBLIC_URL}
      CLIENT_ORIGINS: ${CLIENT_ORIGINS}
      MAX_UPLOAD_MB: ${MAX_UPLOAD_MB}
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      APP_ENCRYPTION_KEY: ${APP_ENCRYPTION_KEY}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      MAIL_FROM: ${MAIL_FROM}
      ENABLE_JOBS: ${ENABLE_JOBS}
      JOB_INTERVAL_MINUTES: ${JOB_INTERVAL_MINUTES}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}
      VAPID_SUBJECT: ${VAPID_SUBJECT}
    ports:
      - "127.0.0.1:4000:4000"
    volumes:
      - /var/lib/wksl/uploads:/app/server/uploads

  db:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
```

ดึง image แล้วรัน:

```bash
export $(grep -v '^#' .env | xargs)
docker compose pull app db
docker compose up -d
```

รอประมาณ 1–2 นาที แล้วตรวจสอบ:

```bash
docker compose ps
curl -s http://127.0.0.1:4000/api/health   # ควรตอบ 200
curl -s http://127.0.0.1:4000/api/config    # ควรตอบ JSON มี maxUploadMb
```

เริ่ม tunnel:

```bash
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

ทดสอบจากคอมของคุณ (เปิดเบราว์เซอร์):

```
https://app.wksl.site/
https://wksl.site/
https://app.wksl.site/api/health
```

---

## ขั้นตอนที่ 8 — ปิดเครื่องคอมของคุณ

เมื่อทดสอบจากเครื่องอื่น (หรือ 4G) ยืนยันว่าเว็บออนไลน์แล้ว:

1. ปิด `start-app.ps1` / `watchdog.ps1` / `start-tunnel.ps1` บน Windows (หรือเพียงแค่ปิดคอม)
2. cloudflared บน VM จะทำงานแทนที่ตลอดไป (ระบบจะ restart ให้อัตโนมัติถ้า crash)
3. แอปออนไลน์ 24/7 โดยไม่ต้องเปิดคอมทิ้งไว้

---

## การอัปเดตโค้ดในภายหลัง

ทุกครั้งที่ push `main` GitHub Actions จะสร้าง image ใหม่ บน VM:

```bash
cd ~/wksl
export $(grep -v '^#' .env | xargs)
docker compose pull app
docker compose up -d app
```

---

## ถ้า Azure for Students สร้าง VM ไม่ได้

แจ้งผมทันที — เราจะเปลี่ยนไปใช้:
1. **เช่า VPS ถูก** (~300 บาท/เดือน) หรือ
2. **Oracle Cloud Always Free** (ต้องมีบัตรเครดิตยืนยันตัวตน แต่ใช้งานฟรี)

---

ขั้นตอนแรกที่คุณต้องทำตอนนี้: **สร้าง VM ใน Azure Portal** (ขั้น 1) แล้วแจ้งผมว่า Public IP อะไร และสร้างสำเร็จไหม (หรือติดตรงไหน)
