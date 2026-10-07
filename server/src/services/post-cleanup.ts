import { prisma } from '../lib/prisma.js';

/**
 * Prisma cascade behaviour differs between providers, and we want explicit,
 * predictable teardown when a post is deleted. These helpers are shaped to run
 * inside a single `prisma.$transaction([...])` call.
 */
export function removePostTagLinks(postId: string) {
  return prisma.postTag.deleteMany({ where: { postId } });
}

/** Removes all comments on a post (self-relation cascades on delete). */
export function removePostComments(postId: string) {
  return prisma.comment.deleteMany({ where: { postId } });
}

export function removePostLikes(postId: string) {
  return prisma.like.deleteMany({ where: { postId } });
}