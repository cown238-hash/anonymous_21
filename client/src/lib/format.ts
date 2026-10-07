/* eslint-disable no-useless-escape */
const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(iso)} · ${hh}:${mm}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** "just now", "5 นาทีที่แล้ว", "3 ชั่วโมงที่แล้ว", ... */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '-';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '-';

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 10) return 'เมื่อสักครู่';
  if (seconds < 60) return `${seconds} วินาทีที่แล้ว`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} วันที่แล้ว`;
  if (days < 30) return `${Math.floor(days / 7)} สัปดาห์ที่แล้ว`;
  if (days < 365) return `${Math.floor(days / 30)} เดือนที่แล้ว`;
  return `${Math.floor(days / 365)} ปีที่แล้ว`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Avatar gradients stay inside the black + green palette: every ramp is a
 * shade of the accent, so the UI reads as one system rather than a colour set.
 */
const GRADIENTS = [
  'from-brand-300 to-brand-500',
  'from-brand-400 to-brand-600',
  'from-accent-300 to-brand-500',
  'from-brand-200 to-brand-400',
  'from-brand-400 to-accent-400',
  'from-brand-500 to-accent-500',
  'from-brand-300 to-accent-300',
  'from-brand-600 to-brand-400',
];

export function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function readingProgressFor(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** 1536 -> "1.5 KB". Uses decimal units, matching what a file manager shows. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

/** Coarse bucket used to pick an icon and a label for an attached file. */
export type FileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'archive' | 'text' | 'code' | 'media' | 'font' | 'other';

export function fileKindOf(name: string, mimeType = ''): FileKind {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const mime = mimeType.toLowerCase();

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'heic'].includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('opendocument.spreadsheet') || ['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext)) return 'sheet';
  if (mime.includes('presentation') || mime.includes('powerpoint') || mime.includes('opendocument.presentation') || ['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'slides';
  if (mime.includes('word') || mime.includes('opendocument.text') || mime.includes('rtf') || ['doc', 'docx', 'odt', 'pages', 'epub'].includes(ext)) return 'doc';
  if (['zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'bz2', 'xz'].includes(ext)) return 'archive';
  if (mime.startsWith('audio/') || mime.startsWith('video/') || ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return 'media';
  if (mime.startsWith('font/') || ['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || ['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'html', 'htm', 'log', 'ini', 'csv'].includes(ext)) return 'text';
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'sql', 'swift', 'kt', 'vue', 'svelte'].includes(ext)) return 'code';
  return 'other';
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: 'รูปภาพ',
  pdf: 'เอกสาร PDF',
  doc: 'เอกสาร',
  sheet: 'ตาราง',
  slides: 'สไลด์',
  archive: 'ไฟล์บีบอัด',
  text: 'ข้อความ',
  code: 'ซอร์สโค้ด',
  media: 'สื่อ',
  font: 'ฟอนต์',
  other: 'ไฟล์',
};

/** True for the types the browser can show a thumbnail of without downloading. */
export function isPreviewable(kind: FileKind): boolean {
  return kind === 'image' || kind === 'pdf';
}