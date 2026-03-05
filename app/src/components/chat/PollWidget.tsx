import { useState, useEffect } from 'react';
import { pollAPI } from '@/services/api';
import { useChat } from '@/context/ChatContext';
import { FileBarChart2, CheckCircle2 } from 'lucide-react';
import { socketService } from '@/services/socket';

interface PollWidgetProps {
    messageId: string;
    isOwn?: boolean;
}

export function PollWidget({ messageId, isOwn = false }: PollWidgetProps) {
    const [poll, setPoll] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { currentUser } = useChat();

    useEffect(() => {
        const fetchPoll = async () => {
            try {
                const res = await pollAPI.getPollByMessageId(messageId);
                setPoll(res.data.poll);
            } catch (error) {
                console.error('Error fetching poll:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPoll();

        const handlePollUpdated = (data: { poll: any }) => {
            if (data.poll.messageId === messageId || data.poll.id === poll?.id) {
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
    }, [messageId, poll?.id]);

    if (loading) return <div className={`p-4 text-sm animate-pulse ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>Loading poll...</div>;
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
        <div className={`border rounded-xl p-4 my-2 w-full min-w-[280px] max-w-sm transition-colors ${isOwn ? 'bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground' : 'bg-card/50 border-border text-foreground'}`}>
            <div className="flex items-start gap-3 mb-4">
                <div className={`p-2 rounded-lg ${isOwn ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
                    <FileBarChart2 className={`w-5 h-5 ${isOwn ? 'text-primary-foreground' : 'text-primary'}`} />
                </div>
                <div>
                    <h4 className="font-semibold text-sm leading-none mb-1.5">{poll.question}</h4>
                    <p className={`text-xs flex gap-2 ${isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        <span>{poll.isMultiple ? 'Multiple choices allowed' : 'Select one option'}</span>
                        {poll.isAnonymous && <span>• Anonymous voting</span>}
                        {isEnded && <span className={`${isOwn ? 'text-red-200' : 'text-red-500'} font-medium`}>• Ended</span>}
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
                                    ? (isOwn ? 'border-primary-foreground bg-primary-foreground/20' : 'border-primary bg-primary/5')
                                    : (isOwn ? 'border-primary-foreground/30 bg-primary-foreground/5 hover:bg-primary-foreground/10 hover:border-primary-foreground/50' : 'border-border/50 bg-background/50 hover:bg-accent/50 hover:border-border')
                                    } ${isEnded ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                            >
                                <div className="flex justify-between items-center mb-1.5 relative z-10">
                                    <span className={`text-sm font-medium ${isSelected ? (isOwn ? 'text-primary-foreground' : 'text-primary') : ''}`}>
                                        {option.text}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {isSelected && <CheckCircle2 className={`w-4 h-4 ${isOwn ? 'text-primary-foreground' : 'text-primary'}`} />}
                                        <span className={`text-xs font-medium ${isOwn ? 'text-primary-foreground/90' : ''}`}>{percentage}%</span>
                                    </div>
                                </div>

                                <div className={`h-1.5 w-full rounded-full overflow-hidden ${isOwn ? 'bg-primary-foreground/20' : 'bg-secondary/50'}`}>
                                    <div
                                        className={`h-full transition-all duration-500 rounded-full ${isSelected ? (isOwn ? 'bg-primary-foreground' : 'bg-primary') : (isOwn ? 'bg-primary-foreground/40' : 'bg-muted-foreground/30')}`}
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className={`mt-4 text-xs text-center font-medium ${isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            </div>
        </div>
    );
}
