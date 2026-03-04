import { Router } from 'express';
import authRoutes from './auth';
import passkeyRoutes from './passkey';
import sessionRoutes from './session';
import userRoutes from './user';
import messageRoutes from './message';
import groupRoutes from './group';
import notificationRoutes from './notification';
import adminRoutes from './admin';
import pollRoutes from './poll';

const router = Router();

router.use('/auth', authRoutes);
router.use('/passkeys', passkeyRoutes);
router.use('/sessions', sessionRoutes);
router.use('/users', userRoutes);
router.use('/messages', messageRoutes);
router.use('/groups', groupRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/polls', pollRoutes);

export default router;
