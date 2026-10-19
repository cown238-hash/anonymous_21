/**
 * Adds any missing rows from `CATEGORIES` in seed.ts without touching the rest
 * of the database — `npm run db:seed` wipes posts, comments and chat history,
 * which is not what you want when all you need is one or two new categories.
 *
 *   node scripts/add-categories.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(here, '..', 'prisma', 'seed.ts');

// The category list is data, not logic: read it from seed.ts rather than
// duplicating it here, so the two can never drift apart.
const source = fs.readFileSync(seedPath, 'utf8');
const block = source.match(/const CATEGORIES = \[([\s\S]*?)\n\];/);
if (!block) throw new Error('could not find CATEGORIES in seed.ts');

const categories = [...block[1].matchAll(/\{\s*name:\s*'([^']+)'[^}]*?\}/g)].map((m) => {
  const raw = m[0];
  const pick = (key) => raw.match(new RegExp(`${key}:\\s*'([^']*)'`))?.[1];
  const num = (key) => Number(raw.match(new RegExp(`${key}:\\s*(\\d+)`))?.[1] ?? 0);
  return { name: pick('name'), slug: pick('slug'), description: pick('description'), color: pick('color'), sortOrder: num('sortOrder') };
});

const prisma = new PrismaClient();
try {
  let added = 0;
  for (const c of categories) {
    const existing = await prisma.category.findUnique({ where: { slug: c.slug }, select: { id: true } });
    if (existing) {
      console.log(`  = ${c.name} (${c.slug}) already exists`);
      continue;
    }
    await prisma.category.create({ data: c });
    console.log(`  + ${c.name} (${c.slug})`);
    added++;
  }
  console.log(`\ndone — ${added} categor${added === 1 ? 'y' : 'ies'} added`);
} finally {
  await prisma.$disconnect();
}