import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../middleware/auth';

/**
 * Get call history for the authenticated user
 */
export const getCallHistory = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { cursor, limit = 30 } = req.query;
        const parsedLimit = parseInt(limit as string);

        const calls = await prisma.callLog.findMany({
            where: {
                OR: [
                    { callerId: userId },
                    { receiverId: userId }
                ]
            },
            take: parsedLimit + 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor as string } } : {}),
            orderBy: {
                startedAt: 'desc'
            },
            include: {
                caller: {
                    select: { id: true, name: true, avatar: true, status: true }
                },
                receiver: {
                    select: { id: true, name: true, avatar: true, status: true }
                }
            }
        });

        let nextCursor: string | null = null;
        if (calls.length > parsedLimit) {
            const nextItem = calls.pop();
            nextCursor = nextItem!.id;
        }

        res.json({
            calls,
            nextCursor
        });
    } catch (error) {
        console.error('Get call history error:', error);
        res.status(500).json({ error: 'Failed to fetch call history' });
    }
};
