import path from 'node:path';
import fs from 'node:fs';
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

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Keep raw IPs out of the rate limiter's default key when behind a proxy.
  app.set('etag', 'strong');

  app.use(
    helmet({
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
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          fontSrc: ["'self'", 'data:'],
          upgradeInsecureRequests: env.isProd ? [] : null,
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: env.isProd ? { maxAge: 15_552_000, includeSubDomains: true, preload: true } : false,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
    }),
  );

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
  const clientDist = path.resolve(env.serverRoot, '..', 'client', 'dist');
  const indexHtml = path.join(clientDist, 'index.html');

  if (fs.existsSync(clientDist)) {
    app.use(
      express.static(clientDist, {
        index: false,
        maxAge: '1y',
        setHeaders(res, filePath) {
          // Hashed assets can be cached forever; index.html must not be.
          if (filePath.endsWith('index.html')) res.setHeader('cache-control', 'no-cache');
          // Never let a stale bundle pin users to a broken deploy.
          if (filePath.endsWith('.html')) res.setHeader('cache-control', 'no-cache');
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