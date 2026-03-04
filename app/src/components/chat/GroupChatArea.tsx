import { useState, useRef, useEffect } from 'react';
import { useGroupChat } from '@/context/GroupChatContext';
import { useChat } from '@/context/ChatContext';
import { MessageInput } from '@/components/chat/MessageInput';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Hash, Info, MoreVertical, Reply } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import type { MessageType, GroupMessage } from '@/types';
import { GroupInfoPanel } from './GroupInfoPanel';
import { PollWidget } from './PollWidget';

export function GroupChatArea() {
    const { currentUser: user } = useChat();
    const { selectedGroup, groupMessages, sendGroupMessage, sendGroupMediaMessage, sendGroupFileMessage, groupTyping, hasMore, isLoadingMore, loadEarlierMessages } = useGroupChat();
    const [showInfo, setShowInfo] = useState(false);
    const observerTarget = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [prevMessageCount, setPrevMessageCount] = useState(0);
    const [replyToMessage, setReplyToMessage] = useState<GroupMessage | null>(null);

    // Scroll to bottom on first load or new messages, but not on loading older messages
    useEffect(() => {
        if (groupMessages.length > prevMessageCount && !isLoadingMore && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        setPrevMessageCount(groupMessages.length);
    }, [groupMessages.length, isLoadingMore, prevMessageCount]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
                    loadEarlierMessages();
                }
            },
            { threshold: 0.1 }
        );
        if (observerTarget.current) observer.observe(observerTarget.current);
        return () => observer.disconnect();
    }, [hasMore, isLoadingMore, loadEarlierMessages]);

    if (!selectedGroup) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-muted/10 text-muted-foreground">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                    <Hash className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-2">Group Chat</h2>
                <p>Select a group from the sidebar to start messaging</p>
            </div>
        );
    }

    const typingUsers = Object.values(groupTyping)
        .filter(t => t.userId !== user?.id) // should be filtered by groupId, but our context keys are 'groupId:userId'
        .map(t => t.name);

    const typingText = typingUsers.length === 0 ? null
        : typingUsers.length === 1 ? `${typingUsers[0]} is typing...`
            : typingUsers.length <= 3 ? `${typingUsers.join(', ')} are typing...`
                : `${typingUsers.length} people are typing...`;

    return (
        <div className="h-full flex bg-background relative overflow-hidden">
            {/* Main chat column */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <Avatar className="w-10 h-10">
                            <AvatarImage src={selectedGroup.avatar} />
                            <AvatarFallback className="bg-primary/20 text-primary">
                                <Hash className="w-5 h-5" />
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h2 className="font-semibold text-foreground leading-tight">{selectedGroup.name}</h2>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>{selectedGroup.members?.length || 0} members</span>
                                {typingText && (
                                    <span className="text-primary italic animate-pulse">{typingText}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowInfo(!showInfo)}>
                            <Info className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9">
                            <MoreVertical className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
                    {hasMore && (
                        <div ref={observerTarget} className="h-8 flex items-center justify-center">
                            {isLoadingMore && <span className="text-xs text-muted-foreground">Loading older messages...</span>}
                        </div>
                    )}
                    {groupMessages.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground flex-col">
                            <div className="w-16 h-16 rounded-full bg-muted/50 flex flex-col items-center justify-center mb-4">
                                <Hash className="w-8 h-8 opacity-50" />
                            </div>
                            <p>Be the first to send a message in {selectedGroup.name}!</p>
                        </div>
                    ) : (
                        groupMessages.map((msg, index) => {
                            const isMine = msg.senderId === user?.id;
                            const showAvatar = !isMine && (index === 0 || groupMessages[index - 1].senderId !== msg.senderId);

                            return (
                                <div key={msg.id} className={`flex gap-3 max-w-[80%] ${isMine ? 'ml-auto flex-row-reverse' : ''}`}>
                                    {!isMine && (
                                        <div className="w-8 shrink-0">
                                            {showAvatar && (
                                                <Avatar className="w-8 h-8 select-none">
                                                    <AvatarImage src={msg.sender?.avatar} />
                                                    <AvatarFallback className="text-[10px]">{msg.sender?.name?.[0]}</AvatarFallback>
                                                </Avatar>
                                            )}
                                        </div>
                                    )}

                                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                        {showAvatar && !isMine && (
                                            <span className="text-xs text-muted-foreground mb-1 ml-1">{msg.sender?.name}</span>
                                        )}

                                        <div className="relative group/msg flex flex-col">
                                            {/* Action Buttons (Reply) */}
                                            <div className={`absolute top-0 flex gap-1 items-center opacity-0 group-hover/msg:opacity-100 transition-opacity ${isMine ? 'right-full mr-2' : 'left-full ml-2'}`}>
                                                <button
                                                    onClick={() => setReplyToMessage(msg)}
                                                    className="p-1.5 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground bg-background/50 backdrop-blur-sm"
                                                    title="Reply"
                                                >
                                                    <Reply className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            <div className={`rounded-2xl px-4 py-2 text-sm shadow-sm flex flex-col ${isMine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                                                {msg.replyToId && groupMessages.find(m => m.id === msg.replyToId) && (() => {
                                                    const repliedMsg = groupMessages.find(m => m.id === msg.replyToId)!;
                                                    return (
                                                        <div
                                                            className={`mb-2 px-3 py-1.5 rounded-lg text-sm border-l-4 ${isMine ? 'bg-primary-foreground/10 border-primary-foreground/50' : 'bg-primary/5 border-primary/50'} cursor-pointer hover:opacity-80 transition-opacity`}
                                                            onClick={() => {/* optional scrolling handling */ }}
                                                        >
                                                            <div className={`font-semibold text-xs mb-0.5 ${isMine ? 'text-primary-foreground text-opacity-90' : 'text-primary'}`}>
                                                                {repliedMsg.senderId === user?.id ? 'You' : (repliedMsg.sender?.name || 'Someone')}
                                                            </div>
                                                            <div className={`text-xs truncate max-w-[150px] sm:max-w-[200px] ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                                                {repliedMsg.type === 'text' ? repliedMsg.content : `[${repliedMsg.type}]`}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {msg.type === 'text' && (
                                                    msg.content === '[POLL]' ? (
                                                        <PollWidget pollId={msg.id} />
                                                    ) : (
                                                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                                    )
                                                )}
                                                {msg.type === 'image' && (
                                                    <img src={msg.content} alt="Upload" className="max-w-[250px] rounded-md cursor-pointer hover:opacity-90 transition-opacity" />
                                                )}
                                                {(msg.type === 'voice' || msg.type === 'video') && (
                                                    <div className="italic opacity-80 backdrop-blur-sm bg-black/10 px-2 py-1 rounded">
                                                        {msg.type === 'voice' ? '🎤 Voice Note' : '🎥 Video Note'}
                                                    </div>
                                                )}
                                                {msg.type === 'file' && (
                                                    <a href={msg.content} download className="flex items-center gap-2 underline decoration-white/50 underline-offset-2">
                                                        📎 {msg.fileName || 'Download File'}
                                                    </a>
                                                )}
                                            </div>

                                            <span className={`text-[10px] text-muted-foreground mt-1 opacity-70 px-1 ${isMine ? 'text-right' : 'text-left'}`}>
                                                {formatTime(msg.timestamp)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Input area */}
                <div className="p-4 bg-background z-20">
                    <MessageInput
                        chatId={selectedGroup.id}
                        chatName={selectedGroup.name}
                        onSend={(content: string, type: MessageType, duration?: number, replyToId?: string) => {
                            sendGroupMessage(content, type, duration, replyToId);
                            setReplyToMessage(null);
                        }}
                        onSendMedia={sendGroupMediaMessage}
                        onSendFile={sendGroupFileMessage}
                        replyToMessage={replyToMessage}
                        onCancelReply={() => setReplyToMessage(null)}
                    />
                </div>
            </div>

            {/* Slide-out Info Panel */}
            {showInfo && <GroupInfoPanel onClose={() => setShowInfo(false)} />}
        </div>
    );
}
