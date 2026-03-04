import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

// Middleware to check admin status
export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: Function): Promise<void> => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};

// Get dashboard statistics
export const getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      onlineUsers,
      totalGroups,
      totalMessages,
      todayMessages,
      newUsersToday,
      activeSessions
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ONLINE' } }),
      prisma.group.count(),
      prisma.message.count(),
      prisma.message.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }),
      prisma.session.count({ where: { isActive: true } })
    ]);

    // Get messages per day for last 7 days
    const messagesPerDay = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM messages
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Get users per day for last 7 days
    const usersPerDay = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    res.json({
      stats: {
        totalUsers,
        onlineUsers,
        totalGroups,
        totalMessages,
        todayMessages,
        newUsersToday,
        activeSessions
      },
      charts: {
        messagesPerDay,
        usersPerDay
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
};

// Get all users (with pagination and filters)
export const getAllUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, search, status, isAdmin: adminFilter } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (status) {
      where.status = status;
    }

    if (adminFilter !== undefined) {
      where.isAdmin = adminFilter === 'true';
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          status: true,
          lastSeen: true,
          isAdmin: true,
          isVerified: true,
          isBanned: true,
          mfaEnabled: true,
          createdAt: true,
          _count: {
            select: {
              messages: true,
              friendsSent: true,
              groupMembers: true,
              sessions: true
            }
          }
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// Get user details (admin view)
export const getUserDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        bio: true,
        status: true,
        lastSeen: true,
        isAdmin: true,
        isVerified: true,
        isBanned: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            messages: true,
            friendsSent: true,
            friendsReceived: true,
            groupMembers: true,
            sessions: true,
            reactions: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get recent sessions
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { lastActive: 'desc' },
      take: 10,
      select: {
        id: true,
        browser: true,
        os: true,
        deviceType: true,
        ipAddress: true,
        country: true,
        city: true,
        isActive: true,
        createdAt: true,
        lastActive: true
      }
    });

    // Get recent messages
    const messages = await prisma.message.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        content: true,
        createdAt: true,
        isRead: true
      }
    });

    res.json({
      user,
      sessions,
      messages
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Failed to get user details' });
  }
};

// Update user (admin)
export const updateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { name, email, isAdmin, isVerified, status, isBanned } = req.body;

    // Prevent removing own admin status or banning self
    if (userId === req.user!.id && (isAdmin === false || isBanned === true)) {
      res.status(403).json({ error: 'Cannot remove your own admin status or ban yourself' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (isAdmin !== undefined) updateData.isAdmin = isAdmin;
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    if (status !== undefined) updateData.status = status;
    if (isBanned !== undefined) updateData.isBanned = isBanned;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        isVerified: true,
        isBanned: true,
        status: true
      }
    });

    // Log admin action
    await prisma.adminLog.create({
      data: {
        adminId: req.user!.id,
        action: 'UPDATE_USER',
        entityType: 'USER',
        entityId: userId,
        newValue: updateData,
        ipAddress: req.ip || 'unknown'
      }
    });

    res.json({
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Delete user (admin)
export const deleteUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    // Prevent self-deletion
    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot delete yourself' });
      return;
    }

    await prisma.user.delete({
      where: { id: userId }
    });

    // Log admin action
    await prisma.adminLog.create({
      data: {
        adminId: req.user!.id,
        action: 'DELETE_USER',
        entityType: 'USER',
        entityId: userId,
        ipAddress: req.ip || 'unknown'
      }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Get all groups (admin)
export const getAllGroups = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, search } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    const [groups, total] = await Promise.all([
      prisma.group.findMany({
        where,
        include: {
          owner: {
            select: { id: true, name: true, email: true }
          },
          _count: {
            select: { members: true, messages: true }
          }
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.group.count({ where })
    ]);

    res.json({
      groups,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get all groups error:', error);
    res.status(500).json({ error: 'Failed to get groups' });
  }
};

// Delete group (admin)
export const deleteGroupAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;

    await prisma.group.delete({
      where: { id: groupId }
    });

    // Log admin action
    await prisma.adminLog.create({
      data: {
        adminId: req.user!.id,
        action: 'DELETE_GROUP',
        entityType: 'GROUP',
        entityId: groupId,
        ipAddress: req.ip || 'unknown'
      }
    });

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
};

// Get admin logs
export const getAdminLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, adminId, action } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (adminId) where.adminId = adminId;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        include: {
          admin: {
            select: { id: true, name: true, email: true }
          }
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.adminLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get admin logs error:', error);
    res.status(500).json({ error: 'Failed to get admin logs' });
  }
};

// Get system settings
export const getSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settings = await prisma.appSettings.findMany();

    const settingsMap = settings.reduce((acc: any, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});

    res.json({ settings: settingsMap });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
};

// Update system settings
export const updateSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { settings } = req.body;

    for (const [key, value] of Object.entries(settings)) {
      await prisma.appSettings.upsert({
        where: { key },
        update: { value: value as any, updatedBy: req.user!.id },
        create: { key, value: value as any, updatedBy: req.user!.id }
      });
    }

    // Log admin action
    await prisma.adminLog.create({
      data: {
        adminId: req.user!.id,
        action: 'UPDATE_SETTINGS',
        entityType: 'SETTINGS',
        newValue: settings,
        ipAddress: req.ip || 'unknown'
      }
    });

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// Broadcast message to all users
export const broadcastMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { title, body, type = 'SYSTEM' } = req.body;

    // Create notifications for all users
    const users = await prisma.user.findMany({
      select: { id: true }
    });

    await prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        type: type as any,
        title,
        body
      }))
    });

    // Log admin action
    await prisma.adminLog.create({
      data: {
        adminId: req.user!.id,
        action: 'BROADCAST',
        entityType: 'NOTIFICATION',
        newValue: { title, body, type },
        ipAddress: req.ip || 'unknown'
      }
    });

    res.json({
      message: 'Broadcast sent successfully',
      recipients: users.length
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
};
