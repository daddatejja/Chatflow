import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

// Get messages between current user and another user
export const getMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.id;
    const { page = 1, limit = 50, cursor } = req.query;

    const skip = cursor ? 1 : (Number(page) - 1) * Number(limit);

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId }
        ],
        isDeleted: false
      },
      include: {
        reactions: {
          include: {
            user: {
              select: { id: true, name: true }
            }
          }
        },
        threadReplies: {
          include: {
            sender: {
              select: { id: true, name: true, avatar: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit) + (!cursor && page === 1 ? 0 : 1), // Wait, simpler to always take limit+1 to check hasMore, or keep it mixed.
      // Easiest is to always take limit+1
      ...(cursor ? { cursor: { id: String(cursor) } } : {}),
      skip: cursor ? 1 : skip, // Override take and skip correctly
    });

    let hasMore = false;
    if (cursor || page !== 1) { // Wait, if I change the logic it might break existing fetch. 
      // Let's just keep limit logic simple. If they query cursor, use cursor.
    }

    // Instead of completely changing logic, let's just use `take: Number(limit) + 1`
    // and if length > limit, pop and hasMore = true.
    const fetchedMessages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId }
        ],
        isDeleted: false
      },
      include: {
        reactions: {
          include: {
            user: { select: { id: true, name: true } }
          }
        },
        threadReplies: {
          include: {
            sender: { select: { id: true, name: true, avatar: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit) + 1,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : { skip: (Number(page) - 1) * Number(limit) })
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        senderId: userId,
        receiverId: currentUserId,
        isRead: false
      },
      data: { isRead: true, readAt: new Date() }
    });

    const more = fetchedMessages.length > Number(limit);
    if (more) fetchedMessages.pop();

    res.json({
      messages: fetchedMessages.reverse(),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        hasMore: more,
        cursor: fetchedMessages.length > 0 ? fetchedMessages[0].id : null // after reverse, oldest goes to pos 0.
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// Send a message
export const sendMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { receiverId, type, content, duration, replyToId } = req.body;
    const senderId = req.user!.id;

    // Check for block
    const block = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId }
        ]
      }
    });

    if (block) {
      res.status(403).json({ error: 'Cannot send messages to this user' });
      return;
    }

    const message = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        type: type || 'TEXT',
        content,
        duration,
        replyToId,
        isRead: false
      },
      include: {
        reactions: true,
        threadReplies: true
      }
    });

    // Create notification for receiver
    await prisma.notification.create({
      data: {
        userId: receiverId,
        type: 'NEW_MESSAGE',
        title: 'New Message',
        body: `${req.user!.name} sent you a message`,
        data: { messageId: message.id },
        triggeredById: senderId
      }
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Edit a message
export const editMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user!.id;

    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        senderId: userId,
        isDeleted: false
      }
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        content,
        isEdited: true,
        editedAt: new Date()
      }
    });

    res.json({ message: updated });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
};

// Delete a message (soft delete)
export const deleteMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const userId = req.user!.id;

    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        senderId: userId
      }
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true }
    });

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// Add reaction to message
export const addReaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user!.id;

    const reaction = await prisma.messageReaction.create({
      data: {
        messageId,
        userId,
        emoji
      }
    });

    res.status(201).json({ reaction });
  } catch (err: unknown) {
    const error = err as any;
    if (error?.code === 'P2002') {
      res.status(400).json({ error: 'Reaction already exists' });
      return;
    }
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
};

// Remove reaction from message
export const removeReaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user!.id;

    await prisma.messageReaction.deleteMany({
      where: {
        messageId,
        userId,
        emoji
      }
    });

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
};

// Add thread reply
export const addThreadReply = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const senderId = req.user!.id;

    const reply = await prisma.threadReply.create({
      data: {
        messageId,
        senderId,
        content
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });

    res.status(201).json({ reply });
  } catch (error) {
    console.error('Add thread reply error:', error);
    res.status(500).json({ error: 'Failed to add reply' });
  }
};

// Get unread message counts
export const getUnreadCounts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.id;

    const unreadMessages = await prisma.message.groupBy({
      by: ['senderId'],
      where: {
        receiverId: currentUserId,
        isRead: false,
        isDeleted: false
      },
      _count: {
        senderId: true
      }
    });

    const counts: Record<string, number> = {};
    unreadMessages.forEach(item => {
      counts[item.senderId] = item._count.senderId;
    });

    // Get unread group messages
    const userGroups = await prisma.groupMember.findMany({
      where: { userId: currentUserId },
      select: { groupId: true, lastReadAt: true }
    });

    for (const member of userGroups) {
      const unreadGroupCount = await prisma.groupMessage.count({
        where: {
          groupId: member.groupId,
          createdAt: { gt: member.lastReadAt || new Date(0) },
          senderId: { not: currentUserId }
        }
      });

      if (unreadGroupCount > 0) {
        counts[`group_${member.groupId}`] = unreadGroupCount;
      }
    }

    res.json({ counts });
  } catch (error) {
    console.error('Get unread counts error:', error);
    res.status(500).json({ error: 'Failed to get unread counts' });
  }
};

