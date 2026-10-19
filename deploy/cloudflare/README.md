# ตั้ง Cloudflare สำหรับ `wksl.site`

แอปเป็น container เดียวบน Oracle VM ที่พี่มีอยู่แล้ว สิ่งที่ Cloudflare เพิ่มเข้าไปคือ
**TLS ขอบนอก + CDN + กัน DDoS/WAF** โดยเว็บยังวิ่งบน VM เหมือนเดิม:

```
browser ──https──▶ Cloudflare (TLS, cache, WAF, rate limit ขอบ)
                                 │
                          https (Full strict)
                                 │
                              Caddy (TLS บน VM)
                                 │
                        app container :4000 (loopback)
```

ทำตามทีละข้อ แล้วในที่สุดจะได้ `https://wksl.site` ที่แชทเรียลไทม์ (Socket.IO)
ใช้งานได้ปกติ

> ส่วนที่ต้องทำในบัญชี Cloudflare ผมทำแทนไม่ได้ทุกขั้น — ทุกขั้นมีเมนูให้กดตามนี้เลย
> ถ้าจะใช้ CLI แทน dashboard ก็ใช้ `flarectl` ทำได้เหมือนกัน

---

## 0. สิ่งที่ต้องมี

- บัญชี Cloudflare (ฟรี) — <https://dash.cloudflare.com/sign-up>
- VM (Oracle) ที่รัน stack ไว้แล้วและทราบ **IP คงที่** ของมัน
- บัญชี registrar ที่จดโดเมน `wksl.site` อยู่ (ที่ที่ซื้อโดเมนมา) — เอาไว้แก้ nameserver

> ถ้า site ใน Cloudflare ขึ้น **Active** แล้ว (NS ชี้มาแล้ว) ให้ข้ามข้อ 1–2 แล้วไปเริ่มที่ข้อ 3 ได้เลย

## 1. เพิ่ม domains เข้า Cloudflare

1. **Add a site** (หรือ *Add a domain*) → พิมพ์ `wksl.site` → **Continue**
2. เลือก plan **Free** → Continue
3. Cloudflare จะแสดง **nameservers 2 ตัว** ให้ เช่น
   `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com` — **คัดลอกเก็บไว้ ใช้ในข้อ 2**

## 2. เปลี่ยน nameserver ที่ registrar

ที่หน้าจัดการโดเมนของร้านที่ซื้อ (Namecheap / GoDaddy / Hostinger / Onamae / THNIC ฯลฯ):

1. หาหน้า **Nameservers** / **DNS** → เลือก **Custom DNS** (ไม่ใช่ default parking)
2. วาง nameserver 2 ตัวจากข้อ 1 ทั้งสองช่อง แล้ว Save

 Propagate ใช้ไม่กี่นาที ถึงครึ่งชั่วโมง เช็คสถานะที่หน้า site ใน
Cloudflare เป็น **Active** แล้วค่อยทำข้อถัดไป หมายเหตุ: ถ้า registrar ไทยที่คุย
กับ registry ช้า อาจนานที่สุด ~24 ชม.

> ระหว่างนี้**อย่าแก้ DNS ที่ registrar เดิม** — จากนี้ DNS ทั้งหมดจัดการที่ Cloudflare
> แทน ถ้าแก้ทั้งสองที่อาจทำให้สับสนและผิดพลาดได้

## 3. สร้าง DNS records

หน้า **DNS → Records** เพิ่ม 2 รายการ:

| Type | Name | Target (IPv4) | Proxy status | TTL |
| --- | --- | --- | --- | --- |
| `A` | `@` | `<IP ของ VM Oracle>` | **Proxied** | Auto |
| `CNAME` | `www` | `wksl.site` | **Proxied** | Auto |

- **หัวใจคือ "Proxied"** (เมฆส้ม) ถ้าเป็น DNS only (เมฆเทา) traffic จะเดินตรงเข้า VM
  ไม่ผ่าน Cloudflare เลย — บัญชีใหม่มักตั้ง default เป็น Proxied อยู่แล้ว แต่ให้เช็คให้ชัวร์
