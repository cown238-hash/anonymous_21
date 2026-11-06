# Deploy ด้วย Cloudflare Tunnel (รันบนเครื่องตัวเอง — ฟรี ไม่ต้องมีบัตร)

ทางนี้ใช้เมื่อ **ยังไม่มี VM** (เช่น ไม่มีบัตรเครดิตให้สมัคร Oracle/Azure) แต่ยัง
อยากให้ `app.wksl.site` ใช้งานได้จริง แอปกับ Postgres รันบนเครื่องนี้ตามปกติ
แล้วส่งออกผ่าน tunnel ของ Cloudflare ที่ต่อออกไปข้างนอกอย่างเดียว

```
เบราว์เซอร์ → Cloudflare edge (TLS) → tunnel (ขาออกเท่านั้น) → localhost:4000
```

| ข้อดี | ข้อแลกเปลี่ยน |
| --- | --- |
| ฟรี 100% ไม่ต้องใช้บัตร, ไม่ต้องมี IP สาธารณะ, ไม่ต้องเปิด port | **เครื่องต้องเปิดอยู่** — ปิด/หลับ = เว็บล่ม |
| ฟีเจอร์ครบ: realtime, อัปโหลดไฟล์, Postgres, HTTPS จริง | bandwidth วิ่งผ่านเน็ตบ้านของคุณ |
| apex `wksl.site` กับ `app.wksl.site` เปิดแอปได้ทั้งคู่ (canonical = `app.wksl.site`) | จัดการ TLS/cache ที่ Cloudflare ไม่ได้ปรับละเอียดเท่า Caddy |

## โครงสร้าง

| ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `start-app.ps1` | รัน API + client ที่ build แล้ว (`client/dist`) โหมด production บน `127.0.0.1:4000` — ตายแล้วรีสตาร์ตเองทุก 5 วิ |
| `start-tunnel.ps1` | รัน `cloudflared` ด้วย config ใน `%USERPROFILE%\.cloudflared\config.yml` — รีสตาร์ตเองเช่นกัน |
| `start-all.ps1` | เปิดทั้งสองเป็น process เบื้องหลัง — **ตัวที่ Windows เรียกตอนล็อกอิน** |
| `watchdog.ps1` | เช็คทุก 2 นาทีว่ามี supervisor ทั้งสองตัวอยู่ไหม — ถ้าหายไป (เช่น Windows ฆ่าตอน sleep) เรียก `start-all.ps1` กลับมาให้ |

Windows เรียก `start-all.ps1` ผ่านไฟล์ `WKSL.vbs` ที่วางไว้ใน Startup folder
(`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WKSL.vbs`) ซึ่งรันแบบ
ซ่อนหน้าต่างและไม่ต้องใช้สิทธิ์ admin — และมี `WKSL-Watchdog.vbs` ตัวที่สองคอย
เรียก `watchdog.ps1` (ตัว watchdog จะเรียก `start-all.ps1` เองเมื่อจำเป็น)

> **ทำไมไม่ใช้ scheduled task:** บัญชีผู้ใช้ธรรมดาสร้าง task ไม่ได้ — ทั้ง
> `Register-ScheduledTask` และ `schtasks /create` ตอบ `Access is denied`
> (จะใช้ได้ก็ต่อเมื่อเปิด PowerShell แบบ Run as administrator)

## ตั้งครั้งแรก (สิ่งที่ต้องมีอยู่แล้ว)

