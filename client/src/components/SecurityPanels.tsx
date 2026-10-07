import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Key,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { formatDateTime } from '../lib/format';
import { Alert, Modal } from '../components/ui';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
}

interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

/** Email verification banner + resend. */
export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const resend = useMutation({
    mutationFn: () =>
      api.post<{ sent: boolean; previewUrl?: string }>('/auth/verify-email/send'),
    onSuccess: (res) => {
      toast.success(res.sent ? 'ส่งลิงก์ยืนยันไหม่แล้ว' : 'อีเมลถูกบันทึกไว้ใน log (ยังไม่ได้ตั้งค่า SMTP)');
      if (res.previewUrl) window.open(res.previewUrl, '_blank', 'noopener');
    },
    onError: (err) => toast.error(err.message),
  });

  if (!user || user.emailVerified || dismissed) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-warn/8 px-4 py-3">
      <Mail size={18} className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1 text-sm text-ink-700">
        <strong className="font-semibold">ยังไม่ได้ยืนยันอีเมล</strong> — การยืนยันช่วยให้กู้คืนบัญชีได้เมื่อลืมรหัสผ่าน
      </p>
      <button
        type="button"
        onClick={() => resend.mutate()}
        disabled={resend.isPending}
        className="btn-secondary btn-sm"
      >
        {resend.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        ส่งลิงก์อีกครั้ง
      </button>
      <button type="button" onClick={() => setDismissed(true)} className="btn-ghost btn-sm">
        ภายหลัง
      </button>
    </div>
  );
}

