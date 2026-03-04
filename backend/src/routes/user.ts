import { Router } from 'express';
import multer from 'multer';
import {
  getProfile,
  updateProfile,
  updateAvatar,
  generateAvatar,
  randomAvatar,
  changePassword,
  searchUsers,
  getUserById,
  getFriends,
  getFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  getBlockedUsers
} from '../controllers/userController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Profile routes
router.get('/profile', authenticate, getProfile);
router.patch('/profile', authenticate, updateProfile);
router.post('/avatar', authenticate, upload.single('avatar'), updateAvatar);
router.post('/avatar/generate', authenticate, generateAvatar);
router.post('/avatar/random', authenticate, randomAvatar);
router.post('/change-password', authenticate, changePassword);

// User search and discovery
router.get('/search', authenticate, searchUsers);
router.get('/friends', authenticate, getFriends);
router.get('/friends/requests', authenticate, getFriendRequests);
router.post('/friends/request', authenticate, sendFriendRequest);
router.post('/friends/requests/:requestId/accept', authenticate, acceptFriendRequest);
router.post('/friends/requests/:requestId/decline', authenticate, declineFriendRequest);
router.delete('/friends/:friendId', authenticate, removeFriend);

// Get user by ID (public profile)
router.get('/:userId', authenticate, getUserById);

// Block/Unblock users
router.get('/block/list', authenticate, getBlockedUsers);
router.post('/block/:userId', authenticate, blockUser);
router.delete('/block/:userId', authenticate, unblockUser);

export default router;
