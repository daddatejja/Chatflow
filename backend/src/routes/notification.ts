import { Router } from 'express';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification
} from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getNotifications);
router.patch('/:notificationId/read', authenticate, markNotificationRead);
router.patch('/read-all', authenticate, markAllNotificationsRead);
router.delete('/:notificationId', authenticate, deleteNotification);

export default router;
