import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { io } from '../server';

export const createPoll = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { messageId, question, options, isMultiple, isAnonymous, endsAt } = req.body;

        if (!messageId || !question || !options || !Array.isArray(options)) {
            return res.status(400).json({ error: 'messageId, question and options are required' });
        }

        const poll = await prisma.poll.create({
            data: {
                messageId,
                question,
                isMultiple: isMultiple || false,
                isAnonymous: isAnonymous || false,
                endsAt: endsAt ? new Date(endsAt) : null,
                options: {
                    create: options.map((opt: string, index: number) => ({
                        text: opt,
                        order: index
                    }))
                }
            },
            include: {
                options: true
            }
        });

        res.status(201).json({ poll });
    } catch (error) {
        console.error('Error creating poll:', error);
        res.status(500).json({ error: 'Failed to create poll' });
    }
};

export const votePoll = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { pollId, optionIds } = req.body;
        const userId = req.user!.id;

        if (!pollId || !optionIds || !Array.isArray(optionIds)) {
            return res.status(400).json({ error: 'pollId and optionIds array are required' });
        }

        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
            include: { options: true }
        });

        if (!poll) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        if (poll.endsAt && new Date() > poll.endsAt) {
            return res.status(400).json({ error: 'Poll has ended' });
        }

        if (!poll.isMultiple && optionIds.length > 1) {
            return res.status(400).json({ error: 'This poll does not allow multiple votes' });
        }

        // Identify user's existing votes in this poll
        const existingVotes = await prisma.pollVote.findMany({
            where: {
                userId,
                option: {
                    pollId
                }
            },
            include: {
                option: true
            }
        });

        const existingOptionIds = existingVotes.map(v => v.optionId);

        // Calculate additions and removals
        const toAdd = optionIds.filter(id => !existingOptionIds.includes(id));
        const toRemove = existingOptionIds.filter(id => !optionIds.includes(id));

        // Execute in transaction
        await prisma.$transaction(async (tx) => {
            if (toRemove.length > 0) {
                await tx.pollVote.deleteMany({
                    where: {
                        userId,
                        optionId: { in: toRemove }
                    }
                });
            }

            if (toAdd.length > 0) {
                await tx.pollVote.createMany({
                    data: toAdd.map(optionId => ({
                        userId,
                        optionId
                    }))
                });
            }
        });

        // Fetch updated poll results
        const updatedPoll = await prisma.poll.findUnique({
            where: { id: pollId },
            include: {
                options: {
                    include: {
                        votes: {
                            include: {
                                user: {
                                    select: { id: true, name: true, avatar: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        // We can emit a socket event here if we extract the relevant logic.
        // Assuming we do via messageId:
        io.emit('poll:updated', { poll: updatedPoll });

        res.json({ poll: updatedPoll });
    } catch (error) {
        console.error('Error voting on poll:', error);
        res.status(500).json({ error: 'Failed to vote' });
    }
};

export const getPoll = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;

        const poll = await prisma.poll.findUnique({
            where: { id },
            include: {
                options: {
                    include: {
                        votes: {
                            include: {
                                user: {
                                    select: { id: true, name: true, avatar: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!poll) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        res.json({ poll });
    } catch (error) {
        console.error('Error fetching poll:', error);
        res.status(500).json({ error: 'Failed to fetch poll' });
    }
};
