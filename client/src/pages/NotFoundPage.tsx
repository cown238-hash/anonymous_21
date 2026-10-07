import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { LogoMark } from '../components/Logo';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-500 text-black">
        <LogoMark size={30} />
      </span>

      <p className="mt-9 font-mono text-7xl font-semibold tracking-tight text-ink-900">404</p>

      <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink-900">
        ไม่พบหน้าที่คุณกำลังมองหา
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
        หน้านี้อาจถูกย้าย ถูกลบ หรือ URL ไม่ถูกต้อง
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn-primary">
          <ArrowLeft size={15} /> กลับหน้าแรก
        </Link>
        <Link to="/explore" className="btn-secondary">
          <Compass size={15} /> สำรวจเนื้อหา
        </Link>
      </div>
    </div>
  );
}