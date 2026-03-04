import { Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { AuthenticatedRequest, IOAuthProfile } from '../types';
import { prisma } from '../lib/prisma';
import { generateToken } from '../utils/jwt';
import { getDeviceInfo, getLocationFromIP, getClientIP } from '../utils/device';
import { generateAvatarFromName } from '../utils/avatar';
import { sendPasswordResetEmail, sendEmailVerification } from '../services/email';

// Register new user
export const register = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate avatar
    const avatar = generateAvatarFromName(name);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        avatar,
      }
    });

    // Create session
    const session = await createSession(user.id, req);
    const token = generateToken(user, session.id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        mfaEnabled: user.mfaEnabled,
        isAdmin: user.isAdmin,
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Login with email/password
export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, password, mfaCode } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user || !user.password) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({ error: 'Your account has been banned' });
      return;
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check MFA if enabled
    if (user.mfaEnabled) {
      if (!mfaCode) {
        res.status(403).json({
          error: 'MFA required',
          mfaRequired: true
        });
        return;
      }

      const isValidMFA = speakeasy.totp.verify({
        secret: user.mfaSecret!,
        encoding: 'base32',
        token: mfaCode,
        window: 1
      });

      if (!isValidMFA) {
        res.status(401).json({ error: 'Invalid MFA code' });
        return;
      }
    }

    // Create session
    const session = await createSession(user.id, req);
    const token = generateToken(user, session.id);

    // Update user status
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ONLINE', lastSeen: new Date() }
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        mfaEnabled: user.mfaEnabled,
        isAdmin: user.isAdmin,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// OAuth callback handler
export const oauthCallback = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const profile = req.user as unknown as IOAuthProfile;

    if (!profile) {
      res.status(401).json({ error: 'OAuth authentication failed' });
      return;
    }

    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: profile.email.toLowerCase() },
          profile.provider === 'google' ? { googleId: profile.id } : { githubId: profile.id }
        ]
      }
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: profile.email.toLowerCase(),
          name: profile.name,
          avatar: profile.avatar || generateAvatarFromName(profile.name),
          ...(profile.provider === 'google' ? { googleId: profile.id } : { githubId: profile.id }),
        }
      });
    } else {
      // Update OAuth ID if not set
      const updateData: Record<string, string> = {};
      if (profile.provider === 'google' && !user.googleId) {
        updateData.googleId = profile.id;
      } else if (profile.provider === 'github' && !user.githubId) {
        updateData.githubId = profile.id;
      }
      if (!user.avatar && profile.avatar) {
        updateData.avatar = profile.avatar;
      }

      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData
        });
      }
    }

    // Create session
    const session = await createSession(user.id, req);
    const token = generateToken(user, session.id);

    // Update user status
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ONLINE', lastSeen: new Date() }
    });

    // Return token (frontend should handle this)
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        mfaEnabled: user.mfaEnabled,
        isAdmin: user.isAdmin,
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
};

// Setup MFA
export const setupMFA = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `ChatFlow:${user.email}`,
      length: 32
    });

    // Save secret temporarily
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: secret.base32 }
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({ error: 'MFA setup failed' });
  }
};

// Verify and enable MFA
export const verifyMFA = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    const user = req.user!;

    if (!user.mfaSecret) {
      res.status(400).json({ error: 'MFA not set up' });
      return;
    }

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!isValid) {
      res.status(400).json({ error: 'Invalid verification code' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true }
    });

    res.json({ message: 'MFA enabled successfully' });
  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json({ error: 'MFA verification failed' });
  }
};

// Disable MFA
export const disableMFA = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    const user = req.user!;

    if (!user.mfaEnabled || !user.mfaSecret) {
      res.status(400).json({ error: 'MFA not enabled' });
      return;
    }

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!isValid) {
      res.status(400).json({ error: 'Invalid verification code' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null }
    });

    res.json({ message: 'MFA disabled successfully' });
  } catch (error) {
    console.error('MFA disable error:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
};

// Logout
export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const sessionId = req.sessionId;

    if (sessionId) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { isActive: false }
      });
    }

    // Update user status
    if (req.user) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { status: 'OFFLINE', lastSeen: new Date() }
      });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Logout all sessions
export const logoutAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    await prisma.session.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false }
    });

    // Update user status
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'OFFLINE', lastSeen: new Date() }
    });

    res.json({ message: 'All sessions logged out' });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: 'Failed to logout all sessions' });
  }
};

// Forgot password - sends reset email
export const forgotPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      }
    });

    // Send email
    await sendPasswordResetEmail(user.email, resetToken);

    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
};

// Reset password with token
export const resetPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    // Invalidate all sessions
    await prisma.session.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false }
    });

    res.json({ message: 'Password has been reset successfully. Please log in again.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// Send email verification
export const sendVerification = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    if (user.isVerified) {
      res.status(400).json({ error: 'Email is already verified' });
      return;
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires
      }
    });

    await sendEmailVerification(user.email, verificationToken);

    res.json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
};

// Verify email with token
export const verifyEmail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Verification token is required' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { gt: new Date() }
      }
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null
      }
    });

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
};

// Helper function to create session
const createSession = async (userId: string, req: AuthenticatedRequest) => {
  const deviceInfo = getDeviceInfo(req);
  const ipAddress = getClientIP(req);
  const location = await getLocationFromIP(ipAddress);

  const session = await prisma.session.create({
    data: {
      userId,
      token: '', // Will be updated after token generation
      browser: deviceInfo.browser,
      browserVersion: deviceInfo.browserVersion,
      os: deviceInfo.os,
      osVersion: deviceInfo.osVersion,
      device: deviceInfo.device,
      deviceType: deviceInfo.deviceType as any,
      ipAddress,
      country: location?.country,
      city: location?.city,
      region: location?.region,
      latitude: location?.latitude,
      longitude: location?.longitude,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    }
  });

  // Generate token with session ID
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const token = generateToken(user!, session.id);

  await prisma.session.update({
    where: { id: session.id },
    data: { token }
  });

  return session;
};
