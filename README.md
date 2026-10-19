# WKSL — Community Showcase

เว็บแอปชุมชนแบบ full-stack ที่พร้อมใช้งานจริง (production-ready)
**React + Vite + TypeScript** (frontend) · **Node + Express + Socket.IO** (backend) ·
**PostgreSQL + Prisma** (database)

พื้นที่สำหรับเขียนบทความ ค้นหา ความคิดเห็น แชทแบบเรียลไทม์
ระบบสมาชิกที่มี 2FA และกู้คืนบัญชี แดชบอร์ดส่วนตัว และแผงผู้ดูแลระบบพร้อม moderation

---

## สารบัญ

- [สิ่งที่ทำได้](#สิ่งที่ทำได้)
- [เทคโนโลยี](#เทคโนโลยี)
- [เริ่มต้นใช้งาน](#เริ่มต้นใช้งาน)
- [การ deploy](#การ-deploy)
- [ตัวแปรระบบ](#ตัวแปรระบบ)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [API](#api)
- [Socket.IO events](#socketio-events)
- [สคริปต์คำสั่ง](#สคริปต์คำสั่ง)
- [การตรวจสอบและประสิทธิภาพ](#การตรวจสอบและประสิทธิภาพ)
- [ความปลอดภัย](#ความปลอดภัย)

---

## สิ่งที่ทำได้

### สมาชิกและความปลอดภัย
- สมัครสมาชิก / เข้าสู่ระบบ (อีเมลหรือชื่อผู้ใช้) / ออกจากระบบ
- **ยืนยันอีเมล** ด้วย token แบบใช้ครั้งเดียว พร้อมส่งอีเมลจริงผ่าน SMTP
- **กู้คืนรหัสผ่าน** ด้วยอีเมล (ตอบกลับเหมือนกันเสมอ ไม่เปิดเผยว่าอีเมลมีบัญชีหรือไม่)
- **2FA (TOTP)** — สแกน QR, รหัสกู้คืน 10 รหัสแบบใช้ครั้งเดียว
- **รหัส TOTP ยืนยันได้ ±1 ช่วง 30 วินาที** ตามแนวทาง RFC 6238 §5.2 — กันกรณีผู้ใช้อ่านรหัสตอนท้ายช่วงแล้วกดตอนขอบใหม่ หรือนาฬิกาเครื่องเพี้ยน
  > ระวัง: `otplib` ค่า default คือ `window: 0` และ **`verify({ token, secret, window })` จะทิ้งค่า `window` ทิ้งไปเงียบ ๆ** ต้องตั้งบน `authenticator.options` แทน (ดู `services/two-factor.ts`)
- **ล็อกบัญชีชั่วคราว** เมื่อใส่รหัสผ่านผิดเกินกำหนด
- จัดการเซสชันทุกอุปกรณ์, แจ้งเตือนทางอีเมลเมื่อรหัสผ่านเปลี่ยน
- **ส่งออกข้อมูลส่วนตัว** เป็น JSON (ไม่รวมรหัสผ่านหรือ secret ใด ๆ)
- **ลบบัญชีถาวร** พร้อมทั้งบทความ ความคิดเห็น และข้อความ
- **ซ่อนโปรไฟล์** — เปิดได้ในตั้งค่าบัญชี หายจากรายชื่อสมาชิกและหน้าโปรไฟล์จะ 404 สำหรับคนอื่น (เจ้าของกับแอดมินยังเห็น แอดมินเห็นป้าย “ซ่อนอยู่”)
- แบ่งหน้าสิทธิ์ `USER` / `ADMIN` พร้อมแผงผู้ดูแลระบบ

### บทความ
- CRUD พร้อมสถานะ **เผยแพร่ / ฉบับร่าง / เก็บถาวร**
- **Markdown editor** พร้อมแถบเครื่องมือและโหมดดูตัวอย่าง
- อัปโหลดภาพปก, แท็ก (สูงสุด 8), หมวดหมู่
- **ไฟล์แนบหลายไฟล์** — ลากมาวางหรือเลือกทีละหลายไฟล์ ดาวน์โหลดได้จริง (ดูรายละเอียดด้านล่าง)
- ค้นหาเต็มข้อความ + กรอง (หมวด/แท็ก/ผู้เขียน/สถานะ) + เรียง 4 แบบ + แบ่งหน้า
- สร้าง excerpt อัตโนมัติ, คำนวณเวลาอ่าน, นับยอดเข้าชม, บทความที่เกี่ยวข้อง
- **slug ภาษาไทยอ่านออก** — `slugify` ถอดอักษรไทยเป็นโรมันแบบ deterministic (`ภาษาไทย` → `phasaaithy`) ถ้าถอดไม่ได้จะใช้ hash คงที่ ไม่ใช้ค่าสุ่ม

### ไฟล์แนบ (Attachments)
- อัปโหลดหลายไฟล์พร้อมกัน — เอกสาร, รูปภาพ, ตาราง, สไลด์, ซิป, วิดีโอ/เสียง, ซอร์สโค้ด, ฟอนต์ (**68 นามสกุล**)
- ลากไฟล์มาวางในหน้าเขียนบทความได้, นำออก/เพิ่มได้ภายหลัง, แก้ไขบทความเดิมได้
- รายการไฟล์ในหน้าอ่านพร้อมชนิดและขนาด, การ์ดหน้าเลือกมีจำนวนไฟล์แนบ
- **จำกัด** — `MAX_UPLOAD_MB` ต่อไฟล์, `MAX_FILES_PER_UPLOAD` ต่อครั้ง, `MAX_ATTACHMENTS_PER_POST` ต่อบทความ

**ความปลอดภัย**
- อัปโหลด → ได้ `Attachment` id → บทความ "claim" id ตอนบันทึก แนบไฟล์ของคนอื่นไม่ได้
- ไฟล์ถูกเสิร์ฟผ่าน `/api/posts/:slug/attachments/:id` ไม่ใช่ static mount — เข้าถึงได้เฉพาะ id ที่เซิร์ฟเวอร์ให้
- ทุกชนิดยกเว้นรูปภาพถูกบังคับ `Content-Disposition: attachment` + `application/octet-stream` + `nosniff` กัน HTML/SVG ฝังสคริปต์
- ไฟล์ของบทความฉบับร่างมองเห็นได้เฉพาะเจ้าของกับแอดมิน
- ไฟล์ที่อัปโหลดแล้วไม่ผูกกับบทความ ถูกลบทิ้งอัตโนมัติหลัง 24 ชม. (`pruneUnclaimedAttachments`)

### ความคิดเห็นและปฏิกิริยา
- ความคิดเห็น 2 ระดับ (คอมเมนต์ + ตอบกลับ) พร้อม soft delete
- กดถูกใจแบบ toggle พร้อมแจ้งเตือนเจ้าของบทความ
- **รายงานเนื้อหา** — สมาชิกแจ้งสแปม/การกลั่นร้าย/ลิขสิทธิ์ เข้าคิวให้ผู้ดูแลตัดสิน

### แชทเรียลไทม์ (Socket.IO)
- ห้องสาธารณะและแชทส่วนตัว พร้อมสร้างห้องใหม่
- ส่งข้อความทันที, ตัวบอก "กำลังพิมพ์", ข้อความไม่อ่าน, สถานะอ่านแล้ว
- รายชื่อสมาชิกออนไลน์, presence เข้า/ออกห้อง
- ประวัติแบบ cursor pagination + REST fallback เมื่อ WebSocket ถูกบล็อก

### SEO / PWA
- **Metadata ต่อหน้า** — title, description, Open Graph, Twitter Card, canonical, robots
- `robots.txt` + `sitemap.xml` ที่สร้างจากข้อมูลจริง
- **PWA** — manifest, ไอคอนทุกขนาด, service worker (cache-first สำหรับ asset, network-first สำหรับหน้า)
- หน้า `offline.html` เมื่ออินเทอร์เน็ตหลุด
- ธีมสว่าง/มืดไม่กะพริบตอนโหลด, responsive ทั้งมือถือและเดสก์ท็อป

### การยืนยันอายุ (Age gate)
- **ครอบทั้งเว็บ** — `components/AgeGate.tsx` ครอบแอปทั้งก้อน (วางไว้นอก `AuthProvider` ด้วย) จึงไม่มีเส้นทางใดหลุดไปถึงแอปได้ก่อนยืนยัน ผู้ใช้เลือกวัน เดือน ปีเกิดเป็น พ.ศ. แล้วระบบแปลงเป็น ค.ศ. ให้
- **เซิร์ฟเวอร์เป็นผู้ตัดสิน** — `POST /api/age-gate` ตรวจว่าเป็นวันที่จริง (ไม่ใช่ `2025-02-30`) ไม่เป็นอนาคต และคำนวณอายุเอง ฝั่งเบราว์เซอร์ทำได้แค่ส่งคำตอบ — เปิด devtools แก้ localStorage ไม่ช่วยอะไร
- **ไม่เก็บวันเกิด** — ตาราง `AgeCheck` เก็บเฉพาะผลลัพธ์: `minAge`, วันหมดอายุ และ **hash ของ IP ที่ย้อนกลับไม่ได้** ส่วนคำตอบที่อายุไม่ถึง **ไม่ถูกบันทึกเลย** ปีที่พิมพ์ผิดจึงแก้แล้วลองใหม่ได้ทันที
- **กันเฉพาะเส้นทางเนื้อหา ไม่ได้กันทั้ง API** — `/api/posts`, `/api/comments`, `/api/users`, `/api/categories`, `/api/tags`, `/api/stats` จะตอบ `403 AGE_VERIFICATION_REQUIRED` จนกว่าจะผ่าน แต่ `/api/auth`, `/api/health`, `/api/ready`, `/api/metrics`, `/api/collect`, `/api/age-gate`, `robots.txt` และ `sitemap.xml` เปิดเสมอ — ถ้าไม่แยกอย่างนี้ ผู้ใหญ่ที่ยังไม่ยืนยันจะเข้าไปตอบเกตไม่ได้เลย และ crawler จะเจอ 403 ทุกหน้า
- **จำผู้ใช้ข้ามครั้ง** — cookie `httpOnly` อายุ 1 ปี; ล้างคุกกี้แล้วระบบยังจำได้จาก hash ของที่อยู่ IP — ปิดได้ด้วย `AGE_GATE_IP_BINDING=false` ข้อแลกเปลี่ยนคือคนที่แชร์ IP เดียวกัน (ออฟฟิศ/โรงเรียน) จะได้ผลร่วมกัน
- **ปิดไว้โดยปริยาย** — เปิดด้วย `AGE_GATE_ENABLED=true` เท่านั้น จึงไม่กระทบ dev, e2e หรือ deployment เดิม ๆ ส่วน template สำหรับ production (`render.yaml`, `.env.docker.example`) เปิดให้แล้ว
- **ทดสอบ** — `npm run test:agegate` ตรวจ 23 กรณี (ข้ามตัวเองถ้าเกตปิด) รวมเส้นแบ่งวันเกิด: เกิดพรุ่งนี้เมื่อ 18 ปีที่แล้ว = ไม่ผ่าน, เกิดวันนี้เมื่อ 18 ปีที่แล้ว = ผ่าน

### ดีไซน์ — ดำ + เขียว
- **Dark-first** — พื้นหลังดำแท้ (`#050505`) เป็นค่าเริ่มต้น, สลับเป็นโหมดสว่างได้จากแถบบน
- **เขียวเป็นสีเดียวที่เน้น** — ปุ่มหลักเป็นเขียวเข้มตัวอักษรดำ (contrast สูงสุด), ส่วนอื่นใช้เส้นขอบบางแทนเงา
- **โทเคนทั้งหมด** อยู่ใน `@theme` ของ `client/src/index.css` — `surface-*` (พื้นหลัง 4 ระดับ), `ink-*` (ตัวอักษร 4 ระดับ), `brand-*` (เขียว), `accent-*` (เขียวอมฟ้า ใช้กับ gradient เท่านั้น)
- **Light theme** คือค่ากลับด้าน — กระดาษขาวบนพื้นอ่อน, เขียวเข้มขึ้นเป็น `#059669` ให้ contrast ยังผ่าน
- สีหมวดหมู่ทั้ง 5 หมวดอยู่ในโทนเขียว แยกกันด้วยความสว่าง ไม่ใช่เฉด
- คลาสประจำระบบ: `.card` `.btn-primary/.secondary/.ghost/.danger` `.input` `.badge` `.eyebrow` `.rule` `.glass` `.bg-grid` `.pulse-dot`
- **โลโก้ตัว W โทนโลหะเงา (chrome)** — `components/Logo.tsx` (`LogoMark`) ใช้ทุกจุดในเว็บ
  - ผิวหน้าไล่แถบแสง 8 ขั้น (ฟ้าสว่าง → เส้นคอดฟ้า → แสงชั้นที่สอง → เหล็กใต้เงา) ให้เป็นโลหะจริง
  - ขอบด้านบนขาวเกิน (`bevel`), ด้านข้างเข้มลง (`side`), เงาแข็งบนพื้นหลัง
  - `public/favicon.svg` + `scripts/generate-icons.mjs` วาดโครงเดียวกัน (5 ขนาด PWA) เป็น PNG จริงด้วย SDF
  - ชื่อแบรนด์กับ wordmark มาจาก `client/scripts/make-logo-placeholder.mjs` → `public/logo/wksl-mark.png` (จัตุรัส ใช้ในชิป header/favicon) และ `public/logo/wksl-wordmark.png` (กว้าง ใช้ og:image/หน้า login) — เป็นของชั่วคราว เอาไฟล์จริงมาวางทับได้เลยโดยไม่ต้องแก้โค้ด
- **เรืองแสง** — hero มีขอบเรืองแสงเขียว + แสงลอย 3 ก้อน, หัวเรื่องไล่สีไหล (`text-gradient-flow`), โลโก้มีวงแหวนกะพริบ (`halo`) และแสงวิ่งผ่าน (`sheen`), การ์ดมีล้างเขียวส่องเข้ามาตอน hover

### แอนิเมชัน (framer-motion)
- **เปลี่ยนหน้า** — fade + slide ทุก route ผ่าน `AnimatePresence` ใน `Layout` (กลับขึ้นบนสุดอัตโนมัติเมื่อเปลี่ยนหน้า)
- **Hero หน้าแรก** — ข้อความ stagger ขึ้นทีละชิ้น, ตัวเลขสถิติ **นับ 0 → ค่าจริง** เมื่อ scroll ถึง (`CountUp` ใน `components/anim.tsx`)
- **การ์ดบทความ** — ลอยขึ้นเมื่อ scroll ถึง (`whileInView` + `viewport.once` ไม่เปลือง listener)
- **ปุ่มไลก์** — กดแล้วยุบ (`whileTap`) หัวใจเด้งด้วย spring ตอนเปลี่ยนสถานะ
- **เคารพผู้ใช้** — ครอบด้วย `MotionConfig reducedMotion="user"` เปิด reduce-motion ใน OS แล้ว movement หยุด เหลือแต่ fade
- **สวิตช์ในแอป** — ตั้งค่า → รูปลักษณ์ → เอฟเฟกต์เคลื่อนไหว: ตามระบบ / เปิดตลอด / ปิด (`lib/motion-pref.ts` + `data-motion` บน `<html>`)
  ถ้าเว็บดูนิ่งทั้งที่ควรขยับ ให้เช็คข้อนี้ก่อน — Windows ที่ปิด Animation effects ไว้จะสั่งให้ทุกเว็บหยุดขยับ
- เพิ่ม bundle ~120 KB (min) / ~35 KB (gzip) ที่ chunk หลัก — ถือว่าคุ้มกับเอฟเฟกต์ทั้งเว็บ

### การดำเนินการระบบ
- **Structured logging** เป็น JSON ใน production (พร้อม request id, mask ข้อมูลลับ)
- **Health probes** — `/api/health` (liveness) และ `/api/ready` (readiness ตรวจ DB)
- **Metrics** แบบ Prometheus ที่ `/api/metrics`
- **Background jobs** — ลบเซสชัน/token หมดอายุ, ปลดล็อกบัญชี, ลบไฟล์ที่ไม่ถูกใช้
- **Audit log** ทุกการกระทำสำคัญ (เปลี่ยนสิทธิ์, ระงับ, ลบบัญชี)
- **Compression**, CSP, HSTS, rate limiting ปรับตามระดับความสำคัญ
- Graceful shutdown พร้อม drain งานที่ค้างอยู่

---

## เทคโนโลยี

| ชั้น | เครื่องมือ |
| --- | --- |
| Frontend | React 18, Vite 6, TypeScript, React Router 7, TanStack Query 5, Tailwind CSS 4, Socket.IO client, lucide-react, framer-motion 11 |
| Backend | Node 20+, Express 4, TypeScript (ESM), Socket.IO 4, Zod, Multer 2, Helmet, compression, express-rate-limit, bcryptjs, jsonwebtoken, otplib, qrcode, nodemailer |
| Database | PostgreSQL 14+, Prisma ORM 6 (migrations) |
| Tooling | npm workspaces, tsx, concurrently, Prisma Studio, Docker, GitHub Actions |

---

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมี
- Node.js ≥ 20 (ทดสอบแล้วบน v24)
- PostgreSQL กำลังทำงานอยู่

### 1. ติดตั้ง

```bash
npm install
```

> npm 11+ บล็อก install script เป็นค่าเริ่มต้นเพื่อความปลอดภัย
> ต้องอนุมัติ `prisma` และ `esbuild` (ค่านี้ถูกตั้งไว้ใน `allowScripts` แล้ว)

### 2. ตั้งค่า `.env`

```bash
cp server/.env.example server/.env     # Windows: copy server\.env.example server\.env
```

แก้ค่าให้ตรงกับเครื่อง — ขั้นต่ำที่ต้องแก้คือ `DATABASE_URL`

สร้างฐานข้อมูลครั้งแรก:

```sql
CREATE DATABASE nimbus;
```

สุ่มค่า secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Migration + ข้อมูลตัวอย่าง

```bash
npx prisma migrate deploy --schema server/prisma/schema.prisma   # ใช้ schema ที่ commit ไว้
npm run db:seed
```

> ถ้ากำลังพัฒนาและอยากให้ Prisma สร้าง migration เอง: `npm run db:migrate`

### 4. รัน

```bash
npm run dev
```

- เว็บแอป → <http://localhost:5173>
- API → <http://localhost:4000/api>

> Vite proxy `/api`, `/uploads` และ `/socket.io` ไปที่พอร์ต 4000 ทำให้ทุกอย่างอยู่ origin เดียวกัน
> คุกกี้ `httpOnly` จึงทำงานได้โดยไม่ต้องตั้ง CORS เพิ่ม

### บัญชีเข้าใช้งาน

**เครื่องที่รัน `npm run setup` (หรือ `db:seed`) แล้ว** จะมีบัญชีทดลองชุดนี้ — สคริปต์ e2e ทั้งหมด
(`socket-test`, `attachment-test`, `privacy-test`, `account-test`, `video-test`) ล็อกอินด้วยบัญชีเหล่านี้:

| บัญชี | รหัสผ่าน | สิทธิ์ |
| --- | --- | --- |
| `admin@nimbus.dev` | `Admin@1234` | ผู้ดูแลระบบ |
| `sara@nimbus.dev` | `Password@123` | ผู้ใช้ทั่วไป |
| `tony@nimbus.dev` | `Password@123` | ผู้ใช้ทั่วไป |
| `mali@nimbus.dev` | `Password@123` | ผู้ใช้ทั่วไป |
| `nut@nimbus.dev` | `Password@123` | ผู้ใช้ทั่วไป |
| `ploy@nimbus.dev` | `Password@123` | ผู้ใช้ทั่วไป |

> ⚠️ บัญชีชุดนี้ **ห้ามขึ้นโปรดักชัน** — ฐานข้อมูลที่ล้างด้วย `npm run purge:content` หรือที่สร้างใหม่จะไม่มีบัญชี
> เหล่านี้เลย ถ้าเผลอขึ้นไปแล้วให้ใช้ `server/scripts/retire-demo-users.mjs` ปลดออก

**บัญชีของจริง** สร้างด้วยคำสั่งนี้ — สมัครผ่าน API จริง (นโยบายรหัสผ่านและ rate limit ทำงานเหมือนผู้ใช้จริง)
แล้วเลื่อนเป็น ADMIN และยืนยันอีเมลให้:

```bash
node server/scripts/create-admin.mjs you@example.com 'StrongPassw0rd'
```

ลืมรหัสหรือเข้าไม่ได้ → `node server/scripts/set-password.mjs <email> <password>`

> **ไม่มี SMTP?** ระบบจะพิมพ์อีเมลลง log และคืนลิงก์กลับมาที่ API
> ทำให้ทดสอบยืนยันอีเมลและกู้คืนรหัสผ่านได้ครบวงจรโดยไม่ต้องตั้ง mail server
>
> ทดลองแชท: เปิด 2 หน้าต่าง ล็อกอินคนละบัญชี (หรือสมัครบัญชีที่สองผ่านหน้า `/register`) แล้วเข้า `/chat`

---

## การ deploy

### Docker (แนะนำ)

```bash
cp .env.docker.example .env      # แล้วใส่ secret จริง
docker compose up -d --build
```

คอมโพสต์จะ:
1. `prisma migrate deploy` ก่อนเริ่มเซิร์ฟเวอร์
2. เสิร์ฟทั้ง API และไฟล์ client ที่ build แล้ว
3. ใช้ `/api/ready` เป็น Docker healthcheck

รัน maintenance jobs แบบครั้งคราว:

```bash
docker compose run --rm jobs
```

### Render

Repo นี้มี Blueprint ไว้ที่ `render.yaml` — สั่งสร้างทั้ง database และ web service พร้อมกันจากไฟล์เดียว:

1. Push repo นี้ขึ้น GitHub
2. Render Dashboard → **New → Blueprint** → เลือก repo
3. กด Apply แล้วแก้ค่า `sync: false` ที่ dashboard: `PUBLIC_URL` (เอา URL จริงของ service มากรอก ไม่งั้นลิงก์ในอีเมลยืนยัน/รีเซ็ตรหัสจะชี้ไป `localhost`), SMTP และ `APP_ENCRYPTION_KEY` ตามต้องการ
4. Deploy ครั้งแรกจะรัน `prisma migrate deploy` ก่อนเริ่ม server (`docker/entrypoint.sh`) — สร้างบัญชีแอดมินด้วย `node server/scripts/create-admin.mjs <email> <password>`

สิ่งที่ต่างจาก docker-compose:

- **ไฟล์อัปโหลดต้องใช้ persistent disk** — Render ลบไฟล์บน container ทุกครั้งที่ redeploy Blueprint mount disk ที่ `/app/server/uploads` ไว้ให้แล้ว แต่ disk ใช้ได้แค่ paid plan (starter ขึ้นไป) ถ้าใช้ free plan ไฟล์แนบบทความกับภาพปกจะหายทุกครั้งที่มี deploy
- **`ENABLE_JOBS=true`** ใน blueprint เพราะ Render ไม่มี cron job แยก seperti compose — server รัน maintenance jobs เองทุก 30 นาที
- **Socket.IO ใช้ได้เลย** บน Web Service ของ Render (WebSocket รองรับ) ไม่ต้องตั้งเพิ่มเพราะ client เชื่อม origin เดียวกับ API
- ถ้า `prisma migrate deploy` ค้าง (query engine ไม่คืนค่า — เคยเจอบน Windows บางเครื่อง แต่ไม่ใช่บน container Linux) ใช้ `npm run db:apply -- prisma/migrations/<โฟลเดอร์>` จาก log ของ deploy แทน แล้วตั้ง `RUN_MIGRATIONS=false`

### Oracle Cloud Always Free (ฟรีถาวร — เหมาะกับ deploy จริง)

ถ้าจะใช้ระยะยาวโดยไม่จ่ายเงิน  VM ฟรีของ Oracle เก็บไฟล์แนบคงไว้ได้ (Render free ไม่มี persistent disk) คู่มือทีละขั้นอยู่ที่ `deploy/oracle/README.md` — ประกอบด้วย:

- `bootstrap.sh` — ติดตั้ง Docker + Node 22 + เปิด firewall ฝั่ง VM
- `compose.oracle.yml` — override จาก `docker-compose.yml` เอาไว้ (app ฟัง loopback, TLS ไปที่ Caddy)
- `Caddyfile` — HTTPS อัตโนมัติ (จำเป็น เพราะ production ใช้ refresh cookie แบบ `secure`)
- `update.sh` — pull + rebuild + restart

ภาพ `node:22-alpine` / `postgres:16-alpine` รันบน ARM ได้ตามธรรมชาติ ไม่ต้องแก้โค้ด

**เช็คก่อนเปิดใช้จริง** — หลัง container ขึ้นแล้ว รันครั้งเดียว:

```bash
docker compose exec app node server/scripts/preflight.mjs
```

ต้องได้ `0 failure(s)` — ตรวจ env/secret/โดเมน, การเชื่อม DB, สถานะ migration, จำนวนผู้ใช้/หมวดหมู่ และสิทธิ์เขียน
`uploads` (อ่านอย่างเดียว ไม่แก้อะไร) ถ้าอยากให้ warning นับเป็น fail ด้วยให้เพิ่ม `--strict`
container จะ upsert หมวดหมู่มาตรฐานให้เองทุกครั้งที่บูต (`SEED_CATEGORIES=false` เพื่อปิด) จึงไม่ต้องเปิด `RUN_SEED`

### แบบไม่ใช้ Docker

```bash
npm ci
npm run build
npm start          # เสิร์ฟทั้ง API และ client ที่ build แล้ว
```

### ตั้งค่าสำหรับ production

```env
NODE_ENV=production
PUBLIC_URL=https://your-domain.com
CLIENT_ORIGINS=https://your-domain.com
TRUST_PROXY=true
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
# เข้ารหัส TOTP secret ที่บันทึกในฐานข้อมูล
APP_ENCRYPTION_KEY=...
SMTP_HOST=... SMTP_PORT=... SMTP_USER=... SMTP_PASS=...
ENABLE_JOBS=true
# ---- Age gate ----
AGE_GATE_ENABLED=true
AGE_GATE_MIN_AGE=18
AGE_GATE_TTL_DAYS=365
AGE_GATE_IP_BINDING=true
```

- คุกกี้เปลี่ยนเป็น `secure: true` + `sameSite: none` อัตโนมัติเมื่อ `NODE_ENV=production`
- ตั้ง `TRUST_PROXY=true` เมื่อรันหลัง nginx / load balancer เพื่อให้ rate limiter นับ IP จริง
- ตั้ง `APP_ENCRYPTION_KEY` เพื่อเข้ารหัส TOTP shared secret (AES-256-GCM) — และใช้เป็นคีย์ HMAC ของ hash IP ในตาราง `AgeCheck` ด้วย
- `AGE_GATE_ENABLED=true` เปิดเกตยืนยันอายุ (ปิดไว้เป็นค่าเริ่มต้น จึงไม่กระทบ deploy เดิม) ตาราง `AgeCheck` มากับ migration แล้ว — `npm run preflight` จะฟ้องถ้าเปิดเกตแต่ยังไม่ได้ migrate

### สำรองและกู้คืนข้อมูล

```bash
./scripts/backup.sh                 # เขียน backups/nimbus-<ts>.dump.gz
BACKUP_S3_BUCKET=my-bucket ./scripts/backup.sh   # อัปโหลดขึ้น S3 ด้วย
./scripts/restore.sh                # กู้คืนไฟล์ล่าสุด (จะถามยืนยันก่อนทำ)
```

---

## ตัวแปรระบบ

ดูรายละเอียดทั้งหมดใน `server/.env.example` สรุปเฉพาะที่สำคัญ:

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
| --- | --- | --- |
| `DATABASE_URL` | — | **จำเป็น** การเชื่อมต่อ PostgreSQL |
| `JWT_ACCESS_SECRET` | — | **จำเป็น** อย่างน้อย 16 ตัวอักษร |
| `JWT_REFRESH_SECRET` | — | **จำเป็น** ต้องไม่ซ้ำกับ access secret |
| `ACCESS_TOKEN_TTL` | `15m` | อายุ access token |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | อายุ refresh token |
| `LOGIN_MAX_ATTEMPTS` | `8` | จำนวนครั้งที่ใส่รหัสผิดก่อนถูกล็อก |
| `LOGIN_LOCK_MINUTES` | `15` | ระยะเวลาล็อกบัญชี |
| `PASSWORD_RESET_TTL_MINUTES` | `60` | อายุลิงก์รีเซ็ตรหัสผ่าน |
| `EMAIL_VERIFY_TTL_HOURS` | `48` | อายุลิงก์ยืนยันอีเมล |
| `AUTH_LIMIT_MAX` | `20` | จำนวนครั้งที่ **ล็อกอินล้มเหลว** ต่อ IP ก่อนถูกจำกัดอัตรา (เฉพาะครั้งที่ล้มเหลว) |
| `AUTH_LIMIT_WINDOW_MINUTES` | `15` | ความยาวหน้าต่างของตัวจำกัดอัตรา |
| `MAX_UPLOAD_MB` | `5` | ขนาดสูงสุดต่อไฟล์ที่อัปโหลด |
| `MAX_FILES_PER_UPLOAD` | `10` | จำนวนไฟล์สูงสุดต่อคำขออัปโหลดหลายไฟล์ |
| `MAX_ATTACHMENTS_PER_POST` | `20` | จำนวนไฟล์แนบสูงสุดต่อบทความ |
| `SMTP_*` | — | เว้นว่างไว้ = อีเมลถูกพิมพ์ลง log |
| `APP_ENCRYPTION_KEY` | — | เข้ารหัส TOTP secret ในฐานข้อมูล |
| `TRUST_PROXY` | `false` | เปิดเมื่อรันหลัง reverse proxy |
| `ENABLE_JOBS` | `false` | รัน maintenance jobs ในตัวเซิร์ฟเวอร์ |
| `AGE_GATE_ENABLED` | `false` | เปิดเกตยืนยันอายุ 18+ ก่อนเสิร์ฟเนื้อหา (`npm run test:agegate` ต้องเปิดถึงจะทดสอบจริง) |
| `AGE_GATE_MIN_AGE` | `18` | อายุขั้นต่ำ (13–21) — เปลี่ยนแล้วผลยืนยันเดิมถือเป็นโมฆะ ทุกคนตอบใหม่ |
| `AGE_GATE_TTL_DAYS` | `365` | ผลการยืนยันมีอายุกี่วันก่อนถามใหม่ |
| `AGE_GATE_IP_BINDING` | `true` | จำผู้ใช้เดิมด้วย hash ของ IP — ตั้ง `false` เพื่อบังคับตอบใหม่ทุกเบราว์เซอร์ |
| `ANALYTICS_ENDPOINT` | — | ถ้าไม่ตั้ง ระบบจะไม่ส่ง analytics เลย |
| `ERROR_REPORT_ENDPOINT` | — | ถ้าไม่ตั้ง client error จะถูก log ไว้เท่านั้น |

---

## โครงสร้างโปรเจกต์

```
.
├── Dockerfile · docker-compose.yml · docker/entrypoint.sh
├── .github/workflows/ci.yml         # typecheck + build + test + docker smoke
├── scripts/backup.sh · restore.sh    # สำรอง/กู้คืน PostgreSQL
├── scripts/dev-start.ps1 · dev-stop.ps1  # เปิด/ปิด dev server แบบ detached (ไม่ลูกทั้งเครื่อง)
│
├── server/
│   ├── prisma/
│   │   ├── schema.prisma            # โมเดลทั้งหมด
│   │   ├── migrations/              # migration ที่ commit ไว้
│   │   └── seed.ts
│   ├── scripts/
│   │   ├── socket-test.mjs          # ทดสอบ realtime
│   │   ├── upload-test.mjs          # ทดสอบอัปโหลดไฟล์
│   │   ├── attachment-test.mjs      # ทดสอบไฟล์แนบ: แนบ/ดาวน์โหลด/สิทธิ์
│   │   ├── privacy-test.mjs         # ทดสอบซ่อนโปรไฟล์: รายชื่อ/โปรไฟล์/สิทธิ์แอดมิน
│   │   ├── account-test.mjs         # ทดสอบวงจรชีวิตบัญชี
│   │   ├── slug-test.mjs            # ทดสอบ slugify (ไม่ต้องเปิดเซิร์ฟเวอร์)
│   │   ├── totp-test.mjs            # ทดสอบขอบ 30 วินาทีของ 2FA (ไม่ต้องเปิดเซิร์ฟเวอร์)
│   │   ├── allowlist-parity.mjs     # กันลิสต์นามสกุลไฟล์ของ client/server หลุดจากกัน
│   │   ├── apply-migration.mjs      # ใช้ SQL migration โดยไม่ผ่าน Prisma CLI
│   │   ├── show-columns.mjs         # ดูคอลัมน์ของตาราง (ตรวจ migration)
│   │   ├── db-reset.mjs             # ล้าง schema (มี allow list กันพลาด)
│   │   ├── prune-uploads-now.mjs    # ล้างไฟล์อัปโหลดที่ไม่มีอะไรอ้างอิง
│   │   ├── jobs.mjs                 # รัน maintenance jobs
│   │   └── totp.mjs                 # สร้างรหัส TOTP ปัจจุบัน (ช่วยทดสอบ 2FA)
│   └── src/
│       ├── config/     env.ts · logger.ts
│       ├── lib/        prisma · tokens · http · http-error
│       ├── middleware/ auth · validate · upload · rate-limit · error · request-context
│       ├── realtime/   socket server + emitter
│       ├── routes/     auth · 2fa · posts · comments · users · chat · reports · admin · stats · ops · seo · telemetry
│       ├── serializers/
│       ├── services/   mailer · tokens · two-factor · account-security · notifications · jobs
│       ├── app.ts
│       └── index.ts
│
└── client/
    ├── scripts/generate-icons.mjs   # สร้างไอคอน PWA เป็น PNG (ไม่ต้องใช้ dependency เพิ่ม)
    ├── public/                      # sw.js · manifest · offline.html · icons
    └── src/
        ├── components/   Layout · PostCard · CommentSection · Attachments · SecurityPanels · ReportsTab · ui …
        ├── lib/          api · auth · socket · realtime · seo · telemetry · markdown · hooks
        ├── pages/        14 หน้า
        ├── App.tsx · main.tsx · index.css · types.ts
```

---

## API

ทุก response ใช้ envelope เดียวกัน:

```jsonc
{ "success": true,  "data": { } }
{ "success": false, "error": { "message": "...", "code": "NOT_FOUND", "requestId": "..." } }
```

### สาธารณะ

| Method & Path | คำอธิบาย |
| --- | --- |
| `GET /api/health` | liveness probe (ไม่แตะฐานข้อมูล) |
| `GET /api/ready` | readiness probe — 503 เมื่อ dependency ใช้ไม่ได้ |
| `GET /api/metrics` | Prometheus text exposition |
| `GET /robots.txt` · `/sitemap.xml` · `/manifest.webmanifest` | SEO / PWA |
| `POST /api/collect` · `/api/collect/client-errors` · `GET /api/collect/config` | analytics + error reporting |
| `GET /api/age-gate` · `POST /api/age-gate` | เช็ค/ยืนยันอายุ — เส้นทางเนื้อหาทั้งหมดตอบ `403 AGE_VERIFICATION_REQUIRED` จนกว่าจะผ่าน |
| `GET /api/posts` · `/api/posts/:idOrSlug` · `/api/posts/mine/list` | บทความ |
| `GET /api/posts/:idOrSlug/attachments/:attachmentId` | ดาวน์โหลดไฟล์แนบ (`?download=1` บังคับดาวน์โหลดเสมอ) |
| `GET /api/users` · `/api/users/:username` · `/api/users/:username/posts` · `/api/users/online` | สมาชิก |
| `GET /api/categories` · `/api/tags` | หมวดหมู่และแท็ก |
| `GET /api/stats/*` | สถิติสาธารณะ |
| `POST /api/auth/register` · `/login` · `/refresh` · `/logout` | ยืนยันตัวตน |
| `POST /api/auth/verify-email` · `/verify-email/send` | ยืนยันอีเมล |
| `POST /api/auth/password/forgot` · `/password/reset` | กู้คืนรหัสผ่าน |
| `GET /api/posts/:postId/comments` | ความคิดเห็น |

### ต้องเข้าสู่ระบบ

| Method & Path | คำอธิบาย |
| --- | --- |
| `GET/PATCH/DELETE /api/auth/me` | โปรไฟล์ / ลบบัญชี |
| `POST /api/auth/me/password` · `GET/DELETE /api/auth/sessions` · `GET /api/auth/me/export` | ความปลอดภัย + ส่งออกข้อมูล |
| `POST/PATCH/DELETE /api/posts/:id` · `POST /api/posts/:id/like` | เขียนและโต้ตอบ |
| `POST/PATCH/DELETE /api/posts/:postId/comments[/:commentId]` | ความคิดเห็น |
| `DELETE /api/posts/:postId/attachments/:attachmentId` | นำไฟล์แนบออกจากบทความ |
| `GET/POST /api/auth/2fa/*` | 2FA: setup / confirm / disable / status / recovery-codes |
| `GET/POST /api/chat/*` | ห้องแชทและข้อความ |
| `GET /api/notifications/*` | การแจ้งเตือน |
| `POST /api/uploads/image` | อัปโหลดภาพปก |
| `POST /api/uploads/files` · `DELETE /api/uploads/files/:id` | อัปโหลดหลายไฟล์ / ทิ้งไฟล์ที่ยังไม่ผูกกับบทความ |
| `GET/POST /api/reports/*` | รายงานเนื้อหา |

### ผู้ดูแลระบบ

| Method & Path | คำอธิบาย |
| --- | --- |
| `GET /api/admin/stats` | สถิติรวม |
| `GET/PATCH /api/admin/users[/:id]` | จัดการผู้ใช้ (เลื่อนสิทธิ์ / ระงับ) |
| `DELETE /api/admin/users/:id` | ลบผู้ใช้ถาวร — **ไม่มีปุ่มในหน้าเว็บ** (ใช้จากสคริปต์หรือกรณีฉุกเฉินเท่านั้น) |
| `GET/PATCH /api/admin/posts[/:id]` | จัดการบทความ |
| `GET /api/reports/admin/queue` · `PATCH /api/reports/admin/:id` | moderation queue |

---

## Socket.IO events

เชื่อมต่อที่ `ws://localhost:4000/socket.io` พร้อม access token:

```js
io({ auth: { token: accessToken } })
```

**Client → Server:** `chat:join` · `chat:leave` · `chat:send` · `chat:typing` · `chat:read`

**Server → Client:** `ready` · `chat:message` · `chat:typing` · `chat:read` · `chat:error` ·
`presence:online` · `presence:joined` · `presence:left` · `notification:new` · `user:updated`

---

## สคริปต์คำสั่ง

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `npm run dev` | รันทั้ง server และ client พร้อม hot reload (ต้องรันในเทอร์มินัลแยก) |
| `npm run dev:start` | เปิด dev server แบบ detached พร้อมเขียน `.dev-server.pid` — ปิดเทอร์มินัลที่สั่งได้โดยเซิร์ฟเวอร์ไม่ตาย |
| `npm run dev:stop` | ปิดเฉพาะ dev server ตัวนี้ (อ่าน pid จากไฟล์) — **ไม่** kill `node.exe` ทั้งเครื่อง |
| `npm run build` | build ทั้งสองฝั่ง |
| `npm start` | รันจาก build (เสิร์ฟ client ที่ build แล้วด้วย) |
| `npm test` | ทดสอบทั้งหมด: unit (allow list + slug + 2FA) แล้วตามด้วย e2e (realtime + อัปโหลด + ไฟล์แนบ + ซ่อนโปรไฟล์ + วงจรชีวิตบัญชี) |
| `npm run test:unit` | เฉพาะชุดที่ไม่ต้องเปิดเซิร์ฟเวอร์/ฐานข้อมูล (**40 เคส**) |
| `npm run test:e2e` | เฉพาะชุดที่ต้องรันเซิร์ฟเวอร์อยู่ (**94 เคส**) |
| `npm run typecheck` | ตรวจ TypeScript ทั้งสองฝั่ง |
| `npm run setup` | ติดตั้ง + migrate + seed |
| `npm run db:migrate` | สร้าง migration (ตอน dev) |
| `npm run db:deploy` | ใช้ migration ที่ commit ไว้ (ตอน deploy) |
| `npm run db:apply -- prisma/migrations/<โฟลเดอร์>` | ใช้ SQL migration โดยไม่ผ่าน Prisma CLI (ดูหมายเหตุด้านล่าง) |
| `npm run db:seed` | ใส่ข้อมูลตัวอย่าง (**ลบข้อมูลเดิมก่อน**) |
| `npm run db:studio` | เปิด Prisma Studio |
| `npm run jobs` | รัน maintenance jobs หนึ่งครั้ง |
| `npm run uploads:prune` | ลบไฟล์อัปโหลดที่ไม่มีอะไรอ้างอิง (เพิ่ม `-- --dry-run` ได้) |
| `npm run purge:content` | ล้างเนื้อหาทั้งหมด (บทความ คอมเมนต์ แชท บัญชี ไฟล์แนบ) ให้เริ่มจาก 0 — ไม่แตะ schema/migration ledger, ไม่มี `--yes` = นับให้ดูก่อน |
| `npm run categories:add` | เพิ่มหมวดหมู่ที่ขาดจากรายการใน `seed.ts` (ไม่แตะข้อมูลอื่น) |
| `npm run preflight` | ตรวจความพร้อมก่อนเปิดใช้จริง (env, secret, โดเมน, DB, migration, ไฟล์) — exit 1 ถ้ามีปัญหา |

ทดสอบเฉพาะส่วน:

```bash
npm run test:allowlist   --workspace server   # ลิสต์ไฟล์ client/server ตรงกันไหม
npm run test:slug        --workspace server   # slugify + excerpt + เวลาอ่าน
npm run test:totp        --workspace server   # ขอบ 30 วินาทีของรหัส 2FA
npm run test:socket      --workspace server
npm run test:upload      --workspace server
npm run test:attachment  --workspace server   # อัปโหลด/แนบ/ดาวน์โหลด/สิทธิ์
npm run test:privacy     --workspace server   # ซ่อนโปรไฟล์/รายชื่อ/โปรไฟล์/สิทธิ์แอดมิน
npm run test:account     --workspace server
npm run test:agegate     --workspace server   # เส้นทางที่ถูกกัน, เส้นแบ่งวันเกิด, การไม่เก็บวันเกิด
```

> **หมายเหตุ** — `test:totp` จับนาฬิกาของ `otplib` ไว้ที่เวลาคงที่ จึงไม่ต้องรอข้ามขอบ 30 วินาทีจริง และไม่ต้องเปิดเซิร์ฟเวอร์

> **หมายเหตุ `test:e2e`** — สคริปต์ชุดนี้ล็อกอินด้วยบัญชี demo ที่ `npm run db:seed` สร้าง (`admin@nimbus.dev` / `Admin@1234`)
> ถ้าล้างบัญชี demo ออกไปแล้ว (เช่นรัน `npm run purge:content`) ต้อง seed บน**ฐานข้อมูลทดสอบ**ก่อน หรือส่ง `TEST_EMAIL` / `TEST_PASSWORD` ให้สคริปต์ที่รองรับ (`test:upload`, `test:attachment`)
> ห้ามรันชุดนี้กับฐานข้อมูล production

> **หมายเหตุ `test:agegate`** — ต้องรันกับเซิร์ฟเวอร์ที่เปิดเกต (`AGE_GATE_ENABLED=true`) ถ้าเกตปิดอยู่สคริปต์จะข้ามตัวเองและจบด้วย exit 0
> สคริปต์ล้างตาราง `AgeCheck` ก่อนและหลังรัน (แถวพวกนี้คือผลยืนยันที่ทิ้งได้ ไม่ใช่ข้อมูลผู้ใช้) จึงเริ่มจากสภาพเดิมทุกครั้ง

> **หมายเหตุเรื่อง rate limit** — `authLimiter` นับเฉพาะการล็อกอินที่**ล้มเหลว** ต่อ IP (`AUTH_LIMIT_MAX` ครั้งต่อ `AUTH_LIMIT_WINDOW_MINUTES` นาที)
> `test:account` ทำให้ล็อกอินล้มเหลว 3 ครั้งโดยเจตนา ถ้ารันซ้ำหลายรอบอาจเต็มโควตา — สคริปต์จะหยุดพร้อมบอกวิธีแก้ทันที
> ค่าใน `server/.env` ตั้ง `AUTH_LIMIT_MAX=100` ไว้ให้รันทดสอบซ้ำได้, ค่า default ใน `.env.example` คือ 20 สำหรับ production

> `test:account` ต้องใช้บัญชีที่ **ไม่ได้เปิด 2FA** — สคริปต์ปิดให้อัตโนมัติตอนจบ ถ้าถูกหยุดกลางคันให้ restart server
> ช่วยสร้างรหัส TOTP ปัจจุบันเพื่อทดสอบด้วย: `node server/scripts/totp.mjs <secret>`

### หมายเหตุเรื่อง migration

migration ถูกเขียนเป็น SQL ตรง ๆ ใน `prisma/migrations/<timestamp>_<name>/migration.sql` (ไม่ได้ให้ `migrate dev`
generate) แล้ว apply ด้วย `prisma migrate deploy` ตามปกติ — ตรวจสอบแล้วว่า DB เปล่าที่ migrate ด้วยคำสั่งนี้ได้
schema ตรงกับ `prisma/schema.prisma` ทุกตาราง (`migrate diff` ออกมาว่าง)

ถ้าเจอ `migrate deploy` ค้าง (query engine ไม่คืนค่า — เคยเจอบน Windows บางเครื่อง) ให้ใช้
`npm run db:apply -- prisma/migrations/<โฟลเดอร์>` แทน ซึ่งรันทั้งหมดใน **transaction เดียว**
(ล้มเหลว = ไม่เปลี่ยนอะไรเลย) และบันทึกลง `_prisma_migrations` ให้เอง รันซ้ำได้โดยไม่มีผล (เช็ค ledger ก่อน)

---

## การตรวจสอบและประสิทธิภาพ

### Endpoint สำหรับระบบ

```bash
curl http://localhost:4000/api/health      # liveness
curl http://localhost:4000/api/ready       # readiness
curl http://localhost:4000/api/metrics     # Prometheus
```

ตัวชี้วัดที่ส่งออก: จำนวนสมาชิก, ผู้ใช้งาน 15 นาที, บัญชีถูกระงับ, บทความ, ความคิดเห็น, ข้อความ,
รายงานที่ค้าง, เซสชันที่ใช้งาน, uptime, memory

### Logging

- **Development** — สีสวย อ่านง่าย
- **Production** — JSON หนึ่งบรรทัดต่อ event พร้อม `requestId` ส่งเข้า Loki/CloudWatch ได้ทันที
- ฟิลด์อย่าง `password`, `token`, `authorization` ถูก mask เป็น `[redacted]` อัตโนมัติ
- ทุก response มี header `x-request-id` ให้ผู้ใช้อ้างอิงตอนแจ้งปัญหา

### CI

`.github/workflows/ci.yml` ทำอัตโนมัติ: ติดตั้ง → migrate → typecheck → build →
รัน integration tests → build Docker image → smoke test

---

## ความปลอดภัย

- **Access token** อายุสั้น (15 นาที) เก็บใน memory ของ browser เท่านั้น ไม่เขียนลง `localStorage`
- **Refresh token** อยู่ในคุกกี้ `httpOnly` + `path=/api/auth` และ **หมุนแบบใช้ครั้งเดียว**
  เก็บเป็น SHA-256 hash ในฐานข้อมูล และถูกหมุนทุกครั้งที่ refresh
- **Token ทุกชนิด** (ยืนยันอีเมล, กู้คืนรหัสผ่าน) เก็บเป็น hash, ใช้ครั้งเดียว, มีวันหมดอายุ
- เทียบ token ด้วย constant-time comparison เพื่อกัน timing attack
- **TOTP secret** เข้ารหัส AES-256-GCM เมื่อตั้ง `APP_ENCRYPTION_KEY`
- **Recovery code** เก็บเป็น hash และถูกลบทันทีที่ใช้
- การเปลี่ยน/รีเซ็ตรหัสผ่านยกเลิกทุกเซสชันของผู้ใช้ทันที
- **Login lockout** เมื่อใส่รหัสผ่านผิดเกิน `LOGIN_MAX_ATTEMPTS`
- **Timing-safe login**: เทียบ bcrypt เสมอ แม้ไม่มีบัญชี เพื่อไม่เปิดเผยว่าอีเมลมีสมาชีหรือไม่
- ตรวจสอบ input ทุก endpoint ด้วย Zod และแปลงข้อผิดพลาดเป็นข้อความภาษาไทย
- จำกัดอัตราการเรียก: ทั่วไป 600/นาที, สมัคร+เข้าสู่ระบบ 20/15 นาที, เขียน 60/นาที, อัปโหลด 30/นาที
- อัปโหลดไฟล์จำกัดเฉพาะ MIME ของรูปภาพและขนาดไฟล์ พร้อมป้องกัน path traversal
- **Markdown renderer escape HTML ก่อนแปลง** และกรอง URL scheme อันตราย
- **CSP, HSTS, frame-ancestors 'none', nosniff** ตั้งโดย Helmet
  - `script-src` เป็น `'self'` ไม่มี `'unsafe-inline'` — inline script เดียวที่อนุญาตคือตัวกันธีมกะพริบใน `index.html` โดยเซิร์ฟเวอร์คำนวณ sha256 จากไฟล์ที่เสิร์ฟจริงตอนบูต (แก้ snippet แล้ว hash ตามให้เอง ไม่มีทางหลุด sync)
- **Age gate** เก็บเฉพาะผลการยืนยันกับ hash ของ IP (HMAC-SHA256) ไม่เก็บวันเกิด และไม่เก็บคำตอบที่ไม่ผ่านเลย
- **Audit log** ทุกการเปลี่ยนสิทธิ์ ระงับบัญชี ลบบัญชี และแก้ไขรายงาน
- Cookie เปลี่ยนเป็น `secure` + `sameSite=none` อัตโนมัติเมื่อ `NODE_ENV=production`