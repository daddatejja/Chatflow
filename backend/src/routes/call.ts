import { Router } from 'express';
import { getCallHistory } from '../controllers/callController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/history', authenticate, getCallHistory);

export default router;
