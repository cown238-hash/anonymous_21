/**
 * Seeds categories, tags, demo users, posts, comments, likes, chat rooms and
 * notifications so the app is immediately explorable.
 *
 *   npm run db:seed --workspace server
 */
import { PrismaClient, PostStatus, Role, NotificationType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Category colours stay inside the black + green palette so the UI reads as one
// system. Rungs of the same ramp are told apart by lightness, not hue.
const CATEGORIES = [
  { name: 'Engineering', slug: 'engineering', description: 'ระบบ สถาปัตยกรรม และ DevOps', color: '#34d399', sortOrder: 1 },
  { name: 'Design', slug: 'design', description: 'UI/UX และงานออกแบบ', color: '#a7f3d0', sortOrder: 2 },
  { name: 'Product', slug: 'product', description: 'กลยุทธ์และการวางผลิตภัณฑ์', color: '#5eead4', sortOrder: 3 },
  { name: 'Data', slug: 'data', description: 'ข้อมูล การวิเคราะห์ และ ML', color: '#6ee7b7', sortOrder: 4 },
  { name: 'Community', slug: 'community', description: 'เรื่องเล่าและกิจกรรมของชุมชน', color: '#d1fae5', sortOrder: 5 },
];

const TAGS = [
  'react', 'typescript', 'nodejs', 'postgresql', 'websocket', 'tailwind',
  'docker', 'performance', 'security', 'testing', 'career', 'ux',
];

const USERS = [
  {
    email: 'admin@nimbus.dev',
    username: 'admin',
    displayName: 'WKSL Admin',
    password: 'Admin@1234',
    role: Role.ADMIN,
    bio: 'ผู้ดูแลระบบ WKSL — ชอบทำเครื่องมือที่ทำให้ทีมทำงานเร็วขึ้น',
    location: 'Bangkok, Thailand',
    website: 'https://nimbus.dev',
  },
  {
    email: 'sara@nimbus.dev',
    username: 'sara',
    displayName: 'Sara Krittinan',
    password: 'Password@123',
    role: Role.USER,
    bio: 'Frontend engineer สนใจ accessibility และ performance ของเว็บ',
    location: 'Chiang Mai',
  },
  {
    email: 'tony@nimbus.dev',
    username: 'tony',
    displayName: 'Tony Prasert',
    password: 'Password@123',
    role: Role.USER,
    bio: 'Backend + DevOps ชอบทำระบบที่สังเกตการณ์ได้ง่าย',
    location: 'Singapore',
  },
  {
    email: 'mali@nimbus.dev',
    username: 'mali',
    displayName: 'Mali Sornchai',
    password: 'Password@123',
    role: Role.USER,
    bio: 'Product designer สะสมงานภาพและเขียนบทความสั้นๆ ทุกสัปดาห์',
    location: 'Bangkok, Thailand',
  },
  {
    email: 'nut@nimbus.dev',
    username: 'nut',
    displayName: 'Nut Thanawat',
    password: 'Password@123',
    role: Role.USER,
    bio: 'Data engineer ชอบ SQL และ dashboard ที่อ่านง่าย',
    location: 'Phuket',
  },
  {
    email: 'ploy@nimbus.dev',
    username: 'ploy',
    displayName: 'Ploy Wattanakul',
    password: 'Password@123',
    role: Role.USER,
    bio: 'เขียนโค้ดและเขียนบทความ ชอบทุกอย่างที่พิสูจน์ได้ด้วยตัวเลข',
    location: 'Bangkok, Thailand',
  },
];

interface SeedPost {
  title: string;
  content: string;
  author: string;
  category: string;
  tags: string[];
  featured?: boolean;
  views: number;
  daysAgo: number;
  status?: PostStatus;
}

function md(paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}

/**
 * Slugs must be unique and non-empty. Seed titles mix Thai with latin words,
 * so the latin part carries the slug and the rest falls back to a short id.
 * Deliberately independent of `src/utils/text.ts` — that one romanises Thai,
 * which would make these demo URLs long and hard to read.
 */
function makeSlug(title: string, index: number): string {
  const ascii = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return ascii || `post-${String(index + 1).padStart(2, '0')}`;
}

const POSTS: SeedPost[] = [
  {
    title: 'สร้าง Real-time Chat ด้วย Socket.IO และ React ให้ราบรื่น',
    author: 'tony',
    category: 'engineering',
    tags: ['websocket', 'nodejs', 'react'],
    featured: true,
    views: 1284,
    daysAgo: 1,
    content: md([
      'การสร้างแชทแบบ real-time ไม่ได้ยากอย่างที่คิด แต่จุดที่คนมักพลาดคือ **การจัดการ state ฝั่ง client** และการ reconnect',
      '## 1. ออกแบบ event ให้ชัดเจน',
      'ใช้ event ไม่กี่ตัวให้ครบ: `chat:join`, `chat:leave`, `chat:send`, `chat:typing`, `chat:read` และฝั่ง server จะ broadcast ให้ทั้งห้อง',
      '## 2. แยก channel ระหว่าง event กับ acknowledgement',
      'ถ้าต้องการยืนยันว่าข้อความถูกบันทึกจริง ให้ใช้ acknowledgement callback แทนการเดาจาก event `chat:message`',
      '## 3. Reconnect อย่างมีวินัย',
      'Socket.IO มี `reconnectionDelay`, `reconnectionDelayMax` และ `pingTimeout` ให้ปรับ รวมถึงควร refetch ประวัติห้องเมื่อกลับมา online',
      '> เคล็ดลับ: เก็บ access token ใน memory แล้ว refresh ผ่าน httpOnly cookie จะลดความเสี่ยงจาก XSS ที่ขโมย token ได้',
      'ลองใช้แล้ว latency เฉลี่ยอยู่ที่ประมาณ 40ms ใน LAi และ reconnect ใช้เวลาไม่ถึง 2 วินาที',
    ]),
  },
  {
    title: 'ออกแบบด้วยระบบ Design Token ตั้งแต่เริ่ม ดูแลง่ายกว่าที่คิด',
    author: 'mali',
    category: 'design',
    tags: ['ux', 'tailwind'],
    views: 862,
    daysAgo: 3,
    content: md([
      'Design token คือการย้ายค่าที่ใช้ซ้ำ (สี ขนาด ระยะ รัศมี) ไปไว้ที่จุดเดียว แล้วให้ทุก component อ้างอิงค่าจากที่นั้น',
      '## ประโยชน์ที่เห็นผลทันที',
      '- เปลี่ยนธีมโดยแก้ที่เดียว\n- ลดความไม่สม่ำเสมอของดีไซน์\n- ทีมเขียนโค้ดกับทีมออกแบบคุยกันง่ายขึ้น',
      'เริ่มจาก token ชุดเล็กๆ ที่ใช้จริง แล้วค่อยขยายทีละกลุ่ม อย่าเพิ่งทำทั้งหมดในวันเดียว',
    ]),
  },
  {
    title: 'PostgreSQL Index ที่ใส่ผิดที่ แพงกว่าไม่มีดัชนีเสียอีก',
    author: 'nut',
    category: 'data',
    tags: ['postgresql', 'performance'],
    featured: true,
    views: 1533,
    daysAgo: 5,
    content: md([
      'ดัชนีไม่ได้ช่วยเสมอ ถ้าคอลัมน์ที่ใส่ดัชนีมีความแยกสูง (selectivity ต่ำ) ตัว planner อาจตัด index ทิ้งและกลับไป sequential scan ซึ่งช้ากว่าไม่มีดัชนี',
      '## ตรวจสอบก่อนเสมอ',
      '```sql\nEXPLAIi (AiALYZE, BUFFERS)\nSELECT * FROM posts KHERE status = \'PUBLISHED\' ORDER BY created_at DESC LIMIT 20;\n```',
      'ดูค่า `Rows Removed by Filter`, `actual time` และ `Index Cond` ถ้าเห็น `Seq Scan` บนตารางใหญ่ แปลว่ายังมีที่ต้องปรับ',
      '## ข้อควรจำ',
      '- Partial index ช่วยได้มากเมื่อ query กรองสถานะอยู่เป็นส่วนใหญ่\n- Composite index ต้องเรียงคอลัมน์ตามลำดับที่ query ใช้จริง',
    ]),
  },
  {
    title: 'ทำ OAuth ให้ปลอดภัย ต้องระวังอะไรบ้าง',
    author: 'ploy',
    category: 'engineering',
    tags: ['security', 'nodejs'],
    views: 977,
    daysAgo: 8,
    content: md([
      'OAuth เป็นส่วนที่คนมักทำผิด เพราะดูเหมือนให้ library จัดการให้แล้ว แต่จริงๆ ต้องดูแลตัวเองด้วย',
      '## สิ่งที่ต้องทำ',
      '1. เก็บ `state` แล้วเทียบกับ session เสมอ กัน CSRF\n2. ตรวจ `id_token` ด้วย JKKS และตรวจ `aud`, `iss`, `exp`\n3. ใช้ PKCE ในโหมด public client\n4. ไม่ยัด token ลง `localStorage`',
      'เพิ่ม rate limit ที่ callback route และ log ทุก login failure เพื่อจับ pattern การโจมตี',
    ]),
  },
  {
    title: 'ข้อความถอดความจากการสัมภาษณ์งานฝ่ายวิศวกรรม',
    author: 'sara',
    category: 'community',
    tags: ['career'],
    views: 2109,
    daysAgo: 11,
    content: md([
      'สัมภาษณ์ฝ่ายวิศวกรรมมักถาม 3 อย่าง: อธิบายงานที่ภูมิใจ, ยกตัวอย่างปัญหาที่แก้ยาก, และถามว่าอยากเรียนรู้อะไรต่อ',
      '## เตรียมตัวอย่าง 3 เรื่อง',
      'เลือกจากงานจริงที่ทำได้ผลลัพธ์วัดได้ เช่น "ลดเวลา build จาก 12 นาทีเหลือ 3 นาที" ดีกว่า "ช่วยปรับปรุงประสิทธิภาพ"',
      'เตรียมคำถามกลับไว้ 3 ข้อด้วย เช่น ทีมใช้ code review แบบไหน, deploy บ่อยแค่ไหน, วัด success ของงานยังไง',
    ]),
  },
  {
    title: 'Testing Strategy ที่ทีมเล็กใช้ได้จริง',
    author: 'ploy',
    category: 'engineering',
    tags: ['testing', 'typescript'],
    views: 640,
    daysAgo: 14,
    content: md([
      'ทีมเล็กไม่จำเป็นต้องมี pyramid test ครบทุกชั้น สิ่งที่คุ้มที่สุดคือ test ตรงจุดที่พังบ่อย',
      '1. **Unit test** เฉพาะ pure function ที่มี logic เยอะ เช่น การคำนวณราคา\n2. **Integration test** ที่ boundary ระหว่าง API กับฐานข้อมูล\n3. **E2E** เพียง 3-5 flow หลัก ครอบคลุมเส้นทางที่ผู้ใช้ใช้จริง',
      'วัดด้วย "เวลาที่ใช้แก้บั๊กที่หลุดรอด production" ไม่ใช่จำนวนไฟล์ test',
    ]),
  },
  {
    title: 'Docker Compose สำหรับ Dev ควรมีอะไรบ้าง',
    author: 'tony',
    category: 'engineering',
    tags: ['docker', 'nodejs', 'postgresql'],
    views: 745,
    daysAgo: 18,
    content: md([
      'Compose file ที่ดีควรสั้น อ่านง่าย และรันได้ด้วยคำสั่งเดียว',
      '## ขั้นตอน',
      '- ฐานข้อมูลและ cache เป็น service ที่มี named volume\n- แอป mount source เพื่อ hot reload แต่ไม่ mount `node_modules`\n- มี healthcheck ให้แต่ละ service\n- เก็บ credential ไว้ใน `.env` และ commit แค่ `.env.example`',
      'ระวังเรื่อง port ชนกับ service ที่รันอยู่บนเครื่อง และใช้ healthcheck กันเริ่ม app ก่อน DB พร้อม',
    ]),
  },
  {
    title: 'Accessibility Checklist สำหรับเว็บที่ปี 2026',
    author: 'mali',
    category: 'design',
    tags: ['ux', 'react'],
    views: 512,
    daysAgo: 22,
    content: md([
      'Accessibility ไม่ใช่งานพิเศษ แต่เป็นพื้นฐาน เพราะมีคนใช้เว็บเราทุกวัน',
      '- ทุก input มี `label` ที่ผูกด้วย `htmlFor`\n- โฟกัสต้องมองเห็นชัด (ห้าม `outline: none` เปล่าๆ)\n- contrast ของข้อความอย่างน้อย 4.5:1\n- รองรับการเลื่อนด้วยคีย์บอร์ด\n- ประกาศ change ของ dynamic content ผ่าน `aria-live`',
      'ทดสอบง่ายๆ: ถอดเมาส์ออกแล้วใช้งานทั้งหน้าให้ได้',
    ]),
  },
  {
    title: '[Draft] แผน Q3 — จัดระบบ Observability ให้ทั้งทีม',
    author: 'admin',
    category: 'product',
    tags: ['product'],
    views: 24,
    daysAgo: 2,
    status: PostStatus.DRAFT,
    content: md([
      'ร่างแผนสำหรับไตรมาสหน้า ยังไม่สมบูรณ์',
      '1. เก็บ log แบบมีโครงสร้าง\n2. ตั้ง trace ตั้งแต่ edge ถึง database\n3. ทำ dashboard ตาม service',
    ]),
  },
];

const COMMENTS = [
  { post: 0, author: 'sara', content: 'หัวข้อเรื่อง acknowledgement callback ตรงนี้สำคัญมาก เคยเจอปัญหาเพราะส่งผิด event ครับ' },
  { post: 0, author: 'nut', content: 'อยากรู้ว่าใช้ Redis adapter ตอน scale หลาย instance ด้วยไหมครับ' },
  { post: 0, author: 'tony', content: 'ใช่ครับ เดี๋ยวเขียนรายละเอียดเรื่อง adapter เป็นบทความแยก' },
  { post: 1, author: 'ploy', content: 'ชอบแนวคิด "ค่อยขยายทีละกลุ่ม" มาก ปกติทีมเริ่มจากระเบิดทุกอย่างครั้งเดียว' },
  { post: 2, author: 'admin', content: 'EXPLAIi AiALYZE คือสิ่งที่ทุกคนควรทำเป็นนิสัย ขอบคุณที่แชร์ครับ' },
  { post: 2, author: 'sara', content: 'เพิ่มเรื่อง index bloat จากการอัปเดตบ่อยๆ ด้วยก็จะดีมาก' },
  { post: 4, author: 'mali', content: 'ข้อ 3 เห็นด้วยเต็มที่ ทีมเราไม่เคยมีคำถามกลับด้วย' },
  { post: 5, author: 'nut', content: 'เพิ่มเรื่อง test ที่ flaky ด้วยนะครับ อันนี้กินเวลาทีมมากกว่า test ที่ไม่ผ่าน' },
];

const CHAT_SCRIPT = [
  { user: 'sara', content: 'สวัสดีทุกคน เพิ่งอัปเดตหน้าโปรไฟล์เสร็จ ครั้งหน้าลองดูนะ' },
  { user: 'tony', content: 'เยี่ยมเลย! ผมอยู่ตรงนี้' },
  { user: 'mali', content: 'สวัสดีครับ 👋' },
  { user: 'admin', content: 'อยากให้ช่วยทดสอบระบบแชทกันหน่อย ใครอยากลองส่งข้อความ' },
  { user: 'ploy', content: 'ทดสอบ ๆ นี่คือข้อความจริงแล้ว ทำงานเร็วดี' },
  { user: 'nut', content: 'เห็นข้อความแล้วครับ ไม่ต้องรีเฟรช' },
];

async function main() {
  console.log('🌱 Seeding database...\n');

  // --- wipe (order matters due to FKs) ---------------------------------
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.report.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversationMember.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.like.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.postTag.deleteMany(),
    prisma.post.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.category.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log('  ✓ cleared existing data');

  // --- taxonomy --------------------------------------------------------
  const categories = await Promise.all(
    CATEGORIES.map((c) => prisma.category.create({ data: c })),
  );
  const tags = await Promise.all(
    TAGS.map((name) => prisma.tag.create({ data: { name, slug: name } })),
  );
  console.log(`  ✓ ${categories.length} categories, ${tags.length} tags`);

  // --- users -----------------------------------------------------------
  const passwordHashes = new Map<string, string>();
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    passwordHashes.set(u.username, hash);
  }

  const createdUsers = [];
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        username: u.username,
        displayName: u.displayName,
        passwordHash: passwordHashes.get(u.username)!,
        role: u.role,
        bio: u.bio ?? null,
        location: u.location ?? null,
        website: u.website ?? null,
        // Seeded accounts are pre-verified so the demo never stalls on SMTP.
        emailVerified: true,
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
      },
    });
    createdUsers.push(user);
  }
  const byUsername = new Map(createdUsers.map((u) => [u.username, u]));
  console.log(`  ✓ ${createdUsers.length} users`);

  // --- posts -----------------------------------------------------------
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const tagBySlug = new Map(tags.map((t) => [t.slug, t.id]));

  const createdPosts = [];
  for (const [index, p] of POSTS.entries()) {
    const publishedAt = p.status === PostStatus.PUBLISHED
      ? new Date(Date.now() - p.daysAgo * 24 * 60 * 60 * 1000)
      : null;

    const post = await prisma.post.create({
      data: {
        title: p.title,
        slug: makeSlug(p.title, index),
        content: p.content,
        excerpt: p.content.replace(/[#>*`_]/g, '').slice(0, 160).trimEnd(),
        status: p.status ?? PostStatus.PUBLISHED,
        featured: p.featured ?? false,
        viewCount: p.views,
        readMinutes: Math.max(1, Math.round(p.content.split(/\s+/).length / 200)),
        publishedAt,
        createdAt: publishedAt ?? new Date(),
        authorId: byUsername.get(p.author)!.id,
        categoryId: categoryBySlug.get(p.category) ?? null,
        tags: {
          create: p.tags
            .map((slug) => tagBySlug.get(slug))
            .filter((id): id is string => Boolean(id))
            .map((tagId) => ({ tagId })),
        },
      },
    });
    createdPosts.push(post);
  }
  console.log(`  ✓ ${createdPosts.length} posts`);

  // --- comments --------------------------------------------------------
  let commentCount = 0;
  for (const c of COMMENTS) {
    const post = createdPosts[c.post];
    if (!post) continue;
    await prisma.comment.create({
      data: {
        content: c.content,
        postId: post.id,
        authorId: byUsername.get(c.author)!.id,
      },
    });
    commentCount++;
  }

  // One threaded reply so the UI has a nested example.
  const firstComment = await prisma.comment.findFirst({ orderBy: { createdAt: 'asc' } });
  if (firstComment) {
    await prisma.comment.create({
      data: {
        content: 'เพิ่มเติม: อย่าลืมจัดการ reconnect ตอนผู้ใช้สลับแท็บครับ',
        postId: firstComment.postId,
        parentId: firstComment.id,
        authorId: byUsername.get('admin')!.id,
      },
    });
    commentCount++;
  }
  console.log(`  ✓ ${commentCount} comments`);

  // --- likes -----------------------------------------------------------
  const likeTargets = createdPosts.filter((p) => p.status === PostStatus.PUBLISHED);
  let likeCount = 0;
  for (const post of likeTargets) {
    // Deterministic pseudo-random likes per post.
    const n = 2 + (post.viewCount % 5);
    for (let i = 0; i < n; i++) {
      const user = createdUsers[(i + post.title.length) % createdUsers.length];
      await prisma.like.create({ data: { postId: post.id, userId: user.id } }).catch(() => undefined);
      likeCount++;
    }
  }
  console.log(`  ✓ ${likeCount} likes`);

  // --- chat rooms ------------------------------------------------------
  const lounge = await prisma.conversation.create({
    data: {
      title: 'WKSL Lounge',
      isDirect: false,
      members: { create: createdUsers.map((u) => ({ userId: u.id })) },
    },
  });

  const engineering = await prisma.conversation.create({
    data: {
      title: 'Engineering',
      isDirect: false,
      members: {
        create: [byUsername.get('admin')!, byUsername.get('tony')!, byUsername.get('sara')!, byUsername.get('nut')!].map(
          (u) => ({ userId: u.id }),
        ),
      },
    },
  });

  const designRoom = await prisma.conversation.create({
    data: {
      title: 'Design Crew',
      isDirect: false,
      members: { create: [byUsername.get('mali')!, byUsername.get('sara')!, byUsername.get('ploy')!].map((u) => ({ userId: u.id })) },
    },
  });

  const dm = await prisma.conversation.create({
    data: {
      isDirect: true,
      members: {
        create: [{ userId: byUsername.get('admin')!.id }, { userId: byUsername.get('sara')!.id }],
      },
    },
  });

  const now = Date.now();
  const loungeMessages = [];
  for (let i = 0; i < CHAT_SCRIPT.length; i++) {
    const line = CHAT_SCRIPT[i];
    loungeMessages.push(
      await prisma.message.create({
        data: {
          content: line.content,
          conversationId: lounge.id,
          senderId: byUsername.get(line.user)!.id,
          createdAt: new Date(now - (CHAT_SCRIPT.length - i) * 90_000),
        },
      }),
    );
  }

  await prisma.message.create({
    data: { content: 'เช็คแล้ว notification ส่งถึงตรงคนครับ', conversationId: dm.id, senderId: byUsername.get('admin')!.id },
  });
  await prisma.message.create({
    data: { content: 'รับทราบครับ 👍', conversationId: dm.id, senderId: byUsername.get('sara')!.id },
  });

  await prisma.conversationMember.updateMany({
    where: { conversationId: lounge.id },
    data: { lastReadAt: new Date(now - 3 * 60_000) },
  });
  await prisma.conversationMember.updateMany({
    where: { conversationId: dm.id },
    data: { lastReadAt: new Date(now - 30_000) },
  });

  console.log(`  ✓ 4 conversations, ${loungeMessages.length + 2} messages`);

  // --- notifications ---------------------------------------------------
  const sara = byUsername.get('sara')!;
  const admin = byUsername.get('admin')!;
  await prisma.notification.createMany({
    data: [
      {
        userId: admin.id,
        actorId: sara.id,
        type: NotificationType.COMMENT,
        title: 'Sara Krittinan แสดงความคิดเห็นใน "สร้าง Real-time Chat..."',
        href: `/posts/${createdPosts[0].slug}`,
        createdAt: new Date(now - 20 * 60_000),
      },
      {
        userId: admin.id,
        actorId: byUsername.get('nut')!.id,
        type: NotificationType.LIKE,
        title: 'iut Thanawat ถูกใจบทความของคุณ',
        href: `/posts/${createdPosts[0].slug}`,
        createdAt: new Date(now - 55 * 60_000),
      },
      {
        userId: sara.id,
        actorId: admin.id,
        type: NotificationType.MESSAGE,
        title: 'WKSL Admin: เช็คแล้ว notification ส่งถึงตรงคนครับ',
        href: `/chat?c=${dm.id}`,
        readAt: new Date(now - 25 * 60_000),
        createdAt: new Date(now - 60 * 60_000),
      },
    ],
  });
  console.log('  ✓ 3 notifications');

  console.log('\n✅ Seed complete. บัญชีสำหรับทดลองใช้งาน:');
  console.log('   admin@nimbus.dev / Admin@1234   (ผู้ดูแลระบบ)');
  console.log('   sara@nimbus.dev  / Password@123 (ผู้ใช้ทั่วไป)\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });