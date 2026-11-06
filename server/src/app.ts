import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env, ensureUploadDir } from './config/env.js';
import { logger } from './config/logger.js';
import { HttpError } from './lib/http-error.js';
import routes from './routes/index.js';
import seoRoutes from './routes/seo.routes.js';
import { attachUser } from './middleware/auth.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

/**
 * `script-src` hashes for the inline scripts in the built `index.html`.
 *
 * The theme bootstrap has to run before the first paint, which means inline —
 * and our CSP allows no inline script without a hash. Deriving the hash from the
 * file we are about to serve keeps the two in step: editing the snippet cannot
 * silently desync the way a hand-copied hash would, and there is still no
 * `'unsafe-inline'` in the policy.
 */
function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  const pattern = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    hashes.push(`'sha256-${crypto.createHash('sha256').update(match[1] ?? '', 'utf8').digest('base64')}'`);
    match = pattern.exec(html);
  }
  return hashes;
}

/** Reads `client/dist/index.html` and hashes whatever inline scripts it currently holds. */
function computeInlineHashes(indexHtml: string): string[] {
  try {
    return inlineScriptHashes(fs.readFileSync(indexHtml, 'utf8'));
  } catch {
    // No build on disk (dev checkout without a client build) — nothing to hash.
    return [];
  }
}

/**
 * Security headers, with the CSP's `script-src` pinned to the inline scripts
 * present in the `client/dist/index.html` we are about to serve.
 */
function buildSecurityMiddleware(inlineHashes: string[]) {
  return helmet({
    // Uploaded media is served to a dev origin on a different port.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
        // Vite injects styles at runtime in dev; the built CSS is self-hosted.
        styleSrc: ["'self'", "'unsafe-inline'"],
        // 'self' plus the hashes of the inline scripts actually present in the
        // index.html we serve — currently the anti-flash theme bootstrap.
        // cloudflareinsights.com hosts the Web Analytics beacon Cloudflare
        // injects at the edge.
        scriptSrc: ["'self'", ...inlineHashes, 'https://static.cloudflareinsights.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://static.cloudflareinsights.com', 'https://cloudflareinsights.com'],
        fontSrc: ["'self'", 'data:'],
        upgradeInsecureRequests: env.isProd ? [] : null,
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Preloading is a statement about a whole registrable domain and
    // `includeSubDomains` only reaches `*.this-host`, so both are opt-in: a
    // subdomain deployment should not claim what it cannot deliver.
    hsts: env.isProd
      ? {
          maxAge: 15_552_000,
          includeSubDomains: env.HSTS_INCLUDE_SUBDOMAINS,
          preload: env.HSTS_INCLUDE_SUBDOMAINS,
        }
      : false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  });
}

function fileMtimeMs(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

export function createApp() {
  const app = express();

  const clientDist = path.resolve(env.serverRoot, '..', 'client', 'dist');
  const indexHtml = path.join(clientDist, 'index.html');

  /**
   * The CSP is built once at boot, but the served `index.html` changes on every
   * client rebuild — and the inline-script hashes must follow it, or the browser
   * blocks the anti-flash theme bootstrap. Rebuild the helmet middleware when the
   * file's mtime moves, instead of pinning the hashes computed at boot.
   */
  let helmetMtime = fileMtimeMs(indexHtml);
  let securityMiddleware = buildSecurityMiddleware(computeInlineHashes(indexHtml));
  app.use((req, res, next) => {
    const mtime = fileMtimeMs(indexHtml);
    if (mtime !== helmetMtime) {
      helmetMtime = mtime;
      securityMiddleware = buildSecurityMiddleware(computeInlineHashes(indexHtml));
    }
    return securityMiddleware(req, res, next);
  });

  // Cloudflare → Caddy → app is two hops, so read the hop count from config
  // instead of hard-coding one — otherwise `req.ip` stays on the edge address.
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  // Keep raw IPs out of the rate limiter's default key when behind a proxy.
  app.set('etag', 'strong');

  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / curl / server-to-server (no Origin header).
        if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
        cb(HttpError.forbidden(`Origin ${origin} ไม่ได้รับอนุญาต`));
      },
      credentials: true,
      maxAge: 600,
    }),
  );

  app.use(
    compression({
      filter: (req, res) => {
        // Compress JSON and text; leave already-compressed media alone.
        if (req.path.startsWith('/uploads')) return false;
        return compression.filter(req, res);
      },
      threshold: 1024,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestContext);
  if (env.isDev) app.use(morgan('dev'));
  else app.use(morgan('combined'));

  // Uploaded media.
  ensureUploadDir();
  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      maxAge: env.isProd ? '30d' : 0,
      index: false,
      immutable: env.isProd,
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
      },
    }),
  );

  // robots.txt / sitemap.xml / manifest — served at the root for crawlers.
  app.use('/', seoRoutes);

  app.use('/api', globalLimiter, attachUser, routes);

  // In production the API also serves the built client.
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(clientDist, {
        index: false,
        maxAge: '1y',
        setHeaders(res, filePath) {
          // Hashed assets can be cached forever; index.html must not be.
          if (filePath.endsWith('index.html')) res.setHeader('cache-control', 'no-cache');
          // Never let a stale bundle pin users to a broken deploy.
          if (filePath.endsWith('.html')) res.setHeader('cache-control', 'no-cache');
          // The service worker script must be revalidated every visit, or
          // browsers hold on to an old worker (and its old cache) for up to
          // maxAge. A year is the death of an SW update.
          if (filePath.endsWith('sw.js')) res.setHeader('cache-control', 'no-cache');
          // Manifest is small and changes with branding — an hour keeps it
          // fresh without a request per navigation.
          if (filePath.endsWith('.webmanifest')) res.setHeader('cache-control', 'public, max-age=3600');
        },
      }),
    );

    // SPA fallback for client-side routes.
    app.get(/^(?!\/api|\/uploads|\/socket\.io).*/, (_req, res, next) => {
      res.setHeader('cache-control', 'no-cache');
      res.sendFile(indexHtml, (err) => {
        if (err) {
          logger.warn('spa fallback failed', { error: err.message });
          next();
        }
      });
    });
  } else {
    logger.warn('client build not found - run `npm run build` to serve the frontend', {
      expected: clientDist,
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}