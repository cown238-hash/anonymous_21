/**
 * AI Service สำหรับผู้ช่วยแชทในเว็บไซต์ WKSL
 *
 * ตอนนี้ใช้จำลองการตอบกลับ (mock) เพื่อให้ใช้งานได้ทันทีโดยไม่ต้องมี API key
 * ถ้าต้องการเชื่อมต่อ AI จริง (เช่น OpenAI, หรือ endpoint ของตัวเอง)
 * ให้แก้ฟังก์ชัน `askAI` ให้เรียก fetch ไปยัง server ของคุณ
 */

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface AIOptions {
  onMessage?: (msg: AIMessage) => void;
}

/* ---- ตัวอย่างคำตอบสำเร็จรูป (ใช้เมื่อยังไม่มี AI จริง) ---- */
const MOCK_REPLIES: Record<string, string[]> = {
  greet: [
    'สวัสดีครับ! ฉันคือผู้ช่วยของ WKSL มีอะไรให้ช่วยไหมครับ',
    'สวัสดีครับ ยินดีให้บริการ อยากทราบอะไรเกี่ยวกับ WKSL บ้างครับ',
    'สวัสดีครับ ยินดีต้อนรับสู่ WKSL ชุมชนแบ่งปันความรู้ครับ',
  ],
  howToWrite: [
    'กดปุ่ม "เขียน" ที่แถบบน หรือไปที่ /posts/new เพื่อสร้างบทความใหม่ได้เลยครับ',
    'เข้าเมนูด้านซ้ายเลือก "เขียนบทความ" หรือคลิกปุ่มเขียนบนหน้าแรกครับ',
    'หลังจากเขียนแล้วสามารถแนบไฟล์ได้สูงสุด 20 ไฟล์ต่อบทความ และใส่แท็กได้สูงสุด 8 แท็กครับ',
  ],
  howToChat: [
    'ไปที่เมนู "แชท" ด้านซ้าย หรือพิมพ์ /chat ในที่อยู่เบราว์เซอร์ ก็จะเข้าห้องแชทได้ครับ',
    'แชทของ WKSL ใช้ Socket.IO แบบเรียลไทม์ ส่งข้อความแล้วเห็นผลทันทีครับ',
    'มีทั้งห้องสาธารณะและห้องแชทส่วนตัว สามารถสร้างห้องใหม่ได้ครับ',
  ],
  about: [
    'WKSL เป็นแพลตฟอร์มชุมชนสำหรับแชร์ความรู้ เขียนบทความ แชร์ไฟล์ และแชทแบบเรียลไทม์ สร้างด้วย React + Node + PostgreSQL ครับ',
    'WKSL คือเว็บชุมชนแบบ full-stack มีระบบสมาชิก 2FA ดีชบอร์ดส่วนตัว และแผงผู้ดูแลระบบพร้อม moderation ครับ',
  ],
  loginRegister: [
    'สมัครสมาชิกได้ที่หน้า /register หรือกดปุ่ม "สมัครสมาชิก" บนหน้าแรกครับ',
    'เข้าสู่ระบบได้ที่หน้า /login หรือกดปุ่ม "เข้าสู่ระบบ" บนแถบนำทางครับ',
    'ถ้าลืมรหัสผ่าน ให้ใช้ฟีเจอร์ "ลืมรหัสผ่าน?" บนหน้าเข้าสู่ระบบได้เลยครับ',
  ],
  profile: [
    'แก้ไขโปรไฟล์ได้ที่หน้าตั้งค่าบัญชี หรือไปที่ /settings ครับ',
    'ดูโปรไฟล์ของตัวเองได้ที่เมนูด้านซ้าย > โปรไฟล์ของฉัน หรือ /u/ชื่อผู้ใช้ ครับ',
    'สามารถซ่อนโปรไฟล์ได้ในตั้งค่าบัญชี ถ้าซ่อนแล้วคนอื่นจะเห็นหน้าโปรไฟล์เป็น 404 ครับ',
  ],
  twoFactor: [
    'ตั้งค่า 2FA (TOTP) ได้ที่หน้าตั้งค่าบัญชี > ความปลอดภัย ครับ',
    '2FA ใช้แอป authenticator เช่น Google Authenticator หรือ Authy สแกน QR แล้วใส่รหัส 6 หลักครับ',
    'ถ้าลืมรหัส 2FA ให้ใช้รหัสกู้คืน 10 รหัสที่ได้ตอนตั้งค่าแรกครับ',
  ],
  attachments: [
    'แนบไฟล์ได้สูงสุด 20 ไฟล์ต่อบทความ ขนาดไม่เกิน 50 MB ต่อไฟล์ครับ',
    'รองรับไฟล์หลากหลาย เช่น รูปภาพ เอกสาร วิดีโอ เสียง ซิป โค้ด และฟอนต์กว่า 60 นามสกุลครับ',
    'ไฟล์ที่อัปโหลดแล้วแต่ยังไม่ผูกกับบทความ จะถูกลบทิ้งอัตโนมัติหลัง 24 ชั่วโมงครับ',
  ],
  ageGate: [
    'เกตยืนยันอายุ (Age Gate) คือการยืนยันว่ามีอายุ 18 ปีขึ้นไปก่อนอ่านเนื้อหาครับ',
    'เลือกวัน เดือน ปีเกิดเป็น พ.ศ. แล้วระบบจะแปลงเป็น ค.ศ. ให้เองครับ',
    'ไม่ต้องกังวล ระบบไม่เก็บวันเกิดจริงไว้ เก็บแค่ผลการยืนยันและ hash ของ IP ครับ',
  ],
  seoPwa: [
    'WKSL รองรับ PWA ติดตั้งเป็นแอปบนมือถือหรือเดสก์ท็อปได้ มี service worker และ offline.html ครับ',
    'มี sitemap.xml และ robots.txt ที่สร้างจากข้อมูลจริง ช่วยเรื่อง SEO ครับ',
    'metadata ต่อหน้า เช่น title description Open Graph และ Twitter Card ถูกตั้งค่าไว้ครับ',
  ],
  default: [
    'ขออภัยครับ ฉันยังตอบคำถามนี้ไม่ได้ ลองถามเกี่ยวกับการใช้งานเว็บไซต์ดูไหมครับ',
    'ฉันยังเรียนรู้อยู่ครับ ถามเรื่อง WKSL เช่น วิธีเขียนบทความ หรือวิธีแชทได้ครับ',
    'ลองถามเรื่อง การสมัครสมาชิก การเขียนบทความ หรือการใช้แชทดูไหมครับ',
  ],
};

