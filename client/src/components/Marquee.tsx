import { useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Marquee — ข้อความเลื่อนซ้ายไปขวาไม่หยุด (loop ตลอด)
 * ใช้สำหรับพาดหัวสำคัญ / ข่าวประชาสัมพันธ์บนหน้าแรก
 *
 * เคารพการตั้งค่าลดแอนิเมชันของระบบ (prefers-reduced-motion)
 * และจะหยุดชั่วคราวเมื่อชูเมาส์เหนือข้อความ (ถ้า pauseOnHover = true)
 */
export function Marquee({
  children,
  speed = 20, // วินาทีต่อหนึ่งรอบ (ยิ่งน้อยยิ่งเร็ว)
  className,
  pauseOnHover = true,
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
  pauseOnHover?: boolean;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);

  return (
    <div
      className={`overflow-hidden relative ${className ?? ''}`}
      style={{ willChange: 'transform' }}
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
    >
      <div
        ref={innerRef}
        className={`flex items-center whitespace-nowrap marquee-track ${(reduce || paused) ? 'animate-none' : ''}`}
        style={{ '--marquee-duration': reduce || paused ? '0s' : `${speed}s` } as React.CSSProperties}
      >
        {/* เนื้อหาซ้ำสองชุดเพื่อให้เลื่อนวนได้ต่อเนื่อง ไม่มีช่องว่าง */}
        <div className="marquee-content">
          {children}
          <span className="px-6 text-ink-500" aria-hidden>
            •
          </span>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * MarqueeGroup — แถบข้อความเลื่อนหลายบรรทัดซ้อนกัน
 */
export function MarqueeGroup({
  items,
  speed = 20,
  className,
}: {
  items: Array<{ label: string; href?: string }>;
  speed?: number;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {items.map((item) => (
        <Marquee key={item.label} speed={speed} className="block">
          {item.href ? (
            <a
              href={item.href}
              className="text-brand-400 hover:underline font-medium whitespace-nowrap"
            >
              {item.label}
            </a>
          ) : (
            <span className="whitespace-nowrap">{item.label}</span>
          )}
          <span className="px-6 text-ink-500">•</span>
        </Marquee>
      ))}
    </div>
  );
}
