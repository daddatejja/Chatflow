import { Router } from 'express';
import {
  generateRegisterOptions,
  verifyRegister,
  generateAuthOptions,
  verifyAuth,
  getPasskeys,
  deletePasskey
} from '../controllers/passkeyController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Registration (authenticated)
router.post('/register/options', authenticate, generateRegisterOptions);
router.post('/register/verify', authenticate, verifyRegister);

// Authentication (not authenticated - for login)
router.post('/auth/options', generateAuthOptions);
router.post('/auth/verify', verifyAuth);

// Manage passkeys
router.get('/', authenticate, getPasskeys);
router.delete('/:passkeyId', authenticate, deletePasskey);

export default router;
