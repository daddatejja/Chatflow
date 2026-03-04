import { Router } from 'express';
import {
  createGroup,
  getMyGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  addMember,
  joinGroup,
  removeMember,
  updateMemberRole,
  leaveGroup,
  regenerateInviteCode
} from '../controllers/groupController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Group CRUD
router.post('/', authenticate, createGroup);
router.get('/', authenticate, getMyGroups);
router.get('/:groupId', authenticate, getGroupById);
router.patch('/:groupId', authenticate, updateGroup);
router.delete('/:groupId', authenticate, deleteGroup);

// Group membership
router.post('/join', authenticate, joinGroup);
router.post('/:groupId/members', authenticate, addMember);
router.delete('/:groupId/members/:userId', authenticate, removeMember);
router.patch('/:groupId/members/:userId/role', authenticate, updateMemberRole);
router.post('/:groupId/leave', authenticate, leaveGroup);

// Invite code
router.post('/:groupId/regenerate-invite', authenticate, regenerateInviteCode);

export default router;
