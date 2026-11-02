import { PrismaClient, PostStatus } from '@prisma/client';

const prisma = new PrismaClient();

const ARTICLES = [
  {
    title: 'เคล็ดลับเขียน TypeScript ให้ปลอดภัยและอ่านง่าย',
    category: 'engineering',
    tags: ['typescript', 'code'],
    content: [
      'TypeScript ช่วยจับข้อผิดพลาดได้ตั้งแต่ขั้นเขียนโค้ด แต่ถ้าใช้ไม่ถูกวิธีก็อาจกลายเป็นภาระแทนที่จะช่วย',
      '## สิ่งที่ควรทำ',
      '- เปิด `strict: true` ใน `tsconfig.json` ตั้งแต่วันแรก ไม่ควรปิดทีหลัง',
      '- หลีกเลี่ยง `any` ให้มากที่สุด ถ้าไม่แน่ใจชนิดข้อมูล ให้ใช้ `unknown` แล้วค่อย type guard',
      '- แยก interface ออกจาก type สำหรับวัตถุที่จะใช้ซ้ำ',
      '- ใช้ `readonly` กับออบเจ็กต์ที่ไม่ควรถูกเปลี่ยนค่า',
      '## สิ่งที่ไม่ควรทำ',
      '- ไม่ควรใช้ `as any` เพื่อข้ามการตรวจสอบชนิดข้อมูล',
      '- ไม่ควรใส่ `!` (non-null assertion) พร่ำเพรื่อ',
    ],
  },
  {
    title: 'เร่งความเร็ว PostgreSQL ด้วย Index ที่ถูกจุด',
    category: 'data',
    tags: ['postgresql', 'performance'],
    content: [
      'ดัชนี (Index) ช่วยให้ค้นหาข้อมูลเร็วขึ้น แต่ถ้าใส่ผิดที่อาจทำให้ฐานข้อมูลช้าลงแทน',
      '## ตรวจสอบก่อนเสมอ',
      'ใช้ `EXPLAIN ANALYZE` ดูแผนการสืบค้นว่าใช้ Index Scan หรือ Sequential Scan',
      '## แนวทางที่ใช้ได้ผล',
      '- สร้างดัชนีบนคอลัมน์ที่ใช้กรอง (WHERE) และเรียงลำดับ (ORDER BY) บ่อย',
      '- ใช้ partial index เมื่อกรองเฉพาะบางสถานะ เช่น `status = \'PUBLISHED\'`',
      '- หลีกเลี่ยงการสร้างดัชนีซ้อนกันมากเกินไปบนตารางที่เขียนบ่อย',
    ],
  },
  {
    title: 'เริ่มต้น Docker Compose สำหรับโปรเจกต์ขนาดกลาง',
    category: 'engineering',
    tags: ['docker', 'nodejs'],
    content: [
      'Docker Compose ช่วยให้ทีมรันฐานข้อมูลและแอปได้ด้วยคำสั่งเดียว โดยไม่ต้องติดตั้งอะไรเพิ่มบนเครื่อง',
      '## โครงสร้างที่แนะนำ',
      '- ฐานข้อมูลและ cache เป็น service แยก พร้อม named volume',
      '- แอป mount โค้ดต้นฉบับเพื่อ hot reload แต่ไม่ mount `node_modules`',
      '- เพิ่ม healthcheck ให้ทุก service เพื่อกันการเริ่มแอปก่อนฐานข้อมูลพร้อม',
      '- เก็บรหัสผ่านและคีย์ลับใน `.env` และ commit แค่ `.env.example`',
    ],
  },
  {
    title: 'ออกแบบ REST API ที่ปลอดภัยและขยายได้',
    category: 'engineering',
    tags: ['nodejs', 'security'],
    content: [
      'API ที่ดีควรออกแบบให้ปลอดภัยตั้งแต่เริ่ม ไม่ใช่แก้ทีหลังหลังเกิดปัญหา',
      '## หลักการสำคัญ',
      '- ใช้ HTTPS เสมอในสภาพแวดล้อมจริง',
      '- ตรวจสอบสิทธิ์ (authentication) และสิทธิการเข้าถึง (authorization) ทุก endpoint',
      '- ใช้ rate limit กันการโจมตีแบบ brute force',
      '- ตรวจสอบข้อมูลนำเข้าด้วย Zod หรือไลบรารีคล้ายกันก่อนบันทึกฐานข้อมูล',
      '- ไม่เปิดเผยข้อมูลภายใน เช่น stack trace หรือโครงสร้างฐานข้อมูลแก่ผู้ใช้ปลายทาง',
    ],
  },
  {
    title: 'สร้างธีมสว่างและมืดด้วย Tailwind CSS แบบไม่กะพริบ',
    category: 'design',
    tags: ['tailwind', 'ux'],
    content: [
      'การสลับธีมสว่างและมืดควรทำงานได้ทันทีโดยไม่มีจังหวะที่หน้าจอสว่างผิดปกติขณะโหลด',
      '## วิธีทำที่ถูกต้อง',
      '- อ่านธีมที่ผู้ใช้เลือกจาก localStorage ก่อนที่ React จะ render หน้าแรก',
      '- ใช้ `data-theme` บนแท็ก `<html>` แล้วเขียน CSS ตามค่าที่กำหนด',
      '- จดจำตัวเลือกของผู้ใช้ไว้ใน localStorage แล้วใช้ในครั้งถัดไป',
      '- เคารพการตั้งค่าของระบบ (`prefers-color-scheme`) เมื่อผู้ใช้ยังไม่ได้เลือก',
    ],
  },
  {
    title: 'จัดการไฟล์แนบอย่างปลอดภัยในเว็บแอป',
    category: 'files',
    tags: ['security', 'files'],
    content: [
      'การอนุญาตให้ผู้ใช้อัปโหลดไฟล์มีความเสี่ยงสูง ต้องออกแบบด้วยความระมัดระวัง',
      '## ข้อควรระวัง',
      '- ไม่ควรเสิร์ฟไฟล์ผ่าน static mount โดยตรง ให้ผ่าน endpoint ที่ตรวจสอบสิทธิ์ก่อน',
      '- บังคับ `Content-Disposition: attachment` สำหรับไฟล์ที่ไม่ใช่รูปภาพ',
      '- ตั้ง `X-Content-Type-Options: nosniff` กันการแฝงสคริปต์ในไฟล์ภาพหรือ SVG',
      '- จำกัดขนาดไฟล์และจำนวนไฟล์ต่อการอัปโหลดครั้งละ',
      '- ลบไฟล์ที่อัปโหลดแล้วไม่ถูกผูกกับเนื้อหาใด ๆ อัตโนมัติหลังวันเวลาที่กำหนด',
    ],
  },
  {
    title: 'ทดสอบเว็บแอปอย่างมีประสิทธิภาพสำหรับทีมเล็ก',
    category: 'product',
    tags: ['testing', 'career'],
    content: [
      'ทีมเล็กไม่จำเป็นต้องมีแบบทดสอบครบทุกชั้น สิ่งสำคัญคือทดสอบตรงจุดที่พังบ่อยที่สุด',
      '## แนวทางที่แนะนำ',
      '- เขียน unit test เฉพาะฟังก์ชันที่มีตรรกะซับซ้อน เช่น การคำนวณราคาหรือวันที่',
      '- ใช้ integration test ที่ขอบเขตระหว่าง API กับฐานข้อมูล',
      '- เขียน e2e test เพียง 3-5 เส้นทางหลักที่ผู้ใช้ใช้จริง',
      '- วัดผลด้วยเวลาที่ใช้แก้บั๊กที่หลุดเข้าสู่ production ไม่ใช่จำนวนไฟล์ทดสอบ',
    ],
  },
];