/** Two-factor enrolment, recovery codes, and session management. */
export function SecurityPanel() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  const status = useQuery({
    queryKey: ['2fa', 'status'],
    queryFn: () => api.get<TwoFactorStatus>('/auth/2fa/status'),
  });

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionRow[]>('/auth/sessions'),
  });

  const startSetup = useMutation({
    mutationFn: () => api.post<{ secret: string; qr: string }>('/auth/2fa/setup'),
    onSuccess: (data) => setSetup(data),
    onError: (err) => toast.error(err.message),
  });

  const confirmSetup = useMutation({
    mutationFn: (c: string) => api.post<{ enabled: boolean; recoveryCodes: string[] }>('/auth/2fa/confirm', { code: c }),
    onSuccess: (res) => {
      setRecoveryCodes(res.recoveryCodes);
      setSetup(null);
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['2fa'] });
      toast.success('เปิดใช้งาน 2FA แล้ว');
    },
    onError: (err) => toast.error(err.message),
  });

  const disable2fa = useMutation({
    mutationFn: (password: string) => api.post('/auth/2fa/disable', { password }),
    onSuccess: () => {
      setDisableOpen(false);
      setDisablePassword('');
      queryClient.invalidateQueries({ queryKey: ['2fa'] });
      toast.success('ปิดใช้งาน 2FA แล้ว');
    },
    onError: (err) => toast.error(err.message),
  });

  const regenerate = useMutation({
    mutationFn: (c: string) => api.post<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes', { code: c }),
    onSuccess: (res) => {
      setRecoveryCodes(res.recoveryCodes);
      queryClient.invalidateQueries({ queryKey: ['2fa'] });
      toast.success('สร้างรหัสกู้คืนใหม่แล้ว');
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeAll = useMutation({
    mutationFn: () => api.delete('/auth/sessions'),
    onSuccess: () => {
      void logout();
      toast.info('ออกจากทุกอุปกรณ์แล้ว กรุณาเข้าสู่ระบบใหม่');
    },
    onError: (err) => toast.error(err.message),
  });

  const copyAll = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('คัดลอกแล้ว');
    } catch {
      toast.error('ไม่สามารถคัดลอกได้ กรุณาเลือกข้อความด้วยตนเอง');
    }
  };

  const enabled = status.data?.enabled ?? false;

  return (
    <section className="card p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {enabled ? (
            <ShieldCheck size={16} className="text-brand-400" />
          ) : (
            <Shield size={16} className="text-warn" />
          )}
          การยืนยันสองขั้นตอน (2FA)
        </h2>
        {enabled && (
          <span className="badge border border-brand-500/30 bg-brand-500/10 text-brand-400">
            เปิดใช้งานอยู่ · เหลือรหัสกู้คืน {status.data?.recoveryCodesRemaining ?? 0} รหัส
          </span>
        )}
      </div>

      {/* Enrolment */}
      {setup && (
        <div className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
          <p className="text-sm font-semibold">สแกน QR code ด้วยแอปพยานัน</p>
          <p className="mt-1 text-xs text-ink-500">
            เช่น Google Authenticator, Microsoft Authenticator หรือ 1Password
          </p>

          <div className="mt-4 flex flex-wrap items-start gap-5">
            <div className="rounded-xl bg-white p-3">
              <img src={setup.qr} alt="QR code สำหรับตั้งค่า 2FA" className="h-40 w-40" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink-500">หรือกรอก secret นี้ด้วยตนเอง</p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">
                  {setup.secret}
                </code>
                <button
                  type="button"
                  onClick={() => void copyAll(setup.secret)}
                  className="btn-secondary btn-sm h-9 w-9 shrink-0 p-0"
                  title="คัดลอก secret"
                >
                  <Copy size={14} />
                </button>
              </div>

              <div className="mt-4">
                <label className="label" htmlFor="totp-setup">
                  รหัส 6 หลักจากแอป
                </label>
                <div className="flex gap-2">
                  <input
                    id="totp-setup"
                    className="input font-mono tracking-widest"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={() => confirmSetup.mutate(code)}
                    disabled={code.length !== 6 || confirmSetup.isPending}
                    className="btn-primary shrink-0"
                  >
                    {confirmSetup.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    ยืนยัน
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSetup(null);
              setCode('');
            }}
            className="btn-ghost btn-sm mt-4"
          >
            ยกเลิก
          </button>
        </div>
      )}

      {/* Recovery codes */}
      {recoveryCodes && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-warn/8 p-5">
          <p className="text-sm font-semibold">บันทึกรหัสกู้คืนไว้ตอนนี้</p>
          <p className="mt-1 text-xs text-ink-500">
            แต่ละรหัสใช้ได้ครั้งเดียว และจะไม่แสดงอีกหลังจากนี้
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-3">
            {recoveryCodes.map((c) => (
              <code key={c} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-center">
                {c}
              </code>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void copyAll(recoveryCodes.join('\n'))}
            className="btn-secondary btn-sm mt-3"
          >
            <Copy size={13} /> คัดลอกทั้งหมด
          </button>
        </div>
      )}

      {!enabled && !setup && (
        <>
          <p className="text-sm leading-relaxed text-ink-500">
            เพิ่มชั้นความปลอดภัยอีกขั้นด้วยรหัสยืนยันแบบครั้งเดียว (TOTP) ซึ่งสร้างจากแอพบนโทรศัพท์ของคุณ
            แม้รหัสผ่านจะรั่วไป ผู้โจมตีก็ยังเข้าบัญชีไม่ได้
          </p>
          <button
            type="button"
            onClick={() => startSetup.mutate()}
            disabled={startSetup.isPending}
            className="btn-primary mt-4"
          >
            {startSetup.isPending ? <Loader2 size={15} className="animate-spin" /> : <Shield size={15} />}
            ตั้งค่า 2FA
          </button>
        </>
      )}

      {enabled && !recoveryCodes && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDisableOpen(true)}
            className="btn-secondary btn-sm text-red-500"
          >
            ปิดใช้งาน 2FA
          </button>
          <RegenerateCodesButton onSubmit={(c) => regenerate.mutate(c)} pending={regenerate.isPending} />
        </div>
      )}

      {/* Sessions */}
      <div className="mt-6 border-t border-ink-500/10 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Key size={15} className="text-brand-500" /> อุปกรณ์ที่เข้าสู่ระบบ
          </h3>
          <button
            type="button"
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending}
            className="btn-ghost btn-sm text-red-500"
          >
            {revokeAll.isPending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
            ออกจากทุกอุปกรณ์
          </button>
        </div>

        {sessions.isLoading ? (
          <div className="space-y-2">
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
          </div>
        ) : !sessions.data?.length ? (
          <Alert kind="info">ไม่พบเซสชันที่ใช้งานอยู่</Alert>
        ) : (
          <ul className="divide-y divide-ink-500/8">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{s.userAgent ?? 'อุปกรณ์ที่ไม่ระบุ'}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    IP {s.ip ?? '-'} · เข้าสู่ระบบ {formatDateTime(s.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="ปิดใช้งาน 2FA"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDisableOpen(false)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={disable2fa.isPending || !disablePassword}
              onClick={() => disable2fa.mutate(disablePassword)}
            >
              {disable2fa.isPending && <Loader2 size={14} className="animate-spin" />}
              ปิดใช้งาน
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          บัญชีของคุณจะถูกป้องกันด้วยรหัสผ่านเพียงอย่างเดียว กรุณายืนยันด้วยรหัสผ่าน
        </p>
        <input
          type="password"
          className="input mt-4"
          value={disablePassword}
          onChange={(e) => setDisablePassword(e.target.value)}
          placeholder="รหัสผ่านของคุณ"
          autoComplete="current-password"
        />
      </Modal>
    </section>
  );
}

function RegenerateCodesButton({
  onSubmit,
  pending,
}: {
  onSubmit: (code: string) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary btn-sm">
        <RefreshCw size={13} /> สร้างรหัสกู้คืนใหม่
      </button>
      {open && (
        <div className="mt-2 flex gap-2">
          <input
            className="input h-9 max-w-32 py-1 font-mono tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
          />
          <button
            type="button"
            onClick={() => onSubmit(code)}
            disabled={code.length !== 6 || pending}
            className="btn-secondary btn-sm"
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            สร้างใหม่
          </button>
        </div>
      )}
    </div>
  );
}

/** Data export and permanent account deletion. */
export function DangerZone() {
  const { logout } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const remove = useMutation({
    mutationFn: (pw: string) => api.delete('/auth/me', { body: { password: pw } }),
    onSuccess: () => {
      void logout();
      window.location.href = '/';
    },
    onError: (err) => toast.error(err.message),
  });

  const exportData = async () => {
    setExporting(true);
    try {
      await api.download('/auth/me/export', `wksl-export-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('ดาวน์โหลดข้อมูลของคุณแล้ว');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const canDelete = password.length > 0 && confirmText.trim() === 'ลบบัญชี';

  return (
    <section className="card border-red-500/25 p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-red-500">
        <AlertTriangle size={16} /> ข้อมูลของคุณและการลบบัญชี
      </h2>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void exportData()}
          disabled={exporting}
          className="btn-secondary btn-sm"
        >
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          ดาวน์โหลดข้อมูลของฉัน (JSON)
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="btn-secondary btn-sm text-red-500"
        >
          <Trash2 size={13} /> ลบบัญชีถาวร
        </button>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="ลบบัญชีถาวร"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeleteOpen(false)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={!canDelete || remove.isPending}
              onClick={() => remove.mutate(password)}
            >
              {remove.isPending && <Loader2 size={14} className="animate-spin" />}
              ลบบัญชีถาวร
            </button>
          </>
        }
      >
        <Alert className="mb-4">
          การลบบัญชีจะลบ<strong>บทความ ความคิดเห็น ข้อความ และไฟล์ทั้งหมด</strong> ของคุณอย่างถาวร
          การกระทำนี้ย้อนกลับไม่ได้
        </Alert>

        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="delete-password">
              ยืนยันด้วยรหัสผ่าน
            </label>
            <input
              id="delete-password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="label" htmlFor="delete-confirm">
              พิมพ์คำว่า <strong>ลบบัญชี</strong> เพื่อยืนยัน
            </label>
            <input
              id="delete-confirm"
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </section>
  );
}

