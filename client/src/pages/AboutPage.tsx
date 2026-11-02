import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSeo } from '../lib/seo';
import { BrandLogo, BRAND_MARK_SRC } from '../components/Logo';
import { Badge } from '../components/ui';
import { riseChild, staggerParent } from '../components/anim';
import { ArrowRight, Github, Mail, Clock, Shield, Users, Twitter, Instagram, Youtube } from 'lucide-react';

export default function AboutPage() {
  useSeo({
    title: 'เกี่ยวกับเรา — WKSL',
    description:
      'WKSL แพลตฟอร์มชุมชนสำหรับแชร์ความรู้ เขียนบทความ แชทแบบเรียลไทม์ และสร้างสิ่งที่ดีไปด้วยกัน ด้วย React + Node + PostgreSQL',
    path: '/about',
  });

  useEffect(() => {
    document.title = 'เกี่ยวกับเรา — WKSL';
  }, []);

  return (
    <div className="space-y-12">
      {/* ---------------- Hero ---------------- */}
      <motion.div
        variants={riseChild}
        initial="hidden"
        animate="show"
        className="relative overflow-hidden rounded-3xl border border-brand-500/25 bg-surface-1 p-8 sm:p-12 lg:p-16 shadow-[0_0_80px_-20px_color-mix(in_oklab,var(--color-brand-500)_35%,transparent)]"
      >
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="relative z-10 grid items-start gap-8 sm:grid-cols-[1fr_1.4fr] sm:items-center">
          <div>
            <motion.span
              variants={riseChild}
              initial="hidden"
              animate="show"
              className="inline-flex items-center gap-2 rounded-full border border-brand-500/35 bg-brand-500/10 px-3 py-1 font-mono text-xs font-semibold text-brand-400"
            >
              <Clock size={12} /> เปิดดำเนินการตั้งแต่ 2026
            </motion.span>

            <motion.h1
              variants={riseChild}
              initial="hidden"
              animate="show"
              className="mt-4 text-3xl leading-[1.1] font-semibold tracking-tight text-ink-900 sm:text-4xl lg:text-5xl"
            >
              เกี่ยวกับเรา
              <br />
              <span className="text-gradient-flow animate-gradient-flow">WKSL Community</span>
            </motion.h1>

            <motion.p
              variants={riseChild}
              initial="hidden"
              animate="show"
              className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-500 sm:text-xl"
            >
              แพลตฟอร์มชุมชนสำหรับคนรักเทคโนโลยี เขียนบทความ แชร์ไฟล์ แชทแบบเรียลไทม์ และติดตามสิ่งที่เกิดขึ้นได้ในที่เดียว สร้างขึ้นด้วย
              <br />
              React + Vite + TypeScript บนหน้าเว็บ และ Node + Express + Socket.IO + PostgreSQL บนเซิร์ฟเวอร์
            </motion.p>

            <motion.div
              variants={riseChild}
              initial="hidden"
              animate="show"
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Badge>React 18</Badge>
              <Badge>Tailwind CSS 4</Badge>
              <Badge>PostgreSQL</Badge>
              <Badge>Socket.IO</Badge>
              <Badge>Prisma ORM</Badge>
              <Badge>framer-motion</Badge>
            </motion.div>
          </div>

          <div className="relative hidden sm:block">
            <div className="relative rounded-2xl overflow-hidden border border-ink-500/20 shadow-2xl">
              <span className="animate-float-y animate-halo relative grid h-48 w-48 place-items-center overflow-hidden rounded-lg bg-[#101820] ring-1 ring-white/10">
                <BrandLogo src={BRAND_MARK_SRC} className="h-full w-full object-cover" />
                <span
                  aria-hidden
                  className="animate-sheen pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/30 blur-md"
                />
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ---------------- Vision ---------------- */}
      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="grid gap-6 sm:grid-cols-3 items-start"
      >
        {[
          {
            icon: <Users size={24} className="text-brand-400" />,
            title: 'ชุมชนที่เปิดกว้าง',
            body: 'ทุกคนสามารถสมัครสมาชิก เขียนบทความ และแสดงความคิดเห็นได้อย่างอิสระ ภายใต้กฎกติกาของชุมชนที่เคารพซึ่งกันและกัน',
          },
          {
            icon: <Shield size={24} className="text-brand-400" />,
            title: 'ความปลอดภัยมาก่อน',
            body: 'ระบบยืนยันตัวตน 2FA, การยืนยันอีเมล, และการควบคุมสิทธิ์เข้าถึง ข้อมูลของคุณถูกเก็บรักษาอย่างปลอดภัยบน PostgreSQL',
          },
          {
            icon: <Clock size={24} className="text-brand-400" />,
            title: 'เรียลไทม์จริง',
            body: 'แชทและการแจ้งเตือนทำงานผ่าน Socket.IO แบบเรียลไทม์ ไม่ต้องรีเฟรชหน้าเว็บก็เห็นข้อความใหม่ได้ทันที',
          },
        ].map((item) => (
          <motion.div
            key={item.title}
            variants={riseChild}
            className="card p-6 hover-lift group"
          >
            <div className="mb-4 p-3 rounded-xl bg-brand-500/5 text-brand-400">{item.icon}</div>
            <h3 className="mb-2 text-lg font-semibold text-ink-900">{item.title}</h3>
            <p className="text-[14px] text-ink-500 leading-relaxed">{item.body}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* ---------------- Stack / Built with ---------------- */}
      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="card p-8 sm:p-12"
      >
        <h2 className="mb-6 text-2xl font-semibold text-ink-900">สร้างขึ้นด้วยเทคโนโลยีอะไรบ้าง</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { name: 'React 18', desc: 'อินเทอร์เฟซผู้ใช้ที่ตอบสนองเร็ว' },
            { name: 'Vite 6', desc: 'เครื่องมือ build และ dev server ที่รวดเร็ว' },
            { name: 'TypeScript', desc: 'เขียนโค้ดอย่างปลอดภัยด้วยชนิดข้อมูล' },
            { name: 'Tailwind CSS 4', desc: 'ออกแบบหน้าตาด้วย utility-first CSS' },
            { name: 'Node + Express', desc: 'เซิร์ฟเวอร์ API และเว็บไซต์' },
            { name: 'PostgreSQL + Prisma', desc: 'ฐานข้อมูลสัมพันธ์และ ORM' },
          ].map((item) => (
            <motion.div
              key={item.name}
              variants={riseChild}
              className="p-4 rounded-xl border border-ink-500/12 bg-surface-2 group-hover:border-brand-500/40 transition"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-ink-900">{item.name}</span>
                <Badge>ใช้งานจริง</Badge>
              </div>
              <p className="text-[13px] text-ink-500">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ---------------- Contact ---------------- */}
      <motion.div
        variants={riseChild}
        initial="hidden"
        animate="show"
        className="rounded-2xl border border-brand-500/25 bg-brand-500/5 p-8 sm:p-12"
      >
        <div className="grid gap-6 sm:grid-cols-2 items-center">
          <div>
            <h2 className="mb-3 text-2xl font-semibold text-ink-900">ติดต่อเรา</h2>
            <p className="mb-6 text-ink-500">
              มีข้อเสนอแนะ พบข้อบกพร่อง หรืออยากร่วมพัฒนา? ทีมงานยินดีรับฟังเสมอ
            </p>
            <div className="space-y-3">
              <a
                href="mailto:hello@wksl.site"
                className="flex items-center gap-3 text-brand-400 hover:underline hover:underline-offset-4"
              >
                <Mail size={18} /> hello@wksl.site
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-brand-400 hover:underline hover:underline-offset-4"
              >
                <Github size={18} /> โครงการบน GitHub
              </a>
            </div>
          </div>

          <div className="flex justify-end">
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-semibold text-black hover:bg-brand-400 transition"
            >
              กลับสู่หน้าแรก <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </motion.div>

      {/* ---------------- Social Media ---------------- */}
      <motion.div
        variants={riseChild}
        initial="hidden"
        animate="show"
        className="border-t border-ink-500/10 pt-8 pb-20"
      >
        <h3 className="mb-4 text-lg font-semibold text-ink-900">ติดตามเราได้ที่</h3>
        <div className="flex gap-4 justify-center">
          {[
            { label: 'Facebook', href: 'https://www.facebook.com/wongsakonez19', icon: <Users size={20} />, color: 'text-brand-400' },
            { label: 'X (Twitter)', href: 'https://x.com/wksl', icon: <Twitter size={20} />, color: 'text-brand-400' },
            { label: 'Instagram', href: 'https://instagram.com/wksl', icon: <Instagram size={20} />, color: 'text-brand-400' },
            { label: 'อีเมล', href: 'mailto:hello@wksl.site', icon: <Mail size={20} />, color: 'text-brand-400' },
            { label: 'YouTube', href: 'https://www.youtube.com/@Wongsakone', icon: <Youtube size={20} />, color: 'text-brand-400' },
            { label: 'GitHub', href: 'https://github.com/cown238-hash', icon: <Github size={20} />, color: 'text-brand-400' },
          ].map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-10 h-10 rounded-xl flex items-center justify-center border border-ink-500/15 bg-surface-1 ${social.color} hover:bg-brand-500 hover:text-black transition group`}
              aria-label={social.label}
            >
              <span className="group-hover:scale-110 transition-transform">{social.icon}</span>
            </a>
          ))}
        </div>
      </motion.div>

      {/* ---------------- Footer ---------------- */}
      <motion.div
        variants={riseChild}
        initial="hidden"
        animate="show"
        className="border-t border-ink-500/10 pt-8 pb-20 text-center text-xs text-ink-500"
      >
        <p>© {new Date().getFullYear()} WKSL Community — สร้างขึ้นเพื่อการแบ่งปันความรู้</p>
        <p className="mt-1">ไม่ใช่ผลิตภัณฑ์เชิงพาณิชย์ สร้างขึ้นจากความชอบและความตั้งใจดี</p>
      </motion.div>
    </div>
  );
}
