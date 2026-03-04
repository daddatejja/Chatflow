import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { createPoll, votePoll, getPoll } from '../controllers/pollController';

const router = Router();

// Ensure all poll routes are protected by authentication
router.use(authenticate);

// Create a new poll
router.post('/', createPoll);

// Vote on a poll
router.post('/vote', votePoll);

// Get a specific poll
router.get('/:id', getPoll);

export default router;
