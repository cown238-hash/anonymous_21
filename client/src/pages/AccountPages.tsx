import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Spinner } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { ApiError, api } from '../lib/api';
import { toast } from '../lib/toast';
import { useSeo } from '../lib/seo';

/** GET /api/collect/config tells us whether a collector is even configured. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  useSeo({ title: 'ลืมรหัสผ่าน', description: 'ขอลิงก์ตั้งรหัสผ่านใหม่สำหรับบัญชี WKSL ของคุณ', noIndex: true });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await api.post<{ sent: boolean; previewUrl?: string }>(
        '/auth/password/forgot',
        { email: email.trim().toLowerCase() },
        { anonymous: true },
      );
      setSent(true);
      // Without SMTP the API hands the link back so the flow stays testable.
      setDevLink(res.previewUrl ?? null);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthCard title="ลืมรหัสผ่าน" subtitle="กรอกอีเมลของคุณ แล้วเราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้">
      {sent ? (
        <div className="space-y-5">
          <Alert kind="success">
            หากมีบัญชีนี้อยู่ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ <strong>{email}</strong> แล้ว
            ลิงก์มีอายุ 60 นาที
          </Alert>

          {devLink && (
            <Alert kind="info">
              <p className="mb-1 font-medium">โหมดพัฒนา: ยังไม่ได้ตั้งค่า SMTP</p>
              <p className="mb-2 text-xs">อีเมลจึงถูกบันทึกไว้ใน log ของเซิร์ฟเวอร์แทน ลิงก์จริงคือ</p>
              <Link to={devLink} className="link break-all text-xs">
                {devLink}
              </Link>
            </Alert>
          )}

          <Link to="/login" className="btn-secondary w-full">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <label className="label" htmlFor="email">
              อีเมล
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {pending && <Spinner className="h-4 w-4" />}
            ส่งลิงก์ตั้งรหัสผ่าน
          </button>
          <p className="text-center text-xs text-ink-400">
            จะไม่เปิดเผยว่าอีเมลนี้มีบัญชีอยู่หรือไม่ เพื่อความปลอดภัย
          </p>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useSeo({ title: 'ตั้งรหัสผ่านใหม่', noIndex: true });

  useEffect(() => {
    if (!token) setError('ไม่พบ token ในลิงก์ กรุณาขอลิงก์ใหม่');
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setPending(true);
    try {
      await api.post('/auth/password/reset', { token, password }, { anonymous: true });
      setDone(true);
      toast.success('ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบใหม่');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="ตั้งรหัสผ่านใหม่แล้ว" subtitle="ทุกเซสชันเดิมถูกยกเลิกแล้วเพื่อความปลอดภัย">
        <Link to="/login" className="btn-primary w-full">
          เข้าสู่ระบบ
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="ตั้งรหัสผ่านใหม่" subtitle="กรอกรหัสผ่านใหม่ของคุณ">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="password">
            รหัสผ่านใหม่
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-ink-400">อย่างน้อย 8 ตัวอักษร และต้องมีทั้งตัวอักษรกับตัวเลข</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            ยืนยันรหัสผ่านใหม่
          </label>
          <input
            id="confirm"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={pending || !token}>
          {pending && <Spinner className="h-4 w-4" />}
          บันทึกรหัสผ่านใหม่
        </button>
      </form>
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [state, setState] = useState<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  const [message, setMessage] = useState(
    token ? 'กำลังยืนยันอีเมลของคุณ…' : 'ไม่พบ token ในลิงก์',
  );

  useSeo({ title: 'ยืนยันอีเมล', noIndex: true });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    api
      .post('/auth/verify-email', { token }, { anonymous: true })
      .then(() => {
        if (cancelled) return;
        setState('done');
        toast.success('ยืนยันอีเมลเรียบร้อยแล้ว');
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setState('error');
        setMessage(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthCard title="ยืนยันอีเมล" subtitle="ยืนยันความเป็นเจ้าของอีเมลของคุณ">
      {state === 'working' && (
        <div className="flex flex-col items-center gap-4 py-6">
          <Spinner className="h-7 w-7 text-brand-500" />
          <p className="text-sm text-ink-500">{message}</p>
        </div>
      )}

      {state === 'done' && (
        <div className="space-y-4">
          <Alert kind="success">ยืนยันอีเมลเรียบร้อยแล้ว บัญชีของคุณพร้อมใช้งานเต็มรูปแบบ</Alert>
          <button type="button" className="btn-primary w-full" onClick={() => navigate('/')}>
            ไปที่หน้าแรก
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-4">
          <Alert>{message}</Alert>
          <Link to="/settings" className="btn-secondary w-full">
            ขอลิงก์ยืนยันใหม่
          </Link>
        </div>
      )}
    </AuthCard>
  );
}

/** Shared card shell for the standalone auth screens. */
function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 inline-flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-black">
            <LogoMark size={20} />
          </span>
          <span className="text-xl font-bold tracking-tight text-ink-900">WKSL</span>
        </Link>

        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

