import { useState, useCallback } from 'react';
import { ShieldAlert, ArrowRight, LogOut } from 'lucide-react';

interface ContentWarningProps {
  children: React.ReactNode;
  onAccept?: () => void;
}

/**
 * ContentWarning — แสดงคำเตือนก่อนเข้าถึงเนื้อหาสำหรับผู้ใหญ่ (18+)
 *
 * ใช้ localStorage จดจำว่าผู้ใช้ยอมรับแล้วในเซสชันนี้
 * เมื่อกดยอมรับจะแสดง children (เนื้อหาจริง) แทน
 */
export function ContentWarning({ children, onAccept }: ContentWarningProps) {
  const [accepted, setAccepted] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wksl.content-warning-accepted') === 'true';
    }
    return false;
  });

  const handleAccept = useCallback(() => {
    setAccepted(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wksl.content-warning-accepted', 'true');
    }
    onAccept?.();
  }, [onAccept]);

  if (!accepted) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-0 px-6">
        <div className="max-w-lg w-full">
          <div className="rounded-2xl border border-brand-500/25 bg-brand-500/5 p-8 sm:p-12 text-center shadow-[0_0_60px_-20px_color-mix(in_oklab,var(--color-brand-500)_35%,transparent)]">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-brand-500/30 bg-brand-500/10 mx-auto mb-6">
              <ShieldAlert size={32} className="text-brand-400" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              เนื้อหาสำหรับผู้ใหญ่
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-500">
              บทความนี้อาจมีเนื้อหาที่ไม่เหมาะสมสำหรับผู้ที่อายุต่ำกว่า 18 ปี
              กรุณายืนยันว่าคุณมีอายุครบถ้วนก่อนเข้ารับชม
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={handleAccept}
                className="btn-primary flex-1 sm:flex-none"
              >
                ยืนยันว่ามีอายุ 18 ปีขึ้นไป <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => (window.location.href = '/')}
                className="btn-ghost flex-1 sm:flex-none"
              >
                ออกจากหน้านี้ <LogOut size={16} />
              </button>
            </div>
            <p className="mt-6 text-xs text-ink-400">
              คุณสามารถออกจากหน้านี้ได้ทุกเมื่อ หากยังไม่พร้อมรับชมเนื้อหาสำหรับผู้ใหญ่
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