function pickMockReply(message: string): string {
  const m = message.toLowerCase();
  if (/สวัสดี|หวัดดี|hi|hello|ดีครับ|ดีค่ะ/.test(m)) return random(MOCK_REPLIES.greet);
  if (/เข้าสู่ระบบ|ล็อกอิน|login|สมัคร|register|ลืมรหัส|รหัสผ่าน/.test(m)) return random(MOCK_REPLIES.loginRegister);
  if (/โปรไฟล์|profile|แก้ไขข้อมูล|ตั้งค่าบัญชี|ซ่อนโปรไฟล์/.test(m)) return random(MOCK_REPLIES.profile);
  if (/2fa|สองขั้นตอน|totp|authenticator|รหัสยืนยัน|รหัสกู้คืน/.test(m)) return random(MOCK_REPLIES.twoFactor);
  if (/เขียน|บทความ|โพสต์|สร้างบทความ|แนบไฟล์|แท็ก/.test(m)) return random(MOCK_REPLIES.howToWrite);
  if (/แชท|ห้องแชท|ส่งข้อความ|real.time|เรียลไทม์/.test(m)) return random(MOCK_REPLIES.howToChat);
  if (/ไฟล์แนบ|attachment|อัปโหลด|ไฟล์|นามสกุล/.test(m)) return random(MOCK_REPLIES.attachments);
  if (/เกี่ยวกับ|วกเรา|about|WKSL คือ|WKSL 是/.test(m)) return random(MOCK_REPLIES.about);
  if (/อายุ|age gate|ยืนยันอายุ|18 ปี|พ.ศ.|ค.ศ./.test(m)) return random(MOCK_REPLIES.ageGate);
  if (/pwa|seo|sitemap|ติดตั้งแอป|ออฟไลน์|metadata/.test(m)) return random(MOCK_REPLIES.seoPwa);
  return random(MOCK_REPLIES.default);
}

function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function askAI(messages: AIMessage[], _opts?: AIOptions): Promise<string> {
  // ตัวอย่าง: ถ้าต้องการใช้ AI จริง ให้แก้ตรงนี้เป็นการเรียก API ของคุณ
  // ตัวอย่างโค้ดที่คอมเมนต์ไว้ด้านล่างสำหรับ OpenAI-compatible endpoint:
  /*
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.7,
    }),
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '';
  */

  // จำลองหน่วงเวลาเล็กน้อยให้ดูเหมือนกำลังพิมพ์
  await new Promise((r) => setTimeout(r, 800 + Math.random() * 800));

  const last = messages[messages.length - 1];
  if (!last) return 'ยังไม่มีข้อความครับ';

  return pickMockReply(last.content);
}

export function formatAITime(date: Date): string {
  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