- ไม่ต้องทำ AAAA (IPv6) เว้นแต่ VM มี IPv6 จริง
- ถ้าติดตั้ง Caddy บน VM ยังไม่เสร็จ จะเปิด A record ไว้ก่อนก็ได้ DNS จะ resolve ตามที่ตั้งไว้
  พอ VM พร้อมก็ใช้งานได้ทันที

## 4. SSL/TLS — ตั้งเป็น **Full (strict)**

เมนู **SSL/TLS → Overview**:

| ตัวเลือก | ตั้งเป็น | ทำไม |
| --- | --- | --- |
| Encryption mode | **Full (strict)** | ตรวจใบรับรองที่ origin จริง Caddy บน VM มีใบของ Let's Encrypt อยู่แล้ว จึงปลอดภัยทั้งสองฝั่ง |
| ~~Flexible~~ | **ห้ามใช้** | จะส่ง traffic จาก Cloudflare มา VM เป็น HTTP เปล่า — webhook ไม่ปลอดภัย และทำให้ redirect วน |
| ~~Full~~ | ไม่พอ | ไม่ตรวจใบที่ origin |

ยืนยันว่าใบรับรองปลายทางสมบูรณ์:

```bash
curl -fsS https://wksl.site/api/ready    # ต้องได้ {"success":true,...} ไม่ใช่ error 525/526
```

