import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { api, setAgeGateHandler } from '../lib/api';
import { useSeo } from '../lib/seo';
import { Alert, Spinner, SpinnerPage } from './ui';
import { BRAND_MARK_SRC, BrandLogo } from './Logo';

/**
 * The age gate.
 *
 * Wraps the whole app rather than sitting on one route, so there is no URL a
 * visitor can reach without answering it. The verdict lives on the server (see
 * `server/src/services/age-gate.ts`) and this screen only relays it: clearing
 * site data does not open the door, and the content routes refuse to answer
 * until the cookie resolves to a stored confirmation.
 */

export interface AgeGateStatus {
  enabled: boolean;
  verified: boolean;
  minAge: number;
  expiresAt: string | null;
  /** Sent only by a POST — the answer was underage. */
  eligible?: boolean;
}

export const AGE_GATE_QUERY_KEY = ['age-gate'] as const;

/** 2443 BE is 1900 CE, the oldest year the API accepts. */
const MIN_BE_YEAR = 2443;

const MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const pad = (value: number) => String(value).padStart(2, '0');

function daysInMonth(ceYear: number, month: number): number {
  if (!ceYear || !month) return 31;
  return new Date(ceYear, month, 0).getDate();
}

const TRUST = [
  { icon: LockKeyhole, title: 'ยืนยันครั้งเดียว', text: 'จำผลไว้ในอุปกรณ์นี้และแถวข้อมูลฝั่งเซิร์ฟเวอร์ ไม่ต้องกรอกซ้ำ' },
  { icon: ShieldCheck, title: 'ไม่เก็บวันเกิด', text: 'ใช้คำนวณว่าเข้าเกณฑ์หรือไม่แล้วทิ้งทันที ไม่ถูกบันทึกลงฐานข้อมูล' },
  { icon: CheckCircle2, title: 'ไม่ต้องใช้เอกสาร', text: 'ตรวจจากวัน เดือน ปีเกิดที่คุณกรอกเท่านั้น ไม่มีการขอสำเนาบัตร' },
];

/** Renders `children` once the visitor has passed the gate. */
export function AgeGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: AGE_GATE_QUERY_KEY,
    queryFn: () => api.get<AgeGateStatus>('/age-gate'),
    staleTime: 5 * 60_000,
  });

  // A confirmation can lapse while the tab is open — it expires, an operator
  // clears it, the minimum age is raised. The API says so with a code, and the
  // gate comes back instead of waiting for a reload.
  useEffect(() => {
    setAgeGateHandler(() => {
      void queryClient.invalidateQueries({ queryKey: AGE_GATE_QUERY_KEY });
    });
    return () => setAgeGateHandler(() => {});
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <SpinnerPage label="กำลังตรวจสอบช่วงอายุ" />
      </div>
    );
  }

  // If the gate endpoint cannot be reached, fall through to the app instead of
  // locking everyone out of a working site. The API still enforces the gate, so
  // this shows a shell whose data calls fail closed — not an open door.
  if (isError || !data || !data.enabled || data.verified) return <>{children}</>;

  return <AgeGateScreen minAge={data.minAge} />;
}

