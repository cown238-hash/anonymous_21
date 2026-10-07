export type Role = 'USER' | 'ADMIN';
export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type NotificationType = 'COMMENT' | 'REPLY' | 'LIKE' | 'MESSAGE' | 'SYSTEM';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  role: Role;
  createdAt: string;
  lastSeenAt: string;
  /** Only present on endpoints that return the caller's own record. */
  email?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  isHidden?: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  sortOrder: number;
  postCount?: number;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  postCount?: number;
  count?: number;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  downloadUrl: string;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  coverImage: string | null;
  status: PostStatus;
  featured: boolean;
  viewCount: number;
  readMinutes: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: User;
  category: Category | null;
  tags: Tag[];
  attachments: Attachment[];
  attachmentCount: number;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
}

export interface Comment {
  id: string;
  content: string;
  postId: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  author: User;
  replyCount: number;
  canEdit: boolean;
  replies?: Comment[];
}

export interface Paginated<T> {
  items: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface Conversation {
  id: string;
  title: string;
  isDirect: boolean;
  memberCount: number;
  participants: User[];
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    isMine: boolean;
  } | null;
  unreadCount: number;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId?: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  isMine: boolean;
  sender: User;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  actor?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> | null;
}

export interface UserStats {
  posts: number;
  comments: number;
  likesReceived: number;
  likesGiven?: number;
  drafts?: number;
  unreadNotifications?: number;
  unreadMessages?: number;
  viewsTotal?: number;
  recentViews?: Array<{
    id: string;
    title: string;
    slug: string;
    viewCount: number;
    _count: { comments: number; likes: number };
  }>;
}

export interface ActivityBucket {
  date: string;
  posts: number;
  comments: number;
  users: number;
}

export interface Overview {
  totals: { users: number; posts: number; comments: number; messages: number };
  onlineNow: number;
  activity: ActivityBucket[];
}

export interface DirectoryUser extends User {
  stats: { posts: number; comments: number };
  isOnline: boolean;
  /** Only present when the viewer is an admin. */
  isHidden?: boolean;
}

export interface AdminUser extends User {
  isBanned: boolean;
  isHidden: boolean;
  updatedAt: string;
  postCount: number;
  commentCount: number;
}

export interface AdminStats {
  totals: {
    users: number;
    posts: number;
    comments: number;
    messages: number;
    notifications: number;
    categories: number;
    banned: number;
    drafts: number;
  };
  recent: { users7d: number; posts7d: number };
  topPosts: Array<{
    id: string;
    title: string;
    slug: string;
    viewCount: number;
    _count: { likes: number; comments: number };
  }>;
  recentUsers: User[];
  generatedAt: string;
}

export interface AdminPost {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  featured: boolean;
  viewCount: number;
  createdAt: string;
  author: User;
  commentCount: number;
  likeCount: number;
}