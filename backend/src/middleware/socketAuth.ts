import { Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';

export const authenticateSocket = async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    const decoded = verifyToken(token);
    
    const session = await prisma.session.findFirst({
      where: {
        token,
        isActive: true,
        expiresAt: { gt: new Date() }
      }
    });
    
    if (!session) {
      return next(new Error('Invalid session'));
    }
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });
    
    if (!user) {
      return next(new Error('User not found'));
    }
    
    socket.data.userId = user.id;
    socket.data.userName = user.name;
    socket.data.sessionId = session.id;
    
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
};
