import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

// Create a new group
export const createGroup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, description, isPrivate, memberIds } = req.body;
    const ownerId = req.user!.id;
    
    // Generate invite code for private groups
    const inviteCode = isPrivate ? crypto.randomBytes(8).toString('hex') : null;
    
    const group = await prisma.group.create({
      data: {
        name,
        description,
        ownerId,
        isPrivate: isPrivate || false,
        inviteCode,
        members: {
          create: [
            { userId: ownerId, role: 'OWNER' },
            ...(memberIds?.filter((id: string) => id !== ownerId).map((id: string) => ({
              userId: id,
              role: 'MEMBER' as const
            })) || [])
          ]
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true }
            }
          }
        },
        owner: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    // Create notifications for invited members
    if (memberIds?.length > 0) {
      await prisma.notification.createMany({
        data: memberIds
          .filter((id: string) => id !== ownerId)
          .map((userId: string) => ({
            userId,
            type: 'GROUP_INVITE',
            title: 'New Group Invitation',
            body: `You were added to ${name}`,
            triggeredById: ownerId
          }))
      });
    }
    
    res.status(201).json({
      message: 'Group created successfully',
      group
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

// Get all groups for user
export const getMyGroups = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: { userId }
        }
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true }
            }
          },
          take: 5
        },
        _count: {
          select: { members: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({ groups });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to get groups' });
  }
};

// Get group by ID
export const getGroupById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    
    const group = await prisma.group.findFirst({
      where: {
        id: groupId,
        members: {
          some: { userId }
        }
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true, status: true, lastSeen: true }
            }
          },
          orderBy: { role: 'asc' }
        },
        _count: {
          select: { members: true }
        }
      }
    });
    
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    
    // Get unread count for this group
    const memberData = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      },
      select: { lastReadAt: true }
    });
    
    const unreadCount = await prisma.groupMessage.count({
      where: {
        groupId,
        createdAt: { gt: memberData?.lastReadAt || new Date(0) },
        senderId: { not: userId }
      }
    });
    
    res.json({ 
      group: {
        ...group,
        unreadCount
      }
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to get group' });
  }
};

// Update group
export const updateGroup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const { name, description, avatar } = req.body;
    const userId = req.user!.id;
    
    // Check if user is owner or admin
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });
    
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    
    const group = await prisma.group.update({
      where: { id: groupId },
      data: { name, description, avatar },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, avatar: true } }
          }
        }
      }
    });
    
    res.json({
      message: 'Group updated successfully',
      group
    });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
};

// Delete group
export const deleteGroup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });
    
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    
    if (group.ownerId !== userId) {
      res.status(403).json({ error: 'Only owner can delete group' });
      return;
    }
    
    await prisma.group.delete({
      where: { id: groupId }
    });
    
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
};

// Add member to group
export const addMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const { userId: memberId } = req.body;
    const userId = req.user!.id;
    
    // Check if user is owner or admin
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });
    
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    
    // Check if already member
    const existing = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: memberId }
      }
    });
    
    if (existing) {
      res.status(400).json({ error: 'User is already a member' });
      return;
    }
    
    await prisma.groupMember.create({
      data: {
        groupId,
        userId: memberId,
        role: 'MEMBER'
      }
    });
    
    // Create notification
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true }
    });
    
    await prisma.notification.create({
      data: {
        userId: memberId,
        type: 'GROUP_INVITE',
        title: 'Added to Group',
        body: `You were added to ${group?.name}`,
        triggeredById: userId
      }
    });
    
    res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

// Join group with invite code
export const joinGroup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user!.id;
    
    const group = await prisma.group.findUnique({
      where: { inviteCode: inviteCode as string }
    });
    
    if (!group) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }
    
    // Check if already member
    const existing = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: group.id, userId }
      }
    });
    
    if (existing) {
      res.status(400).json({ error: 'Already a member' });
      return;
    }
    
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId,
        role: 'MEMBER'
      }
    });
    
    res.json({ 
      message: 'Joined group successfully',
      groupId: group.id
    });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ error: 'Failed to join group' });
  }
};

// Remove member from group
export const removeMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId, userId: memberId } = req.params;
    const userId = req.user!.id;
    
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });
    
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    
    // Allow self-removal or owner/admin removal
    if (memberId !== userId) {
      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId, userId }
        }
      });
      
      if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
        res.status(403).json({ error: 'Not authorized' });
        return;
      }
      
      // Cannot remove owner
      if (memberId === group.ownerId) {
        res.status(403).json({ error: 'Cannot remove owner' });
        return;
      }
    }
    
    await prisma.groupMember.deleteMany({
      where: {
        groupId,
        userId: memberId
      }
    });
    
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

// Update member role
export const updateMemberRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId, userId: memberId } = req.params;
    const { role } = req.body;
    const userId = req.user!.id;
    
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });
    
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    
    // Only owner can change roles
    if (group.ownerId !== userId) {
      res.status(403).json({ error: 'Only owner can change roles' });
      return;
    }
    
    // Cannot change owner's role
    if (memberId === group.ownerId) {
      res.status(400).json({ error: 'Cannot change owner role' });
      return;
    }
    
    await prisma.groupMember.update({
      where: {
        groupId_userId: { groupId, userId: memberId }
      },
      data: { role }
    });
    
    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
};

// Leave group
export const leaveGroup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });
    
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    
    // Owner cannot leave, must delete or transfer ownership
    if (group.ownerId === userId) {
      res.status(400).json({ error: 'Owner must transfer ownership or delete group' });
      return;
    }
    
    await prisma.groupMember.deleteMany({
      where: {
        groupId,
        userId
      }
    });
    
    res.json({ message: 'Left group successfully' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
};

// Regenerate invite code
export const regenerateInviteCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });
    
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    
    if (group.ownerId !== userId) {
      res.status(403).json({ error: 'Only owner can regenerate invite code' });
      return;
    }
    
    const newInviteCode = crypto.randomBytes(8).toString('hex');
    
    await prisma.group.update({
      where: { id: groupId },
      data: { inviteCode: newInviteCode }
    });
    
    res.json({ 
      message: 'Invite code regenerated',
      inviteCode: newInviteCode
    });
  } catch (error) {
    console.error('Regenerate invite code error:', error);
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
};
