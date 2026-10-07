import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { created, noContent, ok } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { categorySelect, serializeCategory, tagSelect, serializeTag } from '../serializers/index.js';
import { slugify, uniqueSlug } from '../utils/text.js';

export const categoriesRouter = Router();

/** GET /api/categories - includes post counts for sidebar filters. */
categoriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { ...categorySelect, _count: { select: { posts: true } } },
    });
    return ok(
      res,
      categories.map((c) => ({ ...serializeCategory(c), postCount: c._count.posts })),
    );
  }),
);

categoriesRouter.post(
  '/',
  requireAdmin,
  validateBody(
    z.object({
      name: z.string().trim().min(2).max(40),
      description: z.string().trim().max(200).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'สีต้องเป็น HEX เช่น #10b981').optional(),
      sortOrder: z.number().int().min(0).max(999).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as { name: string; description?: string; color?: string; sortOrder?: number };
    const slug = await uniqueSlug(slugify(body.name), async (s) =>
      (await prisma.category.count({ where: { slug: s } })) > 0,
    );
    const category = await prisma.category.create({
      data: {
        name: body.name,
        slug,
        description: body.description ?? null,
        color: body.color ?? '#10b981',
        sortOrder: body.sortOrder ?? 0,
      },
      select: categorySelect,
    });
    return created(res, serializeCategory(category));
  }),
);

categoriesRouter.patch(
  '/:id',
  requireAdmin,
  validateBody(
    z.object({
      name: z.string().trim().min(2).max(40).optional(),
      description: z.string().trim().max(200).nullable().optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      sortOrder: z.number().int().min(0).max(999).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name as string } : {}),
        ...(body.description !== undefined ? { description: (body.description as string) || null } : {}),
        ...(body.color !== undefined ? { color: body.color as string } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder as number } : {}),
      },
      select: categorySelect,
    });
    return ok(res, serializeCategory(category));
  }),
);

categoriesRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Detach posts first so they survive the category being removed.
    await prisma.post.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
    await prisma.category.delete({ where: { id } });
    return noContent(res);
  }),
);

export const tagsRouter = Router();

/** GET /api/tags - tag cloud data. */
tagsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.postTag.groupBy({
      by: ['tagId'],
      _count: { _all: true },
      orderBy: { _count: { tagId: 'desc' } },
      take: 40,
    });
    const tags = await prisma.tag.findMany({
      where: { id: { in: rows.map((r) => r.tagId) } },
      select: tagSelect,
    });
    const countMap = new Map(rows.map((r) => [r.tagId, r._count._all]));
    return ok(
      res,
      tags.map((t) => ({ ...serializeTag(t), postCount: countMap.get(t.id) ?? 0 })),
    );
  }),
);

tagsRouter.post(
  '/',
  requireAdmin,
  validateBody(z.object({ name: z.string().trim().min(1).max(40) })),
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name: string };
    const slug = await uniqueSlug(slugify(name), async (s) =>
      (await prisma.tag.count({ where: { slug: s } })) > 0,
    );
    const tag = await prisma.tag.create({ data: { name, slug }, select: tagSelect });
    return created(res, serializeTag(tag));
  }),
);

tagsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.tag.delete({ where: { id: req.params.id } });
    return noContent(res);
  }),
);