import { Router } from 'express';
import {
  requireAdmin,
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  updateUser,
  deleteUser,
  getAllGroups,
  deleteGroupAdmin,
  getAdminLogs,
  getSettings,
  updateSettings,
  broadcastMessage
} from '../controllers/adminController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All admin routes require admin privileges
router.use(authenticate, requireAdmin);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Users management
router.get('/users', getAllUsers);
router.get('/users/:userId', getUserDetails);
router.patch('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);

// Groups management
router.get('/groups', getAllGroups);
router.delete('/groups/:groupId', deleteGroupAdmin);

// Admin logs
router.get('/logs', getAdminLogs);

// Settings
router.get('/settings', getSettings);
router.patch('/settings', updateSettings);

// Broadcast
router.post('/broadcast', broadcastMessage);

export default router;
