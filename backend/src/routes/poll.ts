import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  createPoll,
  votePoll,
  getPoll,
  getPollByMessageId,
} from "../controllers/pollController";

const router = Router();

// Ensure all poll routes are protected by authentication
router.use(authenticate);

// Create a new poll
router.post("/", createPoll);

// Vote on a poll
router.post("/vote", votePoll);

// Get a poll by message ID (must be before /:id to avoid route conflict)
router.get("/by-message/:messageId", getPollByMessageId);

// Get a specific poll
router.get("/:id", getPoll);

export default router;
