import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Flag, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Alert, Modal } from './ui';

const REASONS = [
  { value: 'SPAM', label: 'สแปมหรือโฆษณา' },
  { value: 'HARASSMENT', label: 'กลั่นร้ายหรือเหยียดหยาม' },
  { value: 'MISINFORMATION', label: 'ข้อมูลผิดหรือหลอกลวง' },
  { value: 'COPYRIGHT', label: 'ละเมิดลิขสิทธิ์' },
  { value: 'NSFW', label: 'เนื้อหาไม่เหมาะสม' },
  { value: 'OTHER', label: 'อื่น ๆ' },
] as const;

/**
 * Lets a signed-in member flag content for moderator review.
 * Rendered as a small trigger; the modal owns the reason selection.
 */
export function ReportButton({
  targetType,
  targetId,
  label = 'รายงาน',
  className = 'btn-ghost btn-sm',
}: {
  targetType: 'post' | 'comment';
  targetId: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('SPAM');
  const [detail, setDetail] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/reports', {
        targetType,
        targetId,
        reason,
        detail: detail.trim() || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setDetail('');
      toast.success('ส่งรายงานแล้ว ทีมผู้ดูแลจะตรวจสอบโดยเร็ว');
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} title={label}>
        <Flag size={13} />
        <span className="hidden sm:inline">{label}</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="รายงานเนื้อหา"
        description="ผู้ดูแลระบบจะตรวจสอบรายงานนี้"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              ส่งรายงาน
            </button>
          </>
        }
      >
        <Alert className="mb-4">
          การรายงานไม่ได้ทำให้คุณถูกลงโทษ แต่การรายงานซ้ำเนื้อหาเดิมจะถูกปฏิเสธ
        </Alert>

        <fieldset>
          <legend className="label">เหตุผล</legend>
          <div className="space-y-1.5">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-brand-600"
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <label className="label" htmlFor="report-detail">
            รายละเอียดเพิ่มเติม (ไม่บังคับ)
          </label>
          <textarea
            id="report-detail"
            rows={3}
            maxLength={1000}
            className="input resize-y"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="อธิบายสั้น ๆ ว่าเหตุใดจึงรายงาน"
          />
        </div>
      </Modal>
    </>
  );
}