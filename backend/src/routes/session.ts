import { Router } from 'express';
import {
  getSessions,
  revokeSession,
  revokeOtherSessions
} from '../controllers/sessionController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getSessions);
router.delete('/:sessionId', authenticate, revokeSession);
router.delete('/', authenticate, revokeOtherSessions);

export default router;
