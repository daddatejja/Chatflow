import { useChat } from '@/context/ChatContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTime, formatDuration, formatFileSize, getFileIcon } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Mic, Video, Check, CheckCheck,
  Download, Pencil, Trash2, X, Check as CheckIcon, Reply
} from 'lucide-react';
import type { Message, User } from '@/types';
import { PollWidget } from './PollWidget';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDateLabel(date: Date): string {
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

interface MessageListProps {
  onReply?: (msg: Message) => void;
}

export function MessageList({ onReply }: MessageListProps = {}) {
  const { messages, selectedChat, currentUser, addReaction, editMessage, deleteMessage, hasMore, isLoadingMore, loadEarlierMessages } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentUserId = currentUser?.id || '';
  const [prevMessageCount, setPrevMessageCount] = useState(0);

  const chatMessages = messages.filter(
    msg =>
      (msg.senderId === currentUserId && msg.receiverId === selectedChat?.id) ||
      (msg.senderId === selectedChat?.id && msg.receiverId === currentUserId)
  );

  // Scroll to bottom on first load or new messages, but not on loading older messages
  useEffect(() => {
    if (chatMessages.length > prevMessageCount && !isLoadingMore) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    setPrevMessageCount(chatMessages.length);
  }, [chatMessages.length, isLoadingMore, prevMessageCount]);

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

  if (!selectedChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-2xl font-semibold text-foreground mb-3 tracking-tight">Welcome to ChatFlow</h3>
          <p className="text-muted-foreground max-w-sm text-base">
            Select a contact to start messaging, or use the add friends button to meet someone new.
          </p>
        </div>
      </div>
    );
  }

  // Build message list with date separators
  const items: Array<{ type: 'date'; label: string } | { type: 'message'; message: Message; index: number }> = [];
  chatMessages.forEach((message, index) => {
    if (message.isDeleted) {
      // Still show deleted messages as tombstone
    }
    const date = new Date(message.timestamp);
    const prevDate = index > 0 ? new Date(chatMessages[index - 1].timestamp) : null;
    if (!prevDate || !isSameDay(prevDate, date)) {
      items.push({ type: 'date', label: formatDateLabel(date) });
    }
    items.push({ type: 'message', message, index });
  });

  return (
    <ScrollArea className="flex-1 bg-background/50" ref={scrollContainerRef}>
      <div className="p-4 space-y-1">
        {hasMore && (
          <div ref={observerTarget} className="h-8 flex items-center justify-center">
            {isLoadingMore && <span className="text-xs text-muted-foreground">Loading older messages...</span>}
          </div>
        )}
        {items.map((item, i) => {
          if (item.type === 'date') {
            return (
              <div key={`date-${i}`} className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium px-3 py-1 bg-secondary/50 rounded-full">
                  {item.label}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            );
          }

          const { message } = item;
          const prevItem = items[i - 1];
          const prevMessage = prevItem?.type === 'message' ? prevItem.message : null;
          const showAvatar = !prevMessage || prevMessage.senderId !== message.senderId;

          const replyToMessage = message.replyToId ? messages.find(m => m.id === message.replyToId) : undefined;

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.senderId === currentUserId}
              showAvatar={showAvatar}
              otherUser={selectedChat}
              onReaction={addReaction}
              onEdit={editMessage}
              onDelete={deleteMessage}
              onReply={onReply}
              replyToMessage={replyToMessage}
            />
          );
        })}
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-foreground font-medium">No messages yet</p>
            <p className="text-muted-foreground text-sm mt-1">Say hi to {selectedChat.name}! 👋</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  otherUser: User | null;
  onReaction: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReply?: (msg: Message) => void;
  replyToMessage?: Message;
}

