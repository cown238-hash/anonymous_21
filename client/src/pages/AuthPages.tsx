import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { analytics } from '../lib/telemetry';
import { useSeo } from '../lib/seo';
import { Alert } from '../components/ui';
import { AuthShell } from './AuthShell';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  // Two-factor challenge, shown once the password has been accepted.
  const [challenge, setChallenge] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  useSeo({
    title: 'เข้าสู่ระบบ',
    description: 'เข้าสู่ระบบ WKSL เพื่อเขียนบทความและพูดคุยกับชุมชน',
    path: '/login',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(identifier.trim(), password, challenge ? totpCode : undefined);
      analytics.signIn();
      navigate('/', { replace: true });
    } catch (err) {
      const apiErr = err as ApiError & { twoFactorRequired?: boolean };
      if (apiErr.twoFactorRequired) {
        // Password was correct; ask for the second factor instead.
        setChallenge(true);
        setTotpCode('');
      } else {
        setError(apiErr);
      }
    } finally {
      setPending(false);
    }
  };

  const fillDemo = (id: string, pw: string) => {
    setIdentifier(id);
    setPassword(pw);
    setError(null);
    setChallenge(false);
  };

  return (
    <AuthShell
      title={challenge ? 'ยืนยันตัวตน' : 'ยินดีต้อนรับกลับ'}
      subtitle={
        challenge
          ? 'กรอกรหัส 6 หลักจากแอปพยานัน (หรือใช้รหัสกู้คืนครั้งเดียว)'
          : 'เข้าสู่ระบบเพื่อเขียนบทความ พูดคุย และติดตามกิจกรรม'
      }
      footer={
        <>
          ยังไม่มีบัญชี?{' '}
          <Link to="/register" className="link font-medium">
            สมัครสมาชิก
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error.message}</Alert>}

        {!challenge ? (
          <>
            <div>
              <label className="label" htmlFor="identifier">
                อีเมล หรือ ชื่อผู้ใช้
              </label>
              <input
                id="identifier"
                className="input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label className="label mb-0" htmlFor="password">
                  รหัสผ่าน
                </label>
                <Link to="/forgot-password" className="text-xs text-ink-400 hover:text-brand-400">
                  ลืมรหัสผ่าน?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-ink-500">
              <ShieldCheck size={15} className="text-brand-400" />
              บัญชี <strong className="font-medium">{identifier}</strong> เปิด 2FA ไว้
            </div>
            <label className="label" htmlFor="totp">
              รหัสยืนยัน 6 หลัก
            </label>
            <input
              id="totp"
              className="input text-center font-mono text-lg tracking-[0.4em]"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                setChallenge(false);
                setTotpCode('');
              }}
              className="mt-3 text-xs text-ink-400 hover:text-ink-700"
            >
              กลับไปกรอกรหัสผ่าน
            </button>
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          {challenge ? 'ยืนยันและเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      {!challenge && (
        <div className="mt-6 rounded-xl border border-ink-500/12 bg-surface-2/60 p-3.5">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            บัญชีทดลองใช้งาน
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => fillDemo('admin@nimbus.dev', 'Admin@1234')}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-surface-1"
            >
              <span className="font-medium">admin@nimbus.dev</span>
              <span className="font-mono text-ink-400">Admin@1234</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemo('sara@nimbus.dev', 'Password@123')}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-surface-1"
            >
              <span className="font-medium">sara@nimbus.dev</span>
              <span className="font-mono text-ink-400">Password@123</span>
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    displayName: '',
    username: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  useSeo({
    title: 'สมัครสมาชิก',
    description: 'สร้างบัญชี WKSL ฟรี เข้าร่วมชุมชนและแชร์ความรู้ของคุณ',
    path: '/register',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const requirements = [
    { label: 'อย่างน้อย 8 ตัวอักษร', ok: form.password.length >= 8 },
    { label: 'มีตัวอักษรอย่างน้อย 1 ตัว', ok: /[a-zA-Z]/.test(form.password) },
    { label: 'มีตัวเลขอย่างน้อย 1 ตัว', ok: /[0-9]/.test(form.password) },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError(new ApiError(400, 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'));
      return;
    }
    setPending(true);
    try {
      const res = await register({
        email: form.email.trim(),
        username: form.username.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        password: form.password,
      });
      analytics.signUp();
      // Without SMTP the API returns the verification link for local testing.
      if (res.emailVerification && 'previewUrl' in res.emailVerification) {
        const url = (res.emailVerification as { previewUrl?: string }).previewUrl;
        if (url) toastInfo('ยังไม่ได้ตั้งค่า SMTP — เปิดลิงก์ยืนยันอีเมลได้ที่ ' + url);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="สร้างบัญชีใหม่"
      subtitle="เข้าร่วมชุมชน WKSL ได้ฟรี ใช้เวลาไม่ถึงนาที"
      footer={
        <>
          มีบัญชีอยู่แล้ว?{' '}
          <Link to="/login" className="link font-medium">
            เข้าสู่ระบบ
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error.message}</Alert>}

        <div>
          <label className="label" htmlFor="displayName">
            ชื่อที่แสดง
          </label>
          <input
            id="displayName"
            className="input"
            value={form.displayName}
            onChange={set('displayName')}
            placeholder="สมชาย ใจดี"
            required
            minLength={2}
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="username">
              ชื่อผู้ใช้
            </label>
            <input
              id="username"
              className="input"
              value={form.username}
              onChange={set('username')}
              placeholder="somchai"
              required
              minLength={3}
              pattern="[a-zA-Z0-9_]+"
              autoComplete="username"
            />
            <p className="mt-1 text-xs text-ink-400">a-z, 0-9 และ _ เท่านั้น</p>
          </div>

          <div>
            <label className="label" htmlFor="email">
              อีเมล
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={form.email}
              onChange={set('email')}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="new-password">
            รหัสผ่าน
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              className="input pr-11"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {form.password && (
            <ul className="mt-2 space-y-0.5">
              {requirements.map((r) => (
                <li
                  key={r.label}
                  className={`flex items-center gap-1.5 text-xs ${r.ok ? 'text-brand-400' : 'text-ink-400'}`}
                >
                  <span
                    className={`grid h-3.5 w-3.5 place-items-center rounded-full text-[9px] ${
                      r.ok ? 'bg-brand-500/20' : 'bg-surface-2'
                    }`}
                  >
                    {r.ok ? '✓' : ''}
                  </span>
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="label" htmlFor="confirm">
            ยืนยันรหัสผ่าน
          </label>
          <input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            className="input"
            value={form.confirm}
            onChange={set('confirm')}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={pending || !requirements.every((r) => r.ok)}
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          สมัครสมาชิก
        </button>

        <p className="text-center text-xs leading-relaxed text-ink-400">
          การสมัครสมาชิกถือว่าคุณยอมรับการใช้งานและนโยบายความเป็นส่วนตัวของ WKSL
        </p>
      </form>
    </AuthShell>
  );
}

function toastInfo(message: string) {
  // Imported lazily to keep the auth screens free of a toast import cycle.
  void import('../lib/toast').then(({ toast }) => toast.info(message));
}