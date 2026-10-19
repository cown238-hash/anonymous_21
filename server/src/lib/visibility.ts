import { Role, type Prisma } from '@prisma/client';

/**
 * Users with a hidden profile (and everything they wrote) stay reachable for
 * admins, for the owner themselves, and for nobody else.
 */
export type Viewer = { id: string; role: Role } | null | undefined;

export function canSeeHidden(viewer: Viewer): boolean {
  return viewer?.role === Role.ADMIN;
}

/**
 * AND-clause that drops posts authored by a hidden account. Meant to be pushed
 * into a query's `AND` array so it never collides with the status/search ORs.
 */
export function visiblePosts(viewer: Viewer): Prisma.PostWhereInput {
  if (canSeeHidden(viewer)) return {};
  return {
    OR: [{ author: { isHidden: false } }, ...(viewer ? [{ authorId: viewer.id }] : [])],
  };
}

/** Same idea for comments. */
export function visibleComments(viewer: Viewer): Prisma.CommentWhereInput {
  if (canSeeHidden(viewer)) return {};
  return {
    OR: [{ author: { isHidden: false } }, ...(viewer ? [{ authorId: viewer.id }] : [])],
  };
}

/** False when a record belongs to a hidden account the viewer may not see. */
export function isAuthorVisible(
  author: { id: string; isHidden: boolean } | null | undefined,
  viewer: Viewer,
): boolean {
  if (!author?.isHidden) return true;
  return canSeeHidden(viewer) || viewer?.id === author.id;
}