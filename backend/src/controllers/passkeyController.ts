import { Response } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { generateToken } from '../utils/jwt';
import { getDeviceInfo, getLocationFromIP, getClientIP } from '../utils/device';

const rpName = 'ChatFlow';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || 'http://localhost:5173';

// In-memory challenge storage (use Redis in production)
const challenges: Map<string, string> = new Map();

// Generate registration options
export const generateRegisterOptions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(user.id) as any,
      userName: user.email,
      userDisplayName: user.name,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      }
    });

    // Store challenge
    challenges.set(user.id, options.challenge);

    res.json(options);
  } catch (error) {
    console.error('Generate register options error:', error);
    res.status(500).json({ error: 'Failed to generate registration options' });
  }
};

// Verify registration
export const verifyRegister = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const response = req.body;
    const challenge = challenges.get(user.id);

    if (!challenge) {
      res.status(400).json({ error: 'No challenge found' });
      return;
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Registration verification failed' });
      return;
    }

    const deviceInfo = getDeviceInfo(req);

    // Save passkey
    await prisma.passkey.create({
      data: {
        userId: user.id,
        credentialId: response.id,
        publicKey: Buffer.from(verification.registrationInfo.credentialPublicKey),
        counter: verification.registrationInfo.counter,
        deviceName: `${deviceInfo.browser} on ${deviceInfo.os}`,
        deviceType: deviceInfo.deviceType
      }
    });

    // Clear challenge
    challenges.delete(user.id);

    res.json({ message: 'Passkey registered successfully' });
  } catch (error) {
    console.error('Verify register error:', error);
    res.status(500).json({ error: 'Failed to verify registration' });
  }
};

// Generate authentication options
export const generateAuthOptions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { passkeys: true }
    });

    if (!user || user.passkeys.length === 0) {
      res.status(400).json({ error: 'No passkeys found for this user' });
      return;
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.passkeys.map(pk => ({
        id: pk.credentialId as any,
        type: 'public-key' as const
      }))
    });

    // Store challenge and userId
    challenges.set(options.challenge, user.id);

    res.json(options);
  } catch (error) {
    console.error('Generate auth options error:', error);
    res.status(500).json({ error: 'Failed to generate authentication options' });
  }
};

// Verify authentication
export const verifyAuth = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const response = req.body;
    const challenge = response.clientExtensionResults?.challenge as string || '';
    const userId = challenges.get(challenge);

    if (!userId) {
      res.status(400).json({ error: 'No challenge or user found' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { passkeys: true }
    });

    if (!user) {
      res.status(400).json({ error: 'User not found' });
      return;
    }

    // Find the passkey
    const passkey = user.passkeys.find(pk => pk.credentialId === response.id);

    if (!passkey) {
      res.status(400).json({ error: 'Passkey not found' });
      return;
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: passkey.credentialId as any,
        credentialPublicKey: passkey.publicKey as any,
        counter: passkey.counter
      }
    });

    if (!verification.verified) {
      res.status(400).json({ error: 'Authentication verification failed' });
      return;
    }

    // Update counter and last used
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsed: new Date()
      }
    });

    // Clear challenge
    challenges.delete(challenge);

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
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error('Verify auth error:', error);
    res.status(500).json({ error: 'Failed to verify authentication' });
  }
};

// Get user's passkeys
export const getPasskeys = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    const passkeys = await prisma.passkey.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        createdAt: true,
        lastUsed: true
      },
      orderBy: { lastUsed: 'desc' }
    });

    res.json({ passkeys });
  } catch (error) {
    console.error('Get passkeys error:', error);
    res.status(500).json({ error: 'Failed to get passkeys' });
  }
};

// Delete passkey
export const deletePasskey = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { passkeyId } = req.params;
    const userId = req.user!.id;

    await prisma.passkey.deleteMany({
      where: {
        id: passkeyId,
        userId
      }
    });

    res.json({ message: 'Passkey deleted successfully' });
  } catch (error) {
    console.error('Delete passkey error:', error);
    res.status(500).json({ error: 'Failed to delete passkey' });
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
      token: '',
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
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  const token = generateToken({ id: userId } as any, session.id);

  await prisma.session.update({
    where: { id: session.id },
    data: { token }
  });

  return session;
};