1. `cloudflared` ติดตั้งแล้ว (`winget install Cloudflare.cloudflared`)
2. ล็อกอินครั้งเดียว: `cloudflared tunnel login` → เลือกโซน `wksl.site` → **Authorize**
   (เก็บ `cert.pem` ไว้ที่ `%USERPROFILE%\.cloudflared\`)
3. สร้าง tunnel + ผูกชื่อ:
   ```powershell
   cloudflared tunnel create wksl
   cloudflared tunnel route dns wksl app.wksl.site
   cloudflared tunnel route dns --overwrite-dns wksl wksl.site
   ```
   คำสั่งที่สองจะ **เพิ่ม CNAME `app.wksl.site`** ชี้เข้า tunnel — ไม่ลบ/แก้ record เดิม
   ส่วนคำสั่งที่สามชี้ apex เข้า tunnel ด้วย (เปิด `wksl.site` ก็เจอแอป) ซึ่ง
   **ต้องใช้ `--overwrite-dns`** เพราะ apex มี record เดิมอยู่ (ตัว command จะพิมพ์
   `Failed to add CNAME ... Tunnel is not yet registered` แต่ให้ดูแถว "Added CNAME"
   ที่แสดงไว้ — ถ้ามีแถวนั้นแปลว่าสำเร็จแล้ว)
4. เขียน `%USERPROFILE%\.cloudflared\config.yml`:
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL_ID>.json
   ingress:
     - hostname: app.wksl.site
       service: http://localhost:4000
     - hostname: wksl.site
       service: http://localhost:4000
     - service: http_status:404
   ```
5. ให้เว็บกลับมาเองหลังรีสตาร์ต — สร้าง `WKSL.vbs` ใน Startup folder
   (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WKSL.vbs`):
   ```vbs
   ' Launches the WKSL app + Cloudflare Tunnel in the background at logon.
   Set shell = CreateObject("WScript.Shell")
   shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File <repo>\deploy\tunnel\start-all.ps1", 0, False
   ```
   เลข `0, False` = ซ่อนหน้าต่าง และไม่รอให้จบ (ไม่บล็อกการล็อกอิน)
6. ตัวคุมความเรียบร้อย — สร้าง `WKSL-Watchdog.vbs` ใน Startup folder เดียวกัน:
   ```vbs
   ' Restarts the WKSL supervisors if Windows ever ends them.
   Set shell = CreateObject("WScript.Shell")
   shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File <repo>\deploy\tunnel\watchdog.ps1", 0, False
   ```
   ใช้ mutex กันเปิดซ้ำ และสั่ง supervisor ผ่าน WMI เพื่อให้ไม่ตายตาม process แม่

## ค่าที่ต้องตรงกัน 3 ที่ (ไม่งั้น tunnel ต่อได้แต่แอปนับ IP ผิด)

| ที่ | ค่า |
| --- | --- |
| `config.yml` | `hostname: app.wksl.site` และ `wksl.site` → `service: http://localhost:4000` |
| root `.env` | `PUBLIC_URL=https://app.wksl.site` (canonical) และ `CLIENT_ORIGINS=https://app.wksl.site,https://wksl.site,http://localhost:5173` |
| root `.env` | **`TRUST_PROXY=true` + `TRUST_PROXY_HOPS=1`** |

`TRUST_PROXY_HOPS=1` เพราะ cloudflared เป็น proxy เดียวที่แอปมองเห็น — ถ้าปิด
`TRUST_PROXY` หรือตั้ง hops ผิด ทุกคนจะถูกมองเป็น `127.0.0.1` และ rate limit
จะรวมกันเป็น bucket เดียว

ตรวจว่าได้จริง: ขอ `https://app.wksl.site/api/health` แล้วดู log ของแอป
(`ip=` ต้องเป็น IP สาธารณะของคุณ ไม่ใช่ `127.0.0.1`)

## ใช้งานประจำวัน

```powershell
# เปิด (เรียกซ้ำได้ ปลอดภัย — สคริปต์เช็กพอร์ต 4000 และ process cloudflared ก่อน)
powershell -ExecutionPolicy Bypass -File deploy\tunnel\start-all.ps1

# ปิด
Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
```

log อยู่ที่ `logs\app.log` และ `logs\tunnel.log` (ตัดอัตโนมัติเมื่อเกิน 20 MB,
ถูก ignore โดย `.gitignore`) — ดูสด: `Get-Content logs\app.log -Tail 20 -Wait`

## ย้ายขึ้น VM ทีหลัง (เมื่อมีงบ ~300 บาท/เดือน หรือได้ Azure for Students)

ข้อมูลทั้งหมดอยู่ใน Postgres ของเครื่องนี้ — ย้ายด้วย `scripts/backup.sh` +
`scripts/restore.sh` (ดู README หลัก) แล้ว deploy บน VM ตาม
`deploy/oracle/README.md` จากนั้นชี้ DNS record `app` ไปที่ IP ของ VM
(หรือสร้าง tunnel ใหม่บน VM แล้วชี้ tunnel เดิมไปที่นั่น) — ไม่ต้องแก้โค้ด

## ข้อควรรู้

- หลังสร้าง record `app` ใหม่ **DNS ของเครื่องนี้อาจยัง cache คำตอบเก่า** (NXDOMAIN)
  ทำให้เปิด `app.wksl.site` จากเครื่องนี้ไม่ขึ้นชั่วคราว — ลองจากมือถือ (เน็ตคนละเส้น)
  หรือรอ cache หมดอายุ ส่วนคนอื่นเปิดได้ปกติ
- อย่าลบ `WKSL.vbs` ออกจาก Startup folder แล้วคาดว่าเว็บจะยังอยู่ — มันคือตัวที่ทำให้เว็บกลับมาเอง
- ถ้าเครื่องรีสตาร์ตแล้ว**ยังไม่ล็อกอิน Windows** เว็บจะยังไม่ขึ้น (Startup folder ทำงานตอนล็อกอินเท่านั้น)
- **เครื่องหลับ = เว็บล่มทันที** (cloudflared เห็น connection หลุดหมดแล้วจบการทำงาน) —
  ตั้งไม่ให้หลับเมื่อเสียบปลั๊ก: `powercfg /change standby-timeout-ac 0` และเสียบอะแดปเตอร์ตลอด
  ถ้าปิดฝาแล้วเครื่องหลับ ให้ตั้ง Control Panel → Power Options → *Choose what closing the lid does*
  เป็น **Do nothing** (บางรุ่นซ่อนค่านี้จาก `powercfg`) — ระหว่างหลับ watchdog ก็หลับไปด้วย
- สงสัยว่า supervisor ตายหรือเปล่า: ดู `logs\watchdog.log` (watchdog เขียนทุกครั้งที่ต้องปลุกกลับมา)
- ตรวจว่า proxy ยังตั้งถูก: เปิด `https://app.wksl.site/api/health` แล้วดู `ip=` ใน `logs\app.log`
  — ถ้าเห็น `127.0.0.1` แปลว่า `TRUST_PROXY`/`TRUST_PROXY_HOPS` หลุด ให้แก้ก่อนใช้งานจริง
- อัปเดตโค้ด: `npm run build` → หยุด process ที่พอร์ต 4000 → supervisor จะรีสตาร์ตด้วย build ใหม่เอง
  (tunnel ไม่ต้องแตะ)
- หลัง deploy ที่แตะ `sw.js` ให้เช็คว่า edge Cloudflare เสิร์ฟตัวใหม่หรือยัง
  (เก่า = push ไม่ทำงาน): `powershell -ExecutionPolicy Bypass -File deploy\tunnel\check-sw-cache.ps1`
  ถ้ายังเป็น `push:MISSING` ให้ purge ที่ dashboard (Caching → Configuration → Custom Purge URL:
  `https://app.wksl.site/sw.js` กับ `https://wksl.site/sw.js`) — ตัว origin ส่ง `Cache-Control: no-cache`
  ให้แล้วจึงรอ edge หมดอายุเองก็ได้