function MessageBubble({ message, isOwn, showAvatar, otherUser, onReaction, onEdit, onDelete, onReply, replyToMessage }: MessageBubbleProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groupedReactions = (message.reactions || []).reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => setShowReactionPicker(true), 400);
  };
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setShowReactionPicker(false);
  };

  const finishEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} items-end gap-2 group mb-1`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Avatar */}
      {!isOwn && showAvatar && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-medium shadow-sm flex-shrink-0">
          {otherUser?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
      )}
      {!isOwn && !showAvatar && <div className="w-8 flex-shrink-0" />}

      <div className="flex flex-col gap-0.5 max-w-[70%]">
        {/* Reaction picker (shown on hover) */}
        {showReactionPicker && !message.isDeleted && (
          <div className={`flex gap-1 mb-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <div className="flex items-center gap-1 bg-card border border-border rounded-full px-2 py-1 shadow-lg">
              {REACTION_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReaction(message.id, emoji); setShowReactionPicker(false); }}
                  className="text-base hover:scale-125 transition-transform leading-none"
                >
                  {emoji}
                </button>
              ))}
              {isOwn && !message.isDeleted && (
                <>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button
                    onClick={() => { setIsEditing(true); setShowReactionPicker(false); }}
                    className="p-1 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { onDelete(message.id); setShowReactionPicker(false); }}
                    className="p-1 hover:bg-destructive/10 rounded-full transition-colors text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {onReply && (
                <>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button
                    onClick={() => { onReply(message); setShowReactionPicker(false); }}
                    className="p-1 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
                    title="Reply"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-2.5 shadow-sm transition-all duration-200 ${isOwn
            ? 'bg-primary text-primary-foreground rounded-br-md shadow-primary/20'
            : 'bg-card border border-border/50 text-card-foreground rounded-bl-md'
            } ${message.isDeleted ? 'opacity-60' : ''}`}
        >
          {message.isDeleted ? (
            <p className="text-sm italic opacity-70">This message was deleted</p>
          ) : isEditing ? (
            <div className="flex items-center gap-2 min-w-[200px]">
              <input
                autoFocus
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') setIsEditing(false); }}
                className="flex-1 bg-transparent border-b border-primary-foreground/50 focus:outline-none text-sm"
              />
              <button onClick={finishEdit} className="opacity-80 hover:opacity-100"><CheckIcon className="w-4 h-4" /></button>
              <button onClick={() => setIsEditing(false)} className="opacity-80 hover:opacity-100"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex flex-col">
              {replyToMessage && (
                <div className={`mb-2 px-3 py-1.5 rounded-lg text-sm border-l-4 ${isOwn ? 'bg-primary-foreground/10 border-primary-foreground/50' : 'bg-primary/5 border-primary/50'} cursor-pointer hover:opacity-80 transition-opacity`}>
                  <div className={`font-semibold text-xs mb-0.5 ${isOwn ? 'text-primary-foreground text-opacity-90' : 'text-primary'}`}>
                    {replyToMessage.senderId === message.senderId ? 'You' : (otherUser?.name || 'Someone')}
                  </div>
                  <div className={`text-xs truncate max-w-[200px] ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {replyToMessage.type === 'text' ? replyToMessage.content : `[${replyToMessage.type}]`}
                  </div>
                </div>
              )}
              <>
                {/* Text */}
                {message.type?.toLowerCase() === 'text' && (
                  message.content === '[POLL]' ? (
                    <PollWidget messageId={message.id} isOwn={isOwn} />
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                  )
                )}

                {/* Voice */}
                {message.type?.toLowerCase() === 'voice' && (
                  <VoiceMessage message={message} isOwn={isOwn} />
                )}

                {/* Video note */}
                {message.type?.toLowerCase() === 'video' && (
                  <VideoMessage message={message} isOwn={isOwn} />
                )}

                {/* Image */}
                {message.type?.toLowerCase() === 'image' && (
                  <ImageMessage message={message} />
                )}

                {/* File */}
                {message.type?.toLowerCase() === 'file' && (
                  <FileMessage message={message} isOwn={isOwn} />
                )}
              </>
            </div>
          )}

          {/* Timestamp + read receipt */}
          <div className={`flex items-center justify-end gap-1.5 mt-1 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
            {message.isEdited && <span className="text-[10px] italic">edited</span>}
            <span className="text-[11px] font-medium">{formatTime(message.timestamp)}</span>
            {isOwn && (
              message.isRead
                ? <CheckCheck className="w-3.5 h-3.5" />
                : <Check className="w-3.5 h-3.5 opacity-70" />
            )}
          </div>
        </div>

        {/* Reactions display */}
        {Object.keys(groupedReactions).length > 0 && (
          <div className={`flex gap-1 flex-wrap mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {Object.entries(groupedReactions).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReaction(message.id, emoji)}
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

function VoiceMessage({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

  const src = message.content.startsWith('http') || message.content.startsWith('blob:')
    ? message.content
    : `${API_URL}${message.content}`;

  // Cleanup audio resources on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.ontimeupdate = null;
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.onended = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          const dur = audioRef.current.duration || message.duration || 1;
          setProgress((audioRef.current.currentTime / dur) * 100);
          setCurrentTime(Math.floor(audioRef.current.currentTime));
        }
      };
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  const duration = message.duration || 0;

  return (
    <div className="flex items-center gap-3 min-w-[220px]">
      <button
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${isOwn
          ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground'
          : 'bg-primary/10 hover:bg-primary/20 text-primary'
          }`}
      >
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <div className={`h-1.5 rounded-full overflow-hidden cursor-pointer ${isOwn ? 'bg-primary-foreground/30' : 'bg-secondary'}`}
          onClick={(e) => {
            if (!audioRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = pct * (audioRef.current.duration || 0);
          }}
        >
          <div
            className={`h-full transition-all duration-100 rounded-full ${isOwn ? 'bg-primary-foreground' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-1 text-xs opacity-70">
          <Mic className="w-3 h-3" />
          <span>{isPlaying ? formatDuration(currentTime) : formatDuration(duration)}</span>
        </div>
      </div>
    </div>
  );
}

function VideoMessage({ message }: { message: Message; isOwn: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

  const src = message.content.startsWith('http') || message.content.startsWith('blob:')
    ? message.content
    : `${API_URL}${message.content}`;

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) { videoRef.current.pause(); } else { videoRef.current.play(); }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="relative rounded-xl overflow-hidden min-w-[240px] max-w-[300px]">
      <video
        ref={videoRef}
        src={src}
        className="w-full rounded-xl"
        onEnded={() => setIsPlaying(false)}
        playsInline
      />
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
        >
          <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
            <Play className="w-6 h-6 text-gray-900 ml-1" />
          </div>
        </button>
      )}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-black/50 text-white backdrop-blur-sm">
        <Video className="w-3 h-3" />
        {formatDuration(message.duration || 0)}
      </div>
    </div>
  );
}

