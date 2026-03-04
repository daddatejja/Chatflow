import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { generateAIAvatar, generateRandomAvatar } from '../utils/avatar';

// Get current user profile
export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        bio: true,
        status: true,
        lastSeen: true,
        mfaEnabled: true,
        isAdmin: true,
        createdAt: true,
      }
    });

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// Update user profile
export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, bio } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        name: name?.trim(),
        bio: bio?.trim(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        bio: true,
        mfaEnabled: true,
      }
    });

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Update avatar (upload)
export const updateAvatar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image uploaded' });
      return;
    }

    // Convert image to base64
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const avatar = `data:${mimeType};base64,${base64}`;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatar },
      select: { avatar: true }
    });

    res.json({
      message: 'Avatar updated successfully',
      avatar: user.avatar
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ error: 'Failed to update avatar' });
  }
};

// Generate AI avatar
export const generateAvatar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { prompt } = req.body;
    const user = req.user!;

    const avatarPrompt = prompt || `professional portrait of ${user.name}, friendly face, solid color background, high quality avatar`;

    const avatar = await generateAIAvatar(avatarPrompt);

    if (!avatar) {
      res.status(500).json({ error: 'Failed to generate avatar' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { avatar }
    });

    res.json({
      message: 'Avatar generated successfully',
      avatar
    });
  } catch (error) {
    console.error('Generate avatar error:', error);
    res.status(500).json({ error: 'Failed to generate avatar' });
  }
};

// Generate random avatar
export const randomAvatar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const avatar = generateRandomAvatar();

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatar }
    });

    res.json({
      message: 'Random avatar generated',
      avatar
    });
  } catch (error) {
    console.error('Random avatar error:', error);
    res.status(500).json({ error: 'Failed to generate random avatar' });
  }
};

// Change password
export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user?.password) {
      res.status(400).json({ error: 'OAuth users cannot change password' });
      return;
    }

    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// ==================== FRIENDS SYSTEM ====================

// Get all friends
export const getFriends = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const friends = await prisma.friend.findMany({
      where: {
        OR: [
          { senderId: userId, status: 'ACCEPTED' },
          { receiverId: userId, status: 'ACCEPTED' }
        ]
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true, status: true, lastSeen: true }
        },
        receiver: {
          select: { id: true, name: true, avatar: true, status: true, lastSeen: true }
        }
      }
    });

    const formattedFriends = friends.map(f => ({
      id: f.senderId === userId ? f.receiver.id : f.sender.id,
      name: f.senderId === userId ? f.receiver.name : f.sender.name,
      avatar: f.senderId === userId ? f.receiver.avatar : f.sender.avatar,
      status: f.senderId === userId ? f.receiver.status : f.sender.status,
      lastSeen: f.senderId === userId ? f.receiver.lastSeen : f.sender.lastSeen,
      friendSince: f.createdAt
    }));

    // Also include users who we have chatted with previously
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      select: {
        senderId: true,
        receiverId: true
      },
      distinct: ['senderId', 'receiverId']
    });

    const contactIds = new Set<string>();
    messages.forEach(m => {
      if (m.senderId !== userId) contactIds.add(m.senderId);
      if (m.receiverId !== userId) contactIds.add(m.receiverId);
    });

    formattedFriends.forEach(f => contactIds.delete(f.id));

    let addedContacts: Array<{
      id: string;
      name: string;
      avatar: string | null;
      status: string;
      lastSeen: Date;
      friendSince: Date | null;
    }> = [];
    if (contactIds.size > 0) {
      const additionalUsers = await prisma.user.findMany({
        where: { id: { in: Array.from(contactIds) } },
        select: { id: true, name: true, avatar: true, status: true, lastSeen: true }
      });
      addedContacts = additionalUsers.map(u => ({
        ...u,
        friendSince: null
      }));
    }

    res.json({ friends: [...formattedFriends, ...addedContacts] });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
};

