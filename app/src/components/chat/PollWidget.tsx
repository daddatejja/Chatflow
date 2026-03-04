import { useState, useEffect } from 'react';
import { pollAPI } from '@/services/api';
import { useChat } from '@/context/ChatContext';
import { FileBarChart2, CheckCircle2 } from 'lucide-react';
import { socketService } from '@/services/socket';

interface PollWidgetProps {
    pollId: string;
}

export function PollWidget({ pollId }: PollWidgetProps) {
    const [poll, setPoll] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { currentUser } = useChat();

    useEffect(() => {
        const fetchPoll = async () => {
            try {
                const res = await pollAPI.getPoll(pollId);
                setPoll(res.data.poll);
            } catch (error) {
                console.error('Error fetching poll:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPoll();

        const handlePollUpdated = (data: { poll: any }) => {
            if (data.poll.id === pollId) {
                setPoll(data.poll);
            }
        };

        const socket = socketService.getSocket();
        if (socket) {
            socket.on('poll:updated', handlePollUpdated);
        }

        return () => {
            if (socket) {
                socket.off('poll:updated', handlePollUpdated);
            }
        };
    }, [pollId]);

    if (loading) return <div className="p-4 text-sm text-muted-foreground animate-pulse">Loading poll...</div>;
    if (!poll) return null;

    const totalVotes = poll.options.reduce((sum: number, opt: any) => sum + opt.votes.length, 0);

    const getMySelectedOptions = () => {
        const selectedIds: string[] = [];
        poll.options.forEach((opt: any) => {
            if (opt.votes.some((v: any) => v.userId === currentUser?.id)) {
                selectedIds.push(opt.id);
            }
        });
        return selectedIds;
    };

    const handleVote = async (optionId: string) => {
        if (poll.endsAt && new Date(poll.endsAt) < new Date()) return;

        try {
            const mySelected = getMySelectedOptions();
            let newSelected = [...mySelected];

            if (poll.isMultiple) {
                if (newSelected.includes(optionId)) {
                    newSelected = newSelected.filter(id => id !== optionId);
                } else {
                    newSelected.push(optionId);
                }
            } else {
                if (newSelected.includes(optionId)) {
                    newSelected = []; // unvote
                } else {
                    newSelected = [optionId]; // switch vote
                }
            }

            // Optimistic update could go here, but let's just make the API call and let socket/fetch handle it
            await pollAPI.votePoll(poll.id, newSelected);
        } catch (error) {
            console.error('Error voting:', error);
        }
    };

    const isEnded = poll.endsAt && new Date(poll.endsAt) < new Date();

    return (
        <div className="bg-card/50 border border-border rounded-xl p-4 my-2 max-w-sm">
            <div className="flex items-start gap-3 mb-4">
                <div className="bg-primary/10 p-2 rounded-lg">
                    <FileBarChart2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <h4 className="font-semibold text-sm leading-none mb-1.5">{poll.question}</h4>
                    <p className="text-xs text-muted-foreground flex gap-2">
                        <span>{poll.isMultiple ? 'Multiple choices allowed' : 'Select one option'}</span>
                        {poll.isAnonymous && <span>• Anonymous voting</span>}
                        {isEnded && <span className="text-red-500 font-medium">• Ended</span>}
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                {poll.options.sort((a: any, b: any) => a.order - b.order).map((option: any) => {
                    const voteCount = option.votes.length;
                    const percentage = totalVotes === 0 ? 0 : Math.round((voteCount / totalVotes) * 100);
                    const isSelected = option.votes.some((v: any) => v.userId === currentUser?.id);

                    return (
                        <div key={option.id} className="relative">
                            <button
                                onClick={() => handleVote(option.id)}
                                disabled={isEnded}
                                className={`w-full text-left p-2.5 rounded-lg border transition-all duration-200 ${isSelected
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border/50 bg-background/50 hover:bg-accent/50 hover:border-border'
                                    } ${isEnded ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                            >
                                <div className="flex justify-between items-center mb-1.5 relative z-10">
                                    <span className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                                        {option.text}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                                        <span className="text-xs font-medium">{percentage}%</span>
                                    </div>
                                </div>

                                <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 rounded-full ${isSelected ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 text-xs text-muted-foreground text-center font-medium">
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            </div>
        </div>
    );
}
