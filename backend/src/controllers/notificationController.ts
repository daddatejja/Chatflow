import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

// Get user's notifications
export const getNotifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { page = 1, limit = 20, unreadOnly } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { userId };
    if (unreadOnly === 'true') {
      where.isRead = false;
    }
    
    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          triggeredBy: {
            select: { id: true, name: true, avatar: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } })
    ]);
    
    res.json({
      notifications,
      unreadCount,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
};

// Mark notification as read
export const markNotificationRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { notificationId } = req.params;
    const userId = req.user!.id;
    
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId
      },
      data: { isRead: true }
    });
    
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

// Mark all notifications as read
export const markAllNotificationsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: { isRead: true }
    });
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
};

// Delete notification
export const deleteNotification = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { notificationId } = req.params;
    const userId = req.user!.id;
    
    await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId
      }
    });
    
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};