async function main() {
  console.log('📝 สร้างบทความอัตโนมัติ...\n');

  // ดึงผู้ใช้และหมวดหมู่ที่มีอยู่แล้ว
  const users = await prisma.user.findMany();
  const categories = await prisma.category.findMany();
  const tags = await prisma.tag.findMany();

  if (users.length === 0) {
    console.error('❌ ไม่พบผู้ใช้ในฐานข้อมูล กรุณาสร้างผู้ใช้ก่อน');
    process.exit(1);
  }
  if (categories.length === 0) {
    console.error('❌ ไม่พบหมวดหมู่ในฐานข้อมูล กรุณา seeding หมวดหมู่ก่อน');
    process.exit(1);
  }

  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const tagBySlug = new Map(tags.map((t) => [t.slug, t]));

  let created = 0;
  for (const [index, a] of ARTICLES.entries()) {
    const category = categoryBySlug.get(a.category);
    if (!category) {
      console.warn(`⚠️ ข้าม "${a.title}" — ไม่พบหมวดหมู่ "${a.category}"`);
      continue;
    }

    // หมุนใช้ผู้เขียนจากผู้ใช้ที่มีอยู่
    const author = users[index % users.length];

    const slug = a.title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || `post-${String(index + 1).padStart(2, '0')}`;

    // เช็คว่ามี slug นี้อยู่แล้วหรือไม่
    const existing = await prisma.post.findUnique({ where: { slug } });
    if (existing) {
      console.warn(`⚠️ ข้าม "${a.title}" — slug "${slug}" มีอยู่แล้ว`);
      continue;
    }

    const post = await prisma.post.create({
      data: {
        title: a.title,
        slug,
        content: a.content.join('\n\n'),
        excerpt: a.content[0].replace(/[#>*`_]/g, '').slice(0, 160).trimEnd(),
        status: PostStatus.PUBLISHED,
        featured: false,
        viewCount: 0,
        readMinutes: Math.max(1, Math.round(a.content.join(' ').split(/\s+/).length / 200)),
        publishedAt: new Date(),
        createdAt: new Date(),
        authorId: author.id,
        categoryId: category.id,
        tags: {
          create: a.tags
            .map((slug) => tagBySlug.get(slug))
            .filter(Boolean)
            .map((t) => ({ tagId: t.id })),
        },
      },
    });
    created++;
    console.log(`  ✓ "${post.title}" (โดย ${author.username})`);
  }

  console.log(`\n✅ สร้างบทความสำเร็จ ${created} บทความ`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ ผิดพลาด:', err);
  process.exit(1);
});
