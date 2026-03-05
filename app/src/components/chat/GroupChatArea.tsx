import { useState, useRef, useEffect } from 'react';
import { useGroupChat } from '@/context/GroupChatContext';
import { useChat } from '@/context/ChatContext';
import { MessageInput } from '@/components/chat/MessageInput';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Hash, Info, MoreVertical, Pencil, Reply, Trash2 } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import type { MessageType, GroupMessage } from '@/types';
import { GroupInfoPanel } from './GroupInfoPanel';
import { PollWidget } from './PollWidget';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

export function GroupChatArea() {
    const { currentUser: user } = useChat();
    const {
        selectedGroup, groupMessages, sendGroupMessage, sendGroupMediaMessage,
        sendGroupFileMessage, editGroupMessage, deleteGroupMessage, addGroupReaction,
        groupTyping, hasMore, isLoadingMore, loadEarlierMessages
    } = useGroupChat();
    const [showInfo, setShowInfo] = useState(false);
    const observerTarget = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [prevMessageCount, setPrevMessageCount] = useState(0);
    const [replyToMessage, setReplyToMessage] = useState<GroupMessage | null>(null);
    const [editMessageId, setEditMessageId] = useState<string | null>(null);

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
                            const showAvatar = msg.senderId !== user?.id && (index === 0 || groupMessages[index - 1].senderId !== msg.senderId);
                            return (
                                <GroupMessageBubble
                                    key={msg.id}
                                    msg={msg}
                                    isMine={msg.senderId === user?.id}
                                    showAvatar={showAvatar}
                                    user={user}
                                    groupMessages={groupMessages}
                                    onReply={(m) => {
                                        setReplyToMessage(m);
                                        setEditMessageId(null);
                                    }}
                                    onEdit={(id) => setEditMessageId(id)}
                                    onDelete={deleteGroupMessage}
                                    onReaction={(id, emoji) => addGroupReaction(id, emoji)}
                                />
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
                            if (editMessageId) {
                                editGroupMessage(editMessageId, content);
                                setEditMessageId(null);
                            } else {
                                sendGroupMessage(content, type, duration, replyToId);
                            }
                            setReplyToMessage(null);
                        }}
                        onSendMedia={sendGroupMediaMessage}
                        onSendFile={sendGroupFileMessage}
                        replyToMessage={replyToMessage}
                        onCancelReply={() => setReplyToMessage(null)}
                        editingMessage={editMessageId ? groupMessages.find(m => m.id === editMessageId) : null}
                        onCancelEdit={() => setEditMessageId(null)}
                    />
                </div>
            </div>

            {/* Slide-out Info Panel */}
            {showInfo && <GroupInfoPanel onClose={() => setShowInfo(false)} />}
        </div>
    );
}

export function GroupMessageBubble({
    msg, isMine, showAvatar, user, groupMessages, onReply, onEdit, onDelete, onReaction
}: {
    msg: GroupMessage;
    isMine: boolean;
    showAvatar: boolean;
    user: any;
    groupMessages: GroupMessage[];
    onReply: (msg: GroupMessage) => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onReaction: (id: string, emoji: string) => void;
}) {
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = () => {
        hoverTimeoutRef.current = setTimeout(() => setShowReactionPicker(true), 400);
    };
    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setShowReactionPicker(false);
    };

    const groupedReactions = (msg.reactions || []).reduce((acc: Record<string, number>, r: any) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
        return acc;
    }, {});

    return (
        <div
            className={`flex gap-3 max-w-[80%] ${isMine ? 'ml-auto flex-row-reverse' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
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

                {/* Reaction Picker Popup */}
                {showReactionPicker && !msg.isDeleted && (
                    <div className={`flex gap-1 mb-1 ${isMine ? 'justify-end' : 'justify-start'} z-10 relative`}>
                        <div className="flex items-center gap-1 bg-card border border-border rounded-full px-2 py-1 shadow-lg absolute bottom-0 whitespace-nowrap">
                            {REACTION_EMOJIS.map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={() => { onReaction(msg.id, emoji); setShowReactionPicker(false); }}
                                    className="text-base hover:scale-125 transition-transform leading-none p-1"
                                >
                                    {emoji}
                                </button>
                            ))}
                            {isMine && msg.type === 'text' && (
                                <>
                                    <div className="w-px h-4 bg-border mx-1" />
                                    <button
                                        onClick={() => { onEdit(msg.id); setShowReactionPicker(false); }}
                                        className="p-1.5 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
                                        title="Edit"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                </>
                            )}
                            {isMine && (
                                <>
                                    <button
                                        onClick={() => { onDelete(msg.id); setShowReactionPicker(false); }}
                                        className="p-1.5 hover:bg-destructive/10 rounded-full transition-colors text-muted-foreground hover:text-destructive"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </>
                            )}
                            <div className="w-px h-4 bg-border mx-1" />
                            <button
                                onClick={() => { onReply(msg); setShowReactionPicker(false); }}
                                className="p-1.5 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
                                title="Reply"
                            >
                                <Reply className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                <div className="relative group/msg flex flex-col">
                    <div className={`rounded-2xl px-4 py-2 text-sm flex flex-col ${isMine ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-primary/20' : 'bg-muted rounded-tl-sm shadow-sm'} ${msg.isDeleted ? 'bg-muted/50 text-muted-foreground italic opacity-70' : ''}`}>
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
                                <PollWidget messageId={msg.id} isOwn={isMine} />
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

                    <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] text-muted-foreground opacity-70 px-1">
                            {formatTime(msg.timestamp)}
                        </span>
                        {msg.isEdited && !msg.isDeleted && (
                            <span className="text-[10px] text-muted-foreground opacity-70">(edited)</span>
                        )}
                    </div>
                </div>

                {/* Received Reactions */}
                {Object.keys(groupedReactions).length > 0 && (
                    <div className={`flex gap-1 flex-wrap mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        {Object.entries(groupedReactions).map(([emoji, count]) => (
                            <button
                                key={emoji}
                                onClick={() => onReaction(msg.id, emoji)}
                                className="flex items-center gap-1 bg-card border border-border/60 rounded-full px-2 py-0.5 text-xs font-medium hover:bg-accent transition-colors shadow-sm"
                            >
                                <span>{emoji}</span>
                                {count > 1 && <span className="text-muted-foreground">{count}</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
