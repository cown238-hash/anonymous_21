/**
 * Standalone entry point for the maintenance jobs, so they can be driven by an
 * external scheduler instead of running inside the web server:
 *
 *   node dist/services/jobs.js      # after `npm run build`
 *   tsx scripts/jobs.mjs            # from source
 */
import { prisma } from '../src/lib/prisma.js';
import { runJobs } from '../src/services/jobs.js';

prisma
  .$connect()
  .then(() => runJobs())
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[jobs] failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });