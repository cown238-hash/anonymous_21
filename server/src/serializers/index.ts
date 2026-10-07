import type { Prisma } from '@prisma/client';

export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  website: true,
  location: true,
  role: true,
  createdAt: true,
  lastSeenAt: true,
} satisfies Prisma.UserSelect;

export const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  color: true,
  sortOrder: true,
} satisfies Prisma.CategorySelect;

export const tagSelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.TagSelect;

export const attachmentSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} satisfies Prisma.AttachmentSelect;

export const postInclude = {
  author: { select: publicUserSelect },
  category: { select: categorySelect },
  tags: { include: { tag: { select: tagSelect } } },
  // No `orderBy` here: this same object is used as the `include` of `create`,
  // which rejects it. Sorting happens in the serializer instead.
  attachments: { select: attachmentSelect },
  likes: { select: { userId: true } },
  _count: { select: { comments: true, likes: true } },
} satisfies Prisma.PostInclude;

export const commentInclude = {
  author: { select: publicUserSelect },
} satisfies Prisma.CommentInclude;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
export type PostWithRelations = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export type CommentWithAuthor = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

type MaybeRelations = { _count?: { comments: number; likes: number } };

/**
 * Files are referenced by id, never by path: the download route looks the row
 * up and streams from the upload directory, so a client cannot reach a file it
 * was not given.
 */
export type SerializedAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  downloadUrl: string;
};

/**
 * Fields that are only ever included for the account owner. They are absent on
 * public endpoints (a profile must never leak an email address).
 */
export type SelfUser = PublicUser & {
  email?: string | null;
  emailVerified?: boolean | null;
  twoFactorEnabled?: boolean | null;
  isHidden?: boolean | null;
};

export function serializeUser(user: SelfUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    website: user.website,
    location: user.location,
    role: user.role,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    // Only present when the caller is looking at their own record.
    ...(user.email !== undefined ? { email: user.email } : {}),
    ...(user.emailVerified !== undefined ? { emailVerified: user.emailVerified } : {}),
    ...(user.twoFactorEnabled !== undefined ? { twoFactorEnabled: user.twoFactorEnabled } : {}),
    ...(user.isHidden !== undefined ? { isHidden: user.isHidden } : {}),
  };
}

export function serializeCategory(category: Prisma.CategoryGetPayload<{ select: typeof categorySelect }>) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    color: category.color,
    sortOrder: category.sortOrder,
  };
}

export function serializeTag(tag: Prisma.TagGetPayload<{ select: typeof tagSelect }>) {
  return { id: tag.id, name: tag.name, slug: tag.slug };
}

export function serializePost(post: PostWithRelations & MaybeRelations, viewerId?: string | null) {
  const attachments: SerializedAttachment[] = [...(post.attachments ?? [])]
    // Oldest first, so a file list reads in the order it was added.
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((a) => ({
      id: a.id,
      name: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      url: `/api/posts/${post.slug}/attachments/${a.id}`,
      downloadUrl: `/api/posts/${post.slug}/attachments/${a.id}?download=1`,
    }));

  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    coverImage: post.coverImage,
    status: post.status,
    featured: post.featured,
    viewCount: post.viewCount,
    readMinutes: post.readMinutes,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: serializeUser(post.author),
    category: post.category ? serializeCategory(post.category) : null,
    tags: post.tags.map((t) => serializeTag(t.tag)),
    attachments,
    attachmentCount: attachments.length,
    commentCount: post._count?.comments ?? 0,
    likeCount: post._count?.likes ?? post.likes.length,
    likedByMe: viewerId ? post.likes.some((l) => l.userId === viewerId) : false,
  };
}

export function serializeComment(
  comment: CommentWithAuthor,
  viewerId?: string | null,
  replyCount = 0,
) {
  return {
    id: comment.id,
    content: comment.content,
    postId: comment.postId,
    parentId: comment.parentId,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    isDeleted: comment.isDeleted,
    author: serializeUser(comment.author),
    replyCount,
    canEdit: viewerId ? comment.authorId === viewerId : false,
  };
}