function AgeGateScreen({ minAge }: { minAge: number }) {
  useSeo({
    title: 'ยืนยันอายุ',
    description: 'ยืนยันอายุเพื่อเข้าใช้งานพื้นที่สำหรับผู้ใหญ่',
    path: '/age-gate',
    noIndex: true,
  });

  const queryClient = useQueryClient();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [underage, setUnderage] = useState(false);
  const [pending, setPending] = useState(false);

  const maxYear = new Date().getFullYear() + 543;
  const years = useMemo(() => {
    const out: number[] = [];
    for (let year_ = maxYear; year_ >= MIN_BE_YEAR; year_ -= 1) out.push(year_);
    return out;
  }, [maxYear]);

  const ceYear = Number(year) - 543;
  const dayCount = daysInMonth(ceYear, Number(month));

  function update(patch: Partial<{ day: string; month: string; year: string }>) {
    const next = { day, month, year, ...patch };
    // Keep the day valid for the month that was just chosen (31 -> February).
    if (next.month && next.year) {
      const limit = daysInMonth(Number(next.year) - 543, Number(next.month));
      if (Number(next.day) > limit) next.day = '';
    }
    setDay(next.day);
    setMonth(next.month);
    setYear(next.year);
    setError('');
    setUnderage(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!day || !month || !year) {
      setError('กรุณากรอกวัน เดือน และปีเกิดให้ครบถ้วน');
      return;
    }

    setPending(true);
    try {
      const result = await api.post<AgeGateStatus>('/age-gate', {
        birthDate: `${ceYear}-${pad(Number(month))}-${pad(Number(day))}`,
      });
      if (result.verified) {
        // Hand the app the answer we already have instead of a second round trip.
        queryClient.setQueryData(AGE_GATE_QUERY_KEY, result);
      } else {
        setUnderage(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ยืนยันอายุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-orb animate-drift-a -top-32 -left-24 h-96 w-96 bg-brand-500/18" />
        <div className="auth-orb animate-drift-b bottom-[-9rem] -right-24 h-[26rem] w-[26rem] bg-accent-400/12" />
      </div>
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-40" />

      <section className="relative w-full max-w-xl">
        <div className="animate-rise flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-500">
            <BrandLogo src={BRAND_MARK_SRC} className="h-full w-full object-cover" />
          </span>
          <span className="text-xl font-bold tracking-tight text-ink-900">WKSL</span>
          <span className="badge ml-auto border border-brand-500/30 bg-brand-500/10 font-mono text-brand-400">
            <ShieldCheck size={11} /> AGE VERIFICATION
          </span>
        </div>

        <h1 className="animate-rise mt-7 text-3xl font-semibold tracking-[-0.03em] text-ink-900 [animation-delay:0.06s] sm:text-4xl">
          พื้นที่นี้สำหรับ
          <br />
          <span className="text-gradient">ผู้ใหญ่ {minAge}+</span>
        </h1>
        <p className="animate-rise mt-4 max-w-lg text-[15px] leading-relaxed text-ink-500 [animation-delay:0.12s]">
          ขอเช็กอายุสักนิด เพื่อให้ทุกคนใช้งานได้อย่างเหมาะสมและสบายใจ
          กรอกวันเกิดของคุณแล้วกดยืนยันได้เลย
        </p>

        <ul className="stagger-children mt-7 space-y-2.5">
          {TRUST.map((item) => (
            <li key={item.title} className="flex gap-3.5 rounded-2xl border border-transparent px-1 py-1.5">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-brand-500/25 bg-brand-500/10 text-brand-400">
                <item.icon size={17} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-900">{item.title}</span>
                <span className="block text-sm text-ink-500">{item.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="card animate-rise mt-8 p-5 sm:p-6 [animation-delay:0.2s]">
          {underage ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
                  <ShieldX size={18} />
                </span>
                <div>
                  <p className="font-semibold text-ink-900">ยังไม่เปิดให้เข้าใช้งาน</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-500">
                    พื้นที่นี้กำหนดให้ผู้มีอายุ {minAge} ปีบริบูรณ์ขึ้นไป หากกรอกวันเกิดผิด
                    สามารถแก้ไขและลองใหม่ได้
                  </p>
                </div>
              </div>
              <button type="button" className="btn btn-secondary w-full" onClick={() => setUnderage(false)}>
                กรอกวันเกิดใหม่
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <CalendarDays size={16} className="text-brand-400" />
                วันเกิดของคุณ
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="label">วัน</span>
                  <select className="input" value={day} onChange={(e) => update({ day: e.target.value })}>
                    <option value="">--</option>
                    {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="label">เดือน</span>
                  <select className="input" value={month} onChange={(e) => update({ month: e.target.value })}>
                    <option value="">--</option>
                    {MONTHS.map((name, index) => (
                      <option key={name} value={index + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="label">ปี (พ.ศ.)</span>
                  <select className="input" value={year} onChange={(e) => update({ year: e.target.value })}>
                    <option value="">--</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {error && <Alert kind="error">{error}</Alert>}

              <button type="submit" className="btn btn-primary w-full" disabled={pending}>
                {pending ? (
                  <>
                    <Spinner className="h-4 w-4" /> กำลังตรวจสอบ…
                  </>
                ) : (
                  <>
                    ยืนยันอายุและเข้าใช้งาน <ArrowRight size={16} />
                  </>
                )}
              </button>

              {Boolean(ceYear) && (
                <p className="text-xs text-ink-400">จะส่งวันที่เป็น ค.ศ. {ceYear} ให้เซิร์ฟเวอร์เป็นผู้ตัดสิน</p>
              )}
            </form>
          )}
        </div>

        <p className="animate-rise mt-5 text-xs leading-relaxed text-ink-400 [animation-delay:0.26s]">
          ระบบเก็บเฉพาะผลการยืนยันและวันหมดอายุของผลนั้น ไม่เก็บวันเกิดและไม่เก็บที่อยู่ IP
          โดยตรง — ที่อยู่จะถูกแปลงเป็นค่าย่อยที่ย้อนกลับไม่ได้เพื่อจำคุณในการเข้าครั้งถัดไป
        </p>
      </section>
    </main>
  );
}
