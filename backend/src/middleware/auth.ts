import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';
import { IUser } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  token?: string;
  sessionId?: string;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = verifyToken(token);

      // Check if session is still active
      const session = await prisma.session.findFirst({
        where: {
          token,
          isActive: true,
          expiresAt: { gt: new Date() }
        }
      });

      if (!session) {
        res.status(401).json({ error: 'Session expired or invalid' });
        return;
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      if (user.isBanned) {
        res.status(403).json({ error: 'Account is banned' });
        return;
      }

      // Update last active
      await prisma.session.update({
        where: { id: session.id },
        data: { lastActive: new Date() }
      });

      req.user = user;
      req.token = token;
      req.sessionId = session.id;

      next();
    } catch (jwtError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = verifyToken(token);
      const session = await prisma.session.findFirst({
        where: {
          token,
          isActive: true,
          expiresAt: { gt: new Date() }
        }
      });

      if (session) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId }
        });
        if (user) {
          req.user = user;
          req.token = token;
          req.sessionId = session.id;
        }
      }
    } catch {
      // Ignore token errors for optional auth
    }

    next();
  } catch (error) {
    next();
  }
};
