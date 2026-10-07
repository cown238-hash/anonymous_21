import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Transactional email.
 *
 * When SMTP is configured we send for real. When it is not (local dev, CI,
 * offline machines) the message is logged instead and any "link" it carries is
 * returned to the caller so the flow stays testable end to end.
 */

export interface MailResult {
  sent: boolean;
  /** Populated only in the log-fallback mode. */
  previewUrl?: string;
  previewText?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.smtpEnabled) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    ...(env.SMTP_USER && env.SMTP_PASS
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
    pool: true,
    maxConnections: 3,
  });

  logger.info('smtp transport ready', { host: env.SMTP_HOST, port: env.SMTP_PORT });
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Low-level send. iever throws — a failed email must not fail the request. */
export async function sendMail(input: SendMailInput): Promise<MailResult> {
  const smtp = getTransporter();

  if (!smtp) {
    logger.info('email (not sent - no SMTP configured)', {
      to: input.to,
      subject: input.subject,
      body: input.text,
    });
    return { sent: false, previewText: input.text };
  }

  try {
    await smtp.sendMail({ from: env.MAIL_FROM, ...input });
    logger.info('email sent', { to: input.to, subject: input.subject });
    return { sent: true };
  } catch (err) {
    logger.error('email failed', {
      to: input.to,
      subject: input.subject,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false };
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f5fa;font-family:-apple-system,Segoe UI,Roboto,'Noto Sans Thai',sans-serif;color:#1f2437">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e8f0">
          <tr><td style="background:#050505;padding:24px 32px">
            <span style="color:#34d399;font-size:18px;font-weight:700;letter-spacing:-0.01em">WKSL</span>
          </td></tr>
          <tr><td style="padding:32px">
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">${title}</h1>
            ${bodyHtml}
            ${
              cta
                ? `<p style="margin:28px 0 0"><a href="${cta.url}" style="display:inline-block;background:#10b981;color:#000;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;font-size:15px">${cta.label}</a></p>
                   <p style="margin:20px 0 0;font-size:12px;color:#7c849c">ถ้าปุ่มไม่ทำงาน คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:<br>
                   <span style="word-break:break-all">${cta.url}</span></p>`
                : ''
            }
          </td></tr>
          <tr><td style="padding:20px 32px;background:#fafbfd;border-top:1px solid #eef0f6;font-size:11px;color:#9aa1b5">
            คุณได้รับอีเมลนี้เพราะมีบัญชีบน WKSL · ${env.PUBLIC_URL}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendVerifyEmail(to: string, token: string): Promise<MailResult> {
  const url = `${env.PUBLIC_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const text = `ยินดีต้อนรับสู่ WKSL! ยืนยันอีเมลของคุณที่ลิงก์นี้ (หมดอายุใน 48 ชั่วโมง):\n\n${url}\n\nหากคุณไม่ได้สมัครบัญชีนี้ สามารถเพิกเฉยได้`;

  const result = await sendMail({
    to,
    subject: 'ยืนยันอีเมลของคุณ · WKSL',
    text,
    html: layout(
      'ยืนยันอีเมลของคุณ',
      '<p style="margin:0;font-size:15px;line-height:1.7;color:#4a5163">ยินดีต้อนรับสู่ WKSL! กดปุ่มด้านล่างเพื่อยืนยันอีเมลและเปิดใช้งานบัญชีของคุณ</p>',
      { label: 'ยืนยันอีเมล', url },
    ),
  });

  return { ...result, previewUrl: url, previewText: text };
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<MailResult> {
  const url = `${env.PUBLIC_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const text = `มีการขอรีเซ็ตรหัสผ่านสำหรับบัญชีนี้\n\n${url}\n\nลิงก์หมดอายุใน 60 นาที หากคุณไม่ได้เป็นผู้ร้องขอ ให้เพิกเฉยอีเมลนี้`;

  const result = await sendMail({
    to,
    subject: 'รีเซ็ตรหัสผ่าน · WKSL',
    text,
    html: layout(
      'รีเซ็ตรหัสผ่าน',
      '<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#4a5163">เราได้รับคำขอให้รีเซ็ตรหัสผ่านของคุณ กดปุ่มด้านล่างภายใน 60 นาทีเพื่อตั้งรหัสผ่านใหม่</p>' +
        '<p style="margin:0;font-size:14px;line-height:1.7;color:#7c849c">ถ้าคุณไม่ได้เป็นผู้ร้องขอ บัญชีนี้ยังปลอดภัยอยู่ — เพิกเฉยอีเมลนี้ได้เลย</p>',
      { label: 'ตั้งรหัสผ่านใหม่', url },
    ),
  });

  return { ...result, previewUrl: url, previewText: text };
}

export async function sendSecurityAlert(to: string, event: string, detail: string): Promise<void> {
  const text = `ตรวจพบกิจกรรมด้านความปลอดภัยบนบัญชีของคุณ\n\n${event}\n${detail}\n\n${env.PUBLIC_URL}/settings`;

  await sendMail({
    to,
    subject: `แจ้งเตือนด้านความปลอดภัย · ${event}`,
    text,
    html: layout(
      'แจ้งเตือนด้านความปลอดภัย',
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#4a5163"><strong>${event}</strong></p>
       <pre style="margin:0;padding:14px;background:#f4f5fa;border-radius:10px;font-size:13px;color:#4a5163;white-space:pre-wrap;word-break:break-word">${detail}</pre>`,
    ),
  });

  // Optional second channel so alerts are not email-only.
  if (env.SECURITY_ALERT_WEBHOOK) {
    void fetch(env.SECURITY_ALERT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, detail, to, at: new Date().toISOString() }),
    }).catch((err) => logger.warn('security webhook failed', { error: String(err) }));
  }
}

export async function sendKelcomeEmail(to: string, displayName: string): Promise<void> {
  await sendMail({
    to,
    subject: 'ยินดีต้อนรับสู่ WKSL',
    text: `สวัสดี ${displayName}!\n\nบอกต่อได้ที่ ${env.PUBLIC_URL}`,
    html: layout(
      `สวัสดี ${displayName} 👋`,
      '<p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#4a5163">ยินดีต้อนรับสู่ WKSL — พื้นที่สำหรับแชร์ความรู้ พูดคุย และสร้างสิ่งที่ดีไปด้วยกัน</p>' +
        '<ul style="margin:0;padding-left:20px;color:#4a5163;font-size:15px;line-height:1.9">' +
        '<li>เขียนบทความแรกของคุณ</li>' +
        '<li>พูดคุยกับชุมชนแบบเรียลไทม์</li>' +
        '<li>เปิด 2FA เพื่อความปลอดภัยเพิ่มเติม</li>' +
        '</ul>',
      { label: 'เริ่มต้นใช้งาน', url: env.PUBLIC_URL },
    ),
  });
}