// Get pending friend requests
export const getFriendRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const requests = await prisma.friend.findMany({
      where: {
        receiverId: userId,
        status: 'PENDING'
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });

    res.json({
      requests: requests.map(r => ({
        id: r.id,
        sender: r.sender,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
};

// Send friend request
export const sendFriendRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    const senderId = req.user!.id;

    if (userId === senderId) {
      res.status(400).json({ error: 'Cannot send friend request to yourself' });
      return;
    }

    // Check if already friends or pending
    const existing = await prisma.friend.findFirst({
      where: {
        OR: [
          { senderId, receiverId: userId },
          { senderId: userId, receiverId: senderId }
        ]
      }
    });

    if (existing) {
      res.status(400).json({ error: 'Friend request already exists' });
      return;
    }

    const friendRequest = await prisma.friend.create({
      data: {
        senderId,
        receiverId: userId,
        status: 'PENDING'
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } }
      }
    });

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: 'FRIEND_REQUEST',
        title: 'New Friend Request',
        body: `${req.user!.name} sent you a friend request`,
        triggeredById: senderId
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('notification:receive', notification);
    }

    res.json({
      message: 'Friend request sent',
      request: friendRequest
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
};

// Accept friend request
export const acceptFriendRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    const userId = req.user!.id;

    const request = await prisma.friend.findFirst({
      where: {
        id: requestId,
        receiverId: userId,
        status: 'PENDING'
      }
    });

    if (!request) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    await prisma.friend.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' }
    });

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        userId: request.senderId,
        type: 'FRIEND_ACCEPTED',
        title: 'Friend Request Accepted',
        body: `${req.user!.name} accepted your friend request`,
        triggeredById: userId
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${request.senderId}`).emit('notification:receive', notification);
    }

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
};

// Decline friend request
export const declineFriendRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    const userId = req.user!.id;

    await prisma.friend.updateMany({
      where: {
        id: requestId,
        receiverId: userId,
        status: 'PENDING'
      },
      data: { status: 'DECLINED' }
    });

    res.json({ message: 'Friend request declined' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
};

// Remove friend
export const removeFriend = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { friendId } = req.params;
    const userId = req.user!.id;

    await prisma.friend.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId, status: 'ACCEPTED' },
          { senderId: friendId, receiverId: userId, status: 'ACCEPTED' }
        ]
      }
    });

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
};

// Search users
export const searchUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { query } = req.query;
    const userId = req.user!.id;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query required' });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } }
            ]
          },
          { id: { not: userId } }
        ]
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        status: true,
        lastSeen: true
      },
      take: 20
    });

    // Get friend status for each user
    const usersWithStatus = await Promise.all(
      users.map(async (u) => {
        const friendRelation = await prisma.friend.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: u.id },
              { senderId: u.id, receiverId: userId }
            ]
          }
        });

        return {
          ...u,
          friendStatus: friendRelation?.status || null
        };
      })
    );

    res.json({ users: usersWithStatus });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
};

// Get user by ID (public profile)
export const getUserById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatar: true,
        bio: true,
        status: true,
        lastSeen: true,
        createdAt: true,
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if they are friends
    const friendRelation = await prisma.friend.findFirst({
      where: {
        OR: [
          { senderId: req.user!.id, receiverId: userId, status: 'ACCEPTED' },
          { senderId: userId, receiverId: req.user!.id, status: 'ACCEPTED' }
        ]
      }
    });

    res.json({
      user: {
        ...user,
        isFriend: !!friendRelation
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Block user
export const blockUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    const currentUserId = req.user!.id;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    if (userId === currentUserId) {
      res.status(400).json({ error: 'Cannot block yourself' });
      return;
    }

    // Check if already blocked
    const existingBlock = await prisma.blockedUser.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: currentUserId,
          blockedId: userId
        }
      }
    });

    if (existingBlock) {
      res.status(400).json({ error: 'User is already blocked' });
      return;
    }

    // Remove friendship if exists
    await prisma.friend.deleteMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId }
        ]
      }
    });

    await prisma.blockedUser.create({
      data: {
        blockerId: currentUserId,
        blockedId: userId
      }
    });

    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
};

// Unblock user
export const unblockUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.id;

    const block = await prisma.blockedUser.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: currentUserId,
          blockedId: userId
        }
      }
    });

    if (!block) {
      res.status(404).json({ error: 'Block record not found' });
      return;
    }

    await prisma.blockedUser.delete({
      where: {
        blockerId_blockedId: {
          blockerId: currentUserId,
          blockedId: userId
        }
      }
    });

    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
};

// Get blocked users list
export const getBlockedUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;

    const blocked = await prisma.blockedUser.findMany({
      where: { blockerId: currentUserId },
      include: {
        blocked: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Format response
    const formattedBlocked = blocked.map(b => ({
      id: b.blocked.id,
      name: b.blocked.name,
      email: b.blocked.email,
      avatar: b.blocked.avatar,
      status: b.blocked.status,
      blockedAt: b.createdAt
    }));

    res.json({ blockedUsers: formattedBlocked });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to get blocked users' });
  }
};
