import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [
    users,
    posts,
    comments,
    categories,
    tags,
    conversations,
    messages,
    likes,
    attachments,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, email: true, username: true, displayName: true,
        role: true, emailVerified: true, createdAt: true,
      },
    }),
    prisma.post.findMany({
      select: {
        id: true, title: true, slug: true, status: true,
        viewCount: true, featured: true, authorId: true,
        categoryId: true, createdAt: true,
      },
    }),
    prisma.comment.findMany({
      select: {
        id: true, content: true, postId: true, authorId: true,
        isDeleted: true, createdAt: true,
      },
    }),
    prisma.category.findMany(),
    prisma.tag.findMany(),
    prisma.conversation.findMany({
      select: { id: true, title: true, isDirect: true, createdAt: true },
    }),
    prisma.message.findMany({
      select: { id: true, content: true, conversationId: true, senderId: true, createdAt: true },
    }),
    prisma.like.findMany(),
    prisma.attachment.findMany({
      select: {
        id: true, filename: true, originalName: true, mimeType: true,
        size: true, postId: true, uploadedById: true, createdAt: true,
      },
    }),
  ]);

  console.log('=== USERS (' + users.length + ') ===');
  console.table(users);
  console.log('=== CATEGORIES (' + categories.length + ') ===');
  console.table(categories);
  console.log('=== TAGS (' + tags.length + ') ===');
  console.table(tags);
  console.log('=== POSTS (' + posts.length + ') ===');
  console.table(posts);
  console.log('=== COMMENTS (' + comments.length + ') ===');
  console.table(comments);
  console.log('=== CONVERSATIONS (' + conversations.length + ') ===');
  console.table(conversations);
  console.log('=== MESSAGES (' + messages.length + ') ===');
  console.table(messages);
  console.log('=== LIKES (' + likes.length + ') ===');
  console.table(likes);
  console.log('=== ATTACHMENTS (' + attachments.length + ') ===');
  console.table(attachments);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