// Mark messages as read
export const markAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.id;

    await prisma.message.updateMany({
      where: {
        senderId: userId,
        receiverId: currentUserId,
        isRead: false
      },
      data: { isRead: true, readAt: new Date() }
    });

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

// ==================== GROUP MESSAGES ====================

// Get group messages
export const getGroupMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const { page = 1, limit = 50, cursor } = req.query;

    // Check if user is member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const fetchedMessages = await prisma.groupMessage.findMany({
      where: {
        groupId,
        isDeleted: false
      },
      include: {
        reactions: {
          include: {
            user: {
              select: { id: true, name: true }
            }
          }
        },
        readBy: {
          include: {
            user: {
              select: { id: true, name: true }
            }
          }
        },
        sender: {
          select: { id: true, name: true, avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit) + 1,
      ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : { skip: (Number(page) - 1) * Number(limit) })
    });

    // Update last read
    await prisma.groupMember.update({
      where: {
        groupId_userId: { groupId, userId }
      },
      data: { lastReadAt: new Date() }
    });

    const more = fetchedMessages.length > Number(limit);
    if (more) fetchedMessages.pop();

    res.json({
      messages: fetchedMessages.reverse(),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        hasMore: more,
        cursor: fetchedMessages.length > 0 ? fetchedMessages[0].id : null
      }
    });
  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ error: 'Failed to get group messages' });
  }
};

// Send group message
export const sendGroupMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const { type, content, duration } = req.body;
    const senderId = req.user!.id;

    // Check if user is member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: senderId }
      }
    });

    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const message = await prisma.groupMessage.create({
      data: {
        groupId,
        senderId,
        type: type || 'TEXT',
        content,
        duration
      },
      include: {
        reactions: true
      }
    });

    // Create notifications for other members
    const otherMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        userId: { not: senderId }
      },
      select: { userId: true }
    });

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true }
    });

    await prisma.notification.createMany({
      data: otherMembers.map(m => ({
        userId: m.userId,
        type: 'GROUP_MESSAGE',
        title: `New message in ${group?.name}`,
        body: `${req.user!.name}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
        data: { groupId, messageId: message.id },
        triggeredById: senderId
      }))
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send group message error:', error);
    res.status(500).json({ error: 'Failed to send group message' });
  }
};

// Search messages
export const searchMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { q, userId } = req.query;
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const currentUserId = req.user!.id;

    // Search direct messages
    const directMessages = await prisma.message.findMany({
      where: {
        AND: [
          {
            OR: [
              { senderId: currentUserId },
              { receiverId: currentUserId }
            ]
          },
          { content: { contains: q, mode: 'insensitive' } },
          { type: 'TEXT' },
          userId ? {
            OR: [
              { senderId: userId as string },
              { receiverId: userId as string }
            ]
          } : {}
        ]
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Search group messages (if no specific userId provided, or we just mix them)
    // We only search in groups the user is a member of
    let groupMessages: any[] = [];
    if (!userId) {
      const userGroups = await prisma.groupMember.findMany({
        where: { userId: currentUserId },
        select: { groupId: true }
      });

      const groupIds = userGroups.map(g => g.groupId);

      groupMessages = await prisma.groupMessage.findMany({
        where: {
          groupId: { in: groupIds },
          content: { contains: q, mode: 'insensitive' },
          type: 'TEXT'
        },
        include: {
          sender: { select: { id: true, name: true, avatar: true } },
          group: { select: { id: true, name: true, avatar: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
    }

    // Combine and sort
    const allResults = [...directMessages, ...groupMessages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({ messages: allResults.slice(0, 50) });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
};


// Add reaction to group message
export const addGroupReaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId, messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user!.id;

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const reaction = await prisma.groupMessageReaction.create({
      data: {
        messageId,
        userId,
        emoji
      }
    });

    res.status(201).json({ reaction });
  } catch (err: unknown) {
    const error = err as any;
    if (error?.code === 'P2002') {
      res.status(400).json({ error: 'Reaction already exists' });
      return;
    }
    console.error('Add group reaction error:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
};
