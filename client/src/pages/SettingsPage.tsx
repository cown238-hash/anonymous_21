import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CloudMoon, EyeOff, Loader2, Monitor, Moon, Save, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setMotionPref, useMotionPref } from '../lib/motion-pref';
import { toast } from '../lib/toast';
import { useSeo } from '../lib/seo';
import { Alert, Avatar } from '../components/ui';
import { DangerZone, EmailVerificationBanner, SecurityPanel } from '../components/SecurityPanels';

type Theme = 'light' | 'dark' | 'system';

export function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  const motionPref = useMotionPref();

  const [form, setForm] = useState({
    displayName: '',
    bio: '',
    website: '',
    location: '',
    avatarUrl: '',
  });
  const [uploading, setUploading] = useState(false);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('nimbus.theme') as Theme) ?? 'system',
  );

  useSeo({
    title: 'ตั้งค่าบัญชี',
    description: 'จัดการโปรไฟล์ ความปลอดภัย และข้อมูลของคุณบน WKSL',
    path: '/settings',
    noIndex: true,
  });

  useEffect(() => {
    if (!user) return;
    setForm({
      displayName: user.displayName,
      bio: user.bio ?? '',
      website: user.website ?? '',
      location: user.location ?? '',
      avatarUrl: user.avatarUrl ?? '',
    });
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfile({
        displayName: form.displayName,
        bio: form.bio || null,
        website: form.website || null,
        location: form.location || null,
        avatarUrl: form.avatarUrl || null,
      }),
    onSuccess: () => {
      toast.success('บันทึกโปรไฟล์แล้ว');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const privacyMutation = useMutation({
    mutationFn: (isHidden: boolean) => updateProfile({ isHidden }),
    onSuccess: (_, isHidden) => {
      toast.success(isHidden ? 'ซ่อนโปรไฟล์แล้ว' : 'เปิดโปรไฟล์เป็นสาธารณะแล้ว');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/me/password', payload),
    onSuccess: () => {
      toast.success('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่');
      setTimeout(() => window.location.reload(), 1200);
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await api.upload<{ url: string }>('/uploads/image', fd);
      setForm((f) => ({ ...f, avatarUrl: result.url }));
      toast.success('อัปโหลดรูปโปรไฟล์แล้ว กดบันทึกเพื่อยืนยัน');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const applyTheme = (next: Theme) => {
    setTheme(next);
    localStorage.setItem('nimbus.theme', next);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = next === 'dark' || (next === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  };

  if (!user) return null;

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight">ตั้งค่าบัญชี</h1>
        <p className="mt-1 text-sm text-ink-500">
          จัดการโปรไฟล์ ความปลอดภัย และข้อมูลของคุณ
        </p>
      </header>

      <EmailVerificationBanner />

      {/* Profile */}
      <section className="card p-6">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold">
          <Camera size={16} className="text-brand-500" /> โปรไฟล์
        </h2>

        <div className="mb-6 flex flex-wrap items-center gap-5">
          <Avatar name={form.displayName || user.username} src={form.avatarUrl || null} size="xl" />
          <div className="flex flex-col gap-2">
            <label className="btn-secondary btn-sm cursor-pointer">
              {uploading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Camera size={13} />
              )}
              อัปโหลดรูป
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  e.target.value = '';
                }}
              />
            </label>
            {form.avatarUrl && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, avatarUrl: '' }))}
                className="btn-ghost btn-sm text-ink-400"
              >
                ลบรูปโปรไฟล์
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="font-semibold">{user.displayName}</p>
            <p className="text-ink-400">@{user.username}</p>
            <p className="text-xs text-ink-400">{user.email ?? `@${user.username}`}</p>
            {user.emailVerified && (
              <span className="badge mt-1 border border-brand-500/30 bg-brand-500/10 text-brand-400">
                ยืนยันอีเมลแล้ว
              </span>
            )}
            {user.role === 'ADMIN' && (
              <span className="badge mt-1 bg-brand-500/12 text-brand-400 dark:text-brand-400">
                ผู้ดูแลระบบ
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="displayName">
              ชื่อที่แสดง
            </label>
            <input id="displayName" className="input" value={form.displayName} onChange={set('displayName')} />
          </div>
          <div>
            <label className="label" htmlFor="location">
              ตำแหน่ง
            </label>
            <input
              id="location"
              className="input"
              value={form.location}
              onChange={set('location')}
              placeholder="กรุงเทพมหานคร"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="website">
              เว็บไซต์
            </label>
            <input
              id="website"
              className="input"
              value={form.website}
              onChange={set('website')}
              placeholder="https://example.com"
              inputMode="url"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="bio">
              แนะนำตัว
            </label>
            <textarea
              id="bio"
              rows={3}
              maxLength={400}
              className="input resize-y"
              value={form.bio}
              onChange={set('bio')}
              placeholder="แนะนำตัวสั้น ๆ เกี่ยวกับตัวคุณ"
            />
            <p className="mt-1 text-xs text-ink-400">{form.bio.length}/400</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="btn-primary mt-5"
        >
          {saveMutation.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          บันทึกการเปลี่ยนแปลง
        </button>
      </section>

      {/* Privacy */}
      <section className="card p-6">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <EyeOff size={16} className="text-brand-500" /> ความเป็นส่วนตัว
        </h2>
        <p className="mb-5 text-sm text-ink-500">
          ซ่อนโปรไฟล์ของคุณจากหน้ารายชื่อสมาชิก — สมาชิกอื่นจะไม่เห็นชื่อและเปิดหน้าโปรไฟล์ของคุณไม่ได้
          (บทความและความคิดเห็นที่เผยแพร่แล้วยังมองเห็นได้ตามปกติ)
        </p>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-ink-500/12 bg-surface-1 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">ซ่อนโปรไฟล์จากรายชื่อสมาชิก</p>
            <p className="mt-0.5 text-xs text-ink-400">
              {user.isHidden ? 'กำลังซ่อนอยู่ — มีเพียงคุณและผู้ดูแลที่เห็นโปรไฟล์นี้' : 'ปิดอยู่ — ทุกคนเห็นโปรไฟล์ของคุณตามปกติ'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(user.isHidden)}
            aria-label="ซ่อนโปรไฟล์จากรายชื่อสมาชิก"
            disabled={privacyMutation.isPending}
            onClick={() => privacyMutation.mutate(!user.isHidden)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              user.isHidden ? 'bg-brand-500' : 'bg-surface-3'
            }`}
          >
            <span
              className={`absolute top-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-transform ${
                user.isHidden ? 'translate-x-5' : 'translate-x-0'
              }`}
            >
              {privacyMutation.isPending ? (
                <Loader2 size={12} className="animate-spin text-ink-400" />
              ) : (
                <EyeOff size={12} className={user.isHidden ? 'text-brand-600' : 'text-ink-400'} />
              )}
            </span>
          </button>
        </div>
      </section>

      {/* Appearance */}
      <section className="card p-6">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold">
          <CloudMoon size={16} className="text-brand-500" /> รูปลักษณ์
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            { key: 'light', label: 'สว่าง', icon: Sun },
            { key: 'dark', label: 'มืด', icon: Moon },
            { key: 'system', label: 'ตามระบบ', icon: Monitor },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => applyTheme(t.key)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                theme === t.key
                  ? 'border-brand-500 bg-brand-500/10 text-brand-400 dark:text-brand-400'
                  : 'border-ink-500/15 text-ink-500 hover:bg-surface-2'
              }`}
            >
              <t.icon size={17} />
              {t.label}
            </button>
          ))}
        </div>

        <h3 className="mt-7 mb-1 text-sm font-semibold text-ink-900">เอฟเฟกต์เคลื่อนไหว</h3>
        <p className="mb-3 text-xs leading-relaxed text-ink-400">
          ถ้าเว็บดูนิ่ง ๆ ทั้งที่ควรขยับ ให้เช็คข้อนี้ก่อน — Windows ที่ปิด Animation effects
          ไว้จะสั่งให้ทุกเว็บหยุดขยับ เลือก “เปิดตลอด” เพื่อบังคับให้ขยับได้เลย
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              { key: 'auto', label: 'ตามระบบ', hint: 'ตาม OS' },
              { key: 'on', label: 'เปิดตลอด', hint: 'ขยับเสมอ' },
              { key: 'off', label: 'ปิด', hint: 'นิ่งสนิท' },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMotionPref(m.key)}
              aria-pressed={motionPref === m.key}
              className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                motionPref === m.key
                  ? 'border-brand-500 bg-brand-500/10 text-brand-400 dark:text-brand-400'
                  : 'border-ink-500/15 text-ink-500 hover:bg-surface-2'
              }`}
            >
              {m.label}
              <span className="text-xs font-normal text-ink-400">{m.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Security */}
      <SecurityPanel />

      <PasswordCard
        pending={passwordMutation.isPending}
        onSubmit={(payload) => passwordMutation.mutate(payload)}
        error={passwordMutation.isError ? (passwordMutation.error as Error).message : null}
      />

      {/* Data + deletion */}
      <DangerZone />
    </div>
  );
}

function PasswordCard({
  pending,
  onSubmit,
  error,
}: {
  pending: boolean;
  onSubmit: (payload: { currentPassword: string; newPassword: string }) => void;
  error: string | null;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <section className="card p-6">
      <h2 className="mb-5 text-base font-semibold">เปลี่ยนรหัสผ่าน</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (next !== confirm) {
            toast.error('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
            return;
          }
          onSubmit({ currentPassword: current, newPassword: next });
        }}
        className="grid max-w-md gap-4"
      >
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="currentPassword">
            รหัสผ่านปัจจุบัน
          </label>
          <input
            id="currentPassword"
            type="password"
            className="input"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="label" htmlFor="newPassword">
            รหัสผ่านใหม่
          </label>
          <input
            id="newPassword"
            type="password"
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-ink-400">อย่างน้อย 8 ตัวอักษร และต้องมีทั้งตัวอักษรกับตัวเลข</p>
        </div>
        <div>
          <label className="label" htmlFor="confirmPassword">
            ยืนยันรหัสผ่านใหม่
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" disabled={pending} className="btn-primary justify-self-start">
          {pending && <Loader2 size={15} className="animate-spin" />}
          เปลี่ยนรหัสผ่าน
        </button>
        <p className="text-xs text-ink-400">
          เมื่อเปลี่ยนรหัสผ่าน ระบบจะออกจากทุกอุปกรณ์และคุณต้องเข้าสู่ระบบใหม่
        </p>
      </form>
    </section>
  );
}