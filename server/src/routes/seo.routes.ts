import { Router } from 'express';
import { PostStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { env } from '../config/env.js';

const router = Router();

/** Escapes the five XML entities so a title can never break the feed. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** GET /robots.txt */
router.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /settings',
      'Disallow: /api/',
      '',
      `Sitemap: ${env.PUBLIC_URL}/sitemap.xml`,
      '',
    ].join('\n'),
  );
});

/** GET /sitemap.xml - generated from published posts and public profiles. */
router.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    const [posts, users, categories] = await Promise.all([
      prisma.post.findMany({
        where: { status: PostStatus.PUBLISHED },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5000,
      }),
      prisma.user.findMany({
        where: { isBanned: false, deletedAt: null },
        select: { username: true, updatedAt: true },
        take: 2000,
      }),
      prisma.category.findMany({ select: { slug: true } }),
    ]);

    const today = new Date().toISOString().slice(0, 10);

    const urls: string[] = [
      { loc: '/', priority: '1.0', changefreq: 'hourly' },
      { loc: '/explore', priority: '0.9', changefreq: 'hourly' },
      { loc: '/members', priority: '0.7', changefreq: 'daily' },
      { loc: '/login', priority: '0.3', changefreq: 'monthly' },
      { loc: '/register', priority: '0.5', changefreq: 'monthly' },
    ]
      .map(
        (u) =>
          `  <url><loc>${env.PUBLIC_URL}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
      )
      .concat(
        posts.map(
          (p) =>
            `  <url><loc>${env.PUBLIC_URL}/posts/${xmlEscape(p.slug)}</loc><lastmod>${p.updatedAt.toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
        ),
        categories.map(
          (c) =>
            `  <url><loc>${env.PUBLIC_URL}/?category=${xmlEscape(c.slug)}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
        ),
        users.map(
          (u) =>
            `  <url><loc>${env.PUBLIC_URL}/u/${xmlEscape(u.username)}</loc><lastmod>${u.updatedAt.toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`,
        ),
      );

    res
      .type('application/xml')
      .set('cache-control', 'public, max-age=3600')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      );
  }),
);

/** GET /manifest.webmanifest - PWA metadata. */
router.get('/manifest.webmanifest', (_req, res) => {
  res.type('application/manifest+json').send(
    JSON.stringify(
      {
        name: 'WKSL',
        short_name: 'WKSL',
        description: 'แพลตฟอร์มชุมชนสำหรับแชร์ความรู้ พร้อมแชทแบบเรียลไทม์',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#050505',
        theme_color: '#10b981',
        lang: 'th',
        dir: 'ltr',
        categories: ['social', 'productivity', 'news'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'เขียนบทความ', url: '/posts/new' },
          { name: 'ข้อความ', url: '/chat' },
          { name: 'สำรวจ', url: '/explore' },
        ],
      },
      null,
      2,
    ),
  );
});

export default router;