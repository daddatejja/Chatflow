import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
} from "../controllers/pushController";

const router = Router();

// Get public VAPID key (public endpoint)
router.get("/vapid-key", getVapidPublicKey);

// Subscribe/unsubscribe (protected endpoints)
router.post("/subscribe", authenticate, subscribe);
router.post("/unsubscribe", authenticate, unsubscribe);

export default router;
