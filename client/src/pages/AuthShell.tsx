import { Link } from 'react-router-dom';
import { MessageSquare, Radio, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { BrandLogo, BRAND_MARK_SRC } from '../components/Logo';
import type { ReactNode } from 'react';

const FEATURES = [
  { icon: Sparkles, title: 'เขียนและจัดการบทความ', text: 'Markdown, แท็ก, หมวดหมู่ และเขียนแบบร่างได้' },
  { icon: MessageSquare, title: 'แชทแบบเรียลไทม์', text: 'ห้องส่วนตัวและสาธารณะ พร้อมสถานะกำลังพิมพ์' },
  { icon: Radio, title: 'อัปเดตทันที', text: 'การแจ้งเตือนและสถานะออนไลน์แบบ push' },
  { icon: ShieldCheck, title: 'ปลอดภัย', text: '2FA, refresh token ใน httpOnly cookie, และ audit log' },
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative grid min-h-screen overflow-hidden lg:grid-cols-2">
      {/* Slow drifting light behind both columns — the only continuous motion
          on the page, so it sets the pace without pulling focus from the form. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-orb animate-drift-a -top-32 -left-24 h-96 w-96 bg-brand-500/18" />
        <div className="auth-orb animate-drift-b top-1/3 -right-20 h-[28rem] w-[28rem] bg-accent-400/14" />
        <div className="auth-orb animate-drift-a bottom-[-10rem] left-1/4 h-[26rem] w-[26rem] bg-brand-400/10 [animation-duration:17s]" />
      </div>

      {/* Left: form */}
      <div className="relative flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="animate-rise mb-9 inline-flex items-center gap-2.5 [animation-delay:0.05s]"
          >
            <span className="animate-float-y animate-halo relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-brand-500">
              <BrandLogo src={BRAND_MARK_SRC} className="h-full w-full object-cover" />
              <span
                aria-hidden
                className="animate-sheen pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/30 blur-md"
              />
            </span>
            <span className="text-xl font-bold tracking-tight text-ink-900">WKSL</span>
          </Link>

          <h1 className="animate-rise text-2xl font-semibold tracking-[-0.02em] text-ink-900 [animation-delay:0.12s] sm:text-3xl">
            {title}
          </h1>
          <p className="animate-rise mt-2 text-sm text-ink-500 [animation-delay:0.18s]">{subtitle}</p>

          <div className="animate-rise mt-7 [animation-delay:0.26s]">{children}</div>

          {footer && (
            <p className="animate-rise mt-6 text-sm text-ink-500 [animation-delay:0.34s]">{footer}</p>
          )}
        </div>
      </div>

      {/* Right: marketing panel */}
      <div className="relative hidden overflow-hidden border-l border-ink-500/10 bg-surface-1 lg:block">
        <div className="bg-grid absolute inset-0 opacity-50" />
        <div className="animate-gradient-flow absolute inset-0 bg-[radial-gradient(70%_70%_at_80%_10%,color-mix(in_oklab,var(--color-brand-500)_16%,transparent),transparent)]" />

        <div className="relative flex h-full flex-col justify-center px-14 py-16">
          <span className="badge animate-rise w-fit border border-brand-500/30 bg-brand-500/10 font-mono text-brand-400">
            <Zap size={11} /> FULL-STACK
          </span>

          <h2 className="animate-rise mt-6 text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-ink-900 [animation-delay:0.1s]">
            พื้นที่สำหรับ
            <br />
            <span className="text-gradient">ความรู้ที่อยากแชร์</span>
          </h2>

          <p className="animate-rise mt-5 max-w-md text-[15px] leading-relaxed text-ink-500 [animation-delay:0.16s]">
            WKSL รวมทุกอย่างที่เว็บแอปสมัยใหม่ต้องมี — React + Node + Socket.IO + PostgreSQL
            พร้อมระบบสมาชิก 2FA แชทเรียลไทม์ แดชบอร์ด และแผงผู้ดูแลระบบ
          </p>

          <ul className="stagger-children mt-10 space-y-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="hover-lift flex gap-3.5 rounded-2xl border border-transparent px-3 py-3"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-brand-500/25 bg-brand-500/10 text-brand-400">
                  <f.icon size={17} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink-900">{f.title}</span>
                  <span className="block text-sm text-ink-500">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="stagger-children mt-12 grid grid-cols-4 gap-6 border-t border-ink-500/10 pt-6">
            {[
              ['React 18', 'Vite + TS'],
              ['Node 20+', 'Express 4'],
              ['Socket.IO', 'realtime'],
              ['PostgreSQL', 'Prisma ORM'],
            ].map(([a, b]) => (
              <div key={a}>
                <p className="text-sm font-semibold text-ink-900">{a}</p>
                <p className="text-xs text-ink-400">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
