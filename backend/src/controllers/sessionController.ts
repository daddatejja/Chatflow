import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

// Get all active sessions for user
export const getSessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const currentSessionId = req.sessionId;
    
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      orderBy: { lastActive: 'desc' }
    });
    
    const formattedSessions = sessions.map(session => ({
      id: session.id,
      deviceInfo: {
        browser: session.browser,
        browserVersion: session.browserVersion,
        os: session.os,
        osVersion: session.osVersion,
        device: session.device,
        deviceType: session.deviceType
      },
      ipAddress: session.ipAddress,
      location: {
        country: session.country,
        city: session.city,
        region: session.region,
        latitude: session.latitude,
        longitude: session.longitude
      },
      createdAt: session.createdAt,
      lastActive: session.lastActive,
      isCurrentSession: session.id === currentSessionId
    }));
    
    res.json({ sessions: formattedSessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
};

// Revoke a specific session
export const revokeSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;
    const currentSessionId = req.sessionId;
    
    // Prevent revoking current session through this endpoint
    if (sessionId === currentSessionId) {
      res.status(400).json({ error: 'Cannot revoke current session. Use logout instead.' });
      return;
    }
    
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId
      }
    });
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false }
    });
    
    res.json({ message: 'Session revoked successfully' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

// Revoke all sessions except current
export const revokeOtherSessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const currentSessionId = req.sessionId;
    
    await prisma.session.updateMany({
      where: {
        userId,
        isActive: true,
        id: { not: currentSessionId }
      },
      data: { isActive: false }
    });
    
    res.json({ message: 'All other sessions revoked' });
  } catch (error) {
    console.error('Revoke other sessions error:', error);
    res.status(500).json({ error: 'Failed to revoke other sessions' });
  }
};
