import { Router } from 'express';

import authRoutes from './auth.routes.js';
import twoFactorRoutes from './two-factor.routes.js';
import userRoutes from './users.routes.js';
import postRoutes from './posts.routes.js';
import commentRoutes from './comments.routes.js';
import { categoriesRouter, tagsRouter } from './taxonomy.routes.js';
import chatRoutes from './chat.routes.js';
import notificationRoutes from './notifications.routes.js';
import adminRoutes from './admin.routes.js';
import uploadRoutes from './upload.routes.js';
import statsRoutes from './stats.routes.js';
import opsRoutes from './ops.routes.js';
import telemetryRoutes from './telemetry.routes.js';
import reportRoutes from './reports.routes.js';

const router = Router();

// Operational endpoints (health / ready / metrics).
router.use('/', opsRoutes);

// Public or shared.
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/posts/:postId/comments', commentRoutes);
router.use('/categories', categoriesRouter);
router.use('/tags', tagsRouter);
router.use('/notifications', notificationRoutes);
router.use('/stats', statsRoutes);
router.use('/uploads', uploadRoutes);
router.use('/reports', reportRoutes);
router.use('/collect', telemetryRoutes);

// Authenticated.
router.use('/auth/2fa', twoFactorRoutes);
router.use('/chat', chatRoutes);

// Admin.
router.use('/admin', adminRoutes);

export default router;