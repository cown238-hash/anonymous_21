import { useEffect } from 'react';

const SITE = 'WKSL';
const DEFAULT_DESCRIPTION =
  'แพลตฟอร์มชุมชนสำหรับแชร์ความรู้ พูดคุยแบบเรียลไทม์ และสร้างสิ่งที่ดีไปด้วยกัน';

function upsertMeta(selector: string, attrs: Record<string, string>): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export interface SeoOptions {
  title: string;
  description?: string;
  /** Path only, e.g. `/posts/my-post`. */
  path?: string;
  type?: 'website' | 'article' | 'profile';
  image?: string | null;
  publishedAt?: string | null;
  author?: string | null;
  noIndex?: boolean;
}

/**
 * Declarative document head management.
 *
 * A React SPA has no server-rendered HTML, so crawlers and link previews only
 * see what we write into `document.head`. Every route declares its metadata
 * through this hook.
 */
export function useSeo(options: SeoOptions): void {
  const {
    title,
    description = DEFAULT_DESCRIPTION,
    path,
    type = 'website',
    image,
    publishedAt,
    author,
    noIndex,
  } = options;

  useEffect(() => {
    const fullTitle = title === SITE ? `${SITE} · Community Showcase` : `${title} · ${SITE}`;
    const url = `${window.location.origin}${path ?? window.location.pathname}`;
    const imageUrl = image ? new URL(image, window.location.origin).href : null;

    document.title = fullTitle;

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: noIndex ? 'noindex,nofollow' : 'index,follow',
    });

    // Open Graph
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE });
    upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'th_TH' });
    if (imageUrl) upsertMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl });
    else document.head.querySelector('meta[property="og:image"]')?.remove();

    if (type === 'article' && publishedAt) {
      upsertMeta('meta[property="article:published_time"]', {
        property: 'article:published_time',
        content: publishedAt,
      });
    }
    if (author) {
      upsertMeta('meta[name="author"]', { name: 'author', content: author });
    }

    // Twitter
    upsertMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: imageUrl ? 'summary_large_image' : 'summary',
    });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    });
    if (imageUrl) {
      upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl });
    }

    upsertLink('canonical', url);
  }, [title, description, path, type, image, publishedAt, author, noIndex]);
}

/** Keeps the theme in sync across tabs. */
export function useThemeSync(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'nimbus.theme' || !e.newValue) return;
      document.documentElement.classList.toggle('dark', e.newValue === 'dark');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}