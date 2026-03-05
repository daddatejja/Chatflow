import { Router } from "express";
import passport from "passport";
import {
  register,
  login,
  oauthCallback,
  setupMFA,
  verifyMFA,
  disableMFA,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  sendVerification,
  verifyEmail,
} from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { loginLimiter } from "../middleware/rateLimit";

const router = Router();

// Email/password auth
router.post("/register", loginLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/logout", authenticate, logout);
router.post("/logout-all", authenticate, logoutAll);

// Password reset
router.post("/forgot-password", loginLimiter, forgotPassword);
router.post("/reset-password", loginLimiter, resetPassword);

// Email verification
router.post("/verify-email", verifyEmail);
router.post("/send-verification", authenticate, sendVerification);

// MFA
router.post("/mfa/setup", authenticate, setupMFA);
router.post("/mfa/verify", authenticate, verifyMFA);
router.post("/mfa/disable", authenticate, disableMFA);

// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  oauthCallback,
);

// GitHub OAuth
router.get(
  "/github",
  passport.authenticate("github", {
    scope: ["user:email"],
  }),
);

router.get(
  "/github/callback",
  passport.authenticate("github", {
    session: false,
    failureRedirect: "/login",
  }),
  oauthCallback,
);

export default router;