function ImageMessage({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

  const src = message.content.startsWith('http') || message.content.startsWith('blob:')
    ? message.content
    : `${API_URL}${message.content}`;

  return (
    <>
      <div className="rounded-xl overflow-hidden cursor-pointer" onClick={() => setExpanded(true)}>
        <img
          src={src}
          alt={message.fileName || 'Image'}
          className="max-w-[280px] max-h-[320px] object-cover rounded-xl hover:opacity-90 transition-opacity"
          onError={(e) => { (e.target as HTMLImageElement).src = ''; }}
        />
        {message.fileName && (
          <p className="text-xs opacity-70 mt-1 truncate">{message.fileName}</p>
        )}
      </div>
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <img src={src} alt={message.fileName || 'Image'} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
}

function FileMessage({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
  const src = message.content.startsWith('http') || message.content.startsWith('blob:')
    ? message.content
    : `${API_URL}${message.content}`;

  const icon = getFileIcon(message.mimeType || '');

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${isOwn ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{message.fileName || 'File'}</p>
        {message.fileSize && (
          <p className="text-xs opacity-70">{formatFileSize(message.fileSize)}</p>
        )}
      </div>
      <a
        href={src}
        download={message.fileName || 'file'}
        target="_blank"
        rel="noopener noreferrer"
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${isOwn ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground' : 'bg-primary/10 hover:bg-primary/20 text-primary'}`}
        onClick={e => e.stopPropagation()}
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
}
