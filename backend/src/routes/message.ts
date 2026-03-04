import { Router } from 'express';
import {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  addThreadReply,
  getUnreadCounts,
  markAsRead,
  getGroupMessages,
  sendGroupMessage,
  addGroupReaction,
  searchMessages
} from '../controllers/messageController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Search messages (must be before /:userId)
router.get('/search', authenticate, searchMessages);

// Direct messages
router.get('/unread', authenticate, getUnreadCounts);
router.get('/:userId', authenticate, getMessages);
router.post('/', authenticate, sendMessage);
router.patch('/:messageId', authenticate, editMessage);
router.delete('/:messageId', authenticate, deleteMessage);
router.patch('/:userId/read', authenticate, markAsRead);

// Reactions
router.post('/:messageId/reactions', authenticate, addReaction);
router.delete('/:messageId/reactions', authenticate, removeReaction);

// Thread replies
router.post('/:messageId/replies', authenticate, addThreadReply);

// Group messages
router.get('/group/:groupId', authenticate, getGroupMessages);
router.post('/group/:groupId', authenticate, sendGroupMessage);
router.post('/group/:groupId/:messageId/reactions', authenticate, addGroupReaction);

export default router;