ถ้าเจอ **525 / 526** แปลว่า Caddy ฝั่ง VM ยังไม่มีใบ หรือโดเมนยังไม่ชี้ — ดู [แก้ปัญหา](#แก้ปัญหาที่เจอบ่อย)

## 5. เปิดของที่ต้องเปิด

**Network** (แถบซ้าย):

| การตั้งค่า | ค่า | หมายเหตุ |
| --- | --- | --- |
| WebSockets | **On** | Socket.IO ต้องการ — ปิดอยู่ แชทจะไม่ทำงาน (มือถืออาจดีฟอลต์เปิดอยู่แล้ว) |
| HTTP/3 (QUIC) | On (ตามชอบ) | เร็วขึ้น สำหรับเน็วมือถือ |
| 0-RTT Connection Resumption | Off | cookie/token บาง flow ไม่ replays ปลอดภัย |

**Speed → Optimization**:

| การตั้งค่า | ค่า |
| --- | --- |
| Brotli | **On** |
| Rocket Loader | **Off** — ตัวนี้รวม/หน่วงการทำงาน JS ทำให้ React app พังเงียบ ๆ |
| Auto Minify (JS/CSS/HTML) | ปิดก็ได้ — Vite minify ให้หมดแล้ว (minify ซ้ำอาจทำให้ JS พัง) |
| Early Hints | On (ตามชอบ) |

## 6. Cache rules — สำคัญที่สุดข้อนี้

โดเมนที่ proxied ระดับ CDN โดย default จะ cache เฉพาะไฟล์ที่มีนามสกุล static
(`.js`, `.css`, `.png` ...) ซึ่ง `/sw.js` ของ PWA กับ `/api/*` ก็เข้าเกณฑ์ไปด้วย —

เมนู **Caching → Cache rules → Create rule** ทำ 4 กติกา นี้:

**Rule 1 — app bundle (cache ได้เพราะมี hash ในชื่อไฟล์)**

| ตัว | ค่า |
| --- | --- |
| Rule name | `static-assets` |
| When incoming requests match | URI Path starts with `/assets/` |
| Cache eligibility | Eligible for cache |
| Edge TTL | Ignore cache-control headers and use this TTL — `1 year` |

**Rule 2 — API ห้าม cache เด็ดขาด**

| ตัว | ค่า |
| --- | --- |
| Rule name | `api-bypass` |
| When | URI Path starts with `/api/` |
| Cache eligibility | **Bypass cache** |

**Rule 3 — ตัวเรียลไทม์ (Socket.IO) ห้าม cache**

| ตัว | ค่า |
| --- | --- |
| Rule name | `socket-bypass` |
| When | URI Path starts with `/socket.io/` |
| Cache eligibility | **Bypass cache** |

**Rule 4 — service worker / manifest ต้องตรงเสมอ**

| ตัว | ค่า |
| --- | --- |
| Rule name | `pwa-bypass` |
| When | Hostname equals `wksl.site` **AND** URI Path is in (`/sw.js`, `/manifest.webmanifest`, `/offline.html`) |
| Cache eligibility | **Bypass cache** |

ภาพปก/รูปโปรไฟล์ (`/uploads/...`) — app เป็นตัวกำหนดเองว่า cache นานเท่าไหร่ (30 วัน, ชื่อไฟล์สุ่มไม่ซ้ำ)
ปล่อย default ใช้ origin header ก็ได้ ถ้าไม่อยากให้ edge ค้างไฟล์ที่ถูกลบเป็นเวลา 30 วัน
เพิ่ม rule ที่ห้า: `Eligible for cache` + Edge TTL `1 day` (ไม่บังคับ)

> ทดสอบว่า rule ใช้ได้: `curl -sI https://wksl.site/assets/... | grep -i cf-cache-status`
> ไฟล์ที่มี hash ของ Vite ควรได้ `HIT` (ครั้งแรกเป็น `MISS`) ส่วน `/api/posts`
> ต้องได้ `BYPASS` หรือ `DYNAMIC`

## 7. ล็อก origin ให้เข้าผ่าน Cloudflare เท่านั้น

ตอนนี้ VM ยังเปิด 80/443 ให้ทั้งอินเทอร์เน็ต — ใครรู้ IP ก็ยิงมาตรง ๆ ได้
โดยไม่ต้องผ่าน Cloudflare ทำ 2 ที่:

1. **VM (iptables)** — บน VM:

   ```bash
   LOCK_TO_CLOUDFLARE=true bash deploy/oracle/bootstrap.sh
   ```

   (แนะนำให้ออกใบรับรองให้เสร็จก่อน แล้วค่อยมาล็อก ไม่งั้น Let's Encrypt จะตรวจไม่ผ่าน
   เพราะตอบ Cloudflare challenge ไม่ได้)

2. **Oracle VCN Security List** (ชั้นที่สองที่คนมักลืม) — ตั้ง ingress 80/443 ให้
   source `0.0.0.0/0` เหมือนเดิมได้ แต่ถ้าอยากให้ตรงกับ `iptables` เป๊ะ ๆ ก็นำ
   [Cloudflare IP ranges](https://www.cloudflare.com/ips/) มาลงเป็น CIDR แทนได้

เช็คว่าล็อกแล้ว:

```bash
curl -I http://<IP VM>/api/health    # ต้อง timeout / ไม่ตอบ
curl -fsS https://wksl.site/api/ready   # ต้องตอบปกติ
```

## 8. ค่าที่ VM ต้องตั้ง (ครั้งสุดท้าย)

```bash
cd ~/app && nano .env
```

```env
PUBLIC_URL=https://wksl.site
CLIENT_ORIGINS=https://wksl.site,https://www.wksl.site
# Cloudflare → Caddy → app = 2 hops ไม่งัน rate limiter จะนับ IP ของ Cloudflare
# แทน IP ผู้ใช้ (คนละกับผู้ใช้จริง อาจล็อกทั้งระบบผิดคน)
TRUST_PROXY_HOPS=2
```

> `TRUST_PROXY_HOPS` อ่านแล้วใส่ทั้ง Express (`req.ip`) และ express-rate-limit
> เดิม `TRUST_PROXY=true` คุมแค่ฝั่งเดียว — ถ้าเว็บขึ้นแล้วเจอ error
> `429 Too many requests` สาเหตุปลายทางมักมาจากจุดนี้

แล้ว up ใหม่และตรวจ:

```bash
docker compose -f docker-compose.yml -f deploy/oracle/compose.oracle.yml up -d
curl -fsS https://wksl.site/api/ready
curl -sI https://wksl.site/ | grep -iE 'strict-transport|cache-control|cf-cache-status'
```

เปิดเบราว์เซอร์: ล็อกอิน → เข้า `/chat` ส่งข้อความ → เปิดสองแท็บดูว่าข้อความขึ้นทั้งสองแท็บทันที

## 9. อีเมล (ถ้าจะเปิดยืนยันตัวตนจริง)

ตอนนี้ SMTP ไม่ได้ตั้ง — ระบบพิมพ์ลิงก์ลง log แทน ถ้าจะส่งเมลจาก `wksl.site` จริง ๆ
ต้องเพิ่มใน Cloudflare DNS (**DNS → Records**, ฝั่ง Email):

| Type | Name | ค่า |
| --- | --- | --- |
| `MX` | `@` | ตามผู้ให้บริการอีเมล (Priority 10 ...) |
| `TXT` | `@` | `v=spf1 include:<ผู้ให้บริการ> ~all` |
| `TXT` | `*_domainkey` หรือ `mail._domainkey` | DKIM ที่ผู้ให้บริการให้มา |

> **อย่าเสียบ SMTP ของ Gmail/Yahoo ตรง ๆ** — ปลายทาง `wksl.site` ที่ส่งจาก IP
> ไม่มี PTR/SPF แก้ปัญหาไม่ได้ ใช้บริการที่ทำ marketing/transactional ให้
> (Resend / Mailgun / Brevo …) ก็ `SMTP_HOST` ใน `.env` ได้ตามเดิม

## 10. ตรวจหลังติดตั้ง

| เช็ค | ควรได้ |
| --- | --- |
| `curl -sI https://wksl.site` | `HTTP/2 200` + header `cf-ray:` ขึ้นต้น |
| `curl -sI https://wksl.site/api/health` | `cf-cache-status: BYPASS/DYNAMIC` |
| หน้าเว็บ | favicon + โลโก้โหลด ปุ่ม login ใช้ได้ |
| `/chat` ส่งข้อความข้ามแท็บ | ทันที ไม่มี error ใน devtools |
| devtools → Application → Service Workers | `activated` (cache rule ข้อ 6 ทำถูก) |
| ทดสอบ: เปิดเบราว์เซอร์ไปที่ `https://www.wksl.site` | ขึ้นปกติ ไม่มี certificate error |

### ตรวจว่า IP จริงถึง server (สำคัญ)

```bash
docker compose -f docker-compose.yml -f deploy/oracle/compose.oracle.yml logs app | tail
```

ใน log ทุก request จะเห็น `ip` เป็น IP ของผู้ใช้จริง ไม่ใช่ `172.68.x.x`
(Cloudflare edge) ถ้าเห็นเป็น IP ของ Cloudflare แปลว่า `TRUST_PROXY_HOPS` ไม่ตรงกับจำนวน proxy

---

## แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ | แก้ |
| --- | --- | --- |
| `525` / `526` | TLS ปลายทางไม่สมบูรณ์ หรือโดเมนยังไม่ได้ชี้มาที่ VM | รอ DNS propagate / เช็ค Caddy `systemctl status caddy` |
| ปุ่มอะไรก็กดไม่ได้, `429` ทันที | `TRUST_PROXY_HOPS=1` ขณะ Cloudflare อยู่หน้า — rate limit รวม IP edge | ตั้ง `2` แล้ว `up -d` |
| แชทขึ้น spinner ไม่มีข้อความ | WebSockets ปิดที่ Cloudflare | Network → WebSockets → On |
| กดแล้วเป็นหน้า error / CSS หาย | Apt-Cloudflare Rocket Loader ยัง On | ขั้นตอนที่ 5 ตั้ง Off |
| SW แจ้ง "new content available" ค้าง | service worker ยังเป็นไฟล์เก่าเพราะถูก cache ไว้ | ขั้นตอนที่ 6 ตั้ง rule 4 (`pwa-bypass`) แล้ว hard reload |
| เมลยืนยันลิงก์ชี้ `localhost` | `PUBLIC_URL` ยังเป็นค่าเดิม | ตั้ง `https://wksl.site` ใน `.env` แล้ว rebuild |
| `ERR_TOO_MANY_REDIRECTS` | SSL mode เป็น Flexible | ตั้ง Full (strict) ขั้นตอนที่ 4 |
| `www` ไม่งาน | ไม่มี record / proxied ไม่ตรง | อย่าให้ `www` เป็น DNS-only ถ้าตั้ง Caddy รองรับ 2 host (ทำไว้แล้ว) |

ถ้าจะลอง Workers/Pages เต็มรูปแบบทีหลัง (แชทย้ายไป Durable Objects, ไฟล์ย้าย R2)
ค่อยบอกได้ แต่ Stack แบบนี้รันได้เต็มความสามารถบน configuration นี้แล้ว
— __ถ่ายรูปหรือแนบ log มาได้เลยตอนเจอปัญหา__
