import { useChat } from '@/context/ChatContext';
import { Button } from '@/components/ui/button';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Mic, Video, Smile, Paperclip, X, FileText } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { socketService } from '@/services/socket';
import { toast } from 'sonner';
import { CreatePollDialog } from './CreatePollDialog';
import { BarChart2 } from 'lucide-react';
import { pollAPI } from '@/services/api';

import type { MessageType } from '@/types';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];

interface MessageInputProps {
  chatId?: string;
  chatName?: string;
  onSend?: (content: string, type: MessageType, duration?: number, replyToId?: string) => void;
  onSendMedia?: (blob: Blob, type: 'voice' | 'video', duration: number) => Promise<void>;
  onSendFile?: (file: File) => Promise<void>;
  replyToMessage?: any;
  onCancelReply?: () => void;
  editingMessage?: any;
  onCancelEdit?: () => void;
}

export function MessageInput({ chatId, chatName, onSend, onSendFile, replyToMessage, onCancelReply, editingMessage, onCancelEdit }: MessageInputProps = {}) {
  const {
    selectedChat,
    sendMessage,
    sendFileMessage,
    isRecording,
    recordingType,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useChat();

  const activeChatId = chatId || selectedChat?.id;
  const activeChatName = chatName || selectedChat?.name;

  const [message, setMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [filePreview, setFilePreview] = useState<{ file: File; url: string; type: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Cleanup typing on unmount or chat change
  useEffect(() => {
    return () => {
      if (isTypingRef.current && activeChatId) {
        socketService.stopTyping(activeChatId);
        isTypingRef.current = false;
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [activeChatId]);

  // Handle edit message populate
  useEffect(() => {
    if (editingMessage && editingMessage.type === 'text') {
      setMessage(editingMessage.content);
      // Focus could be handled here with a ref
    } else if (!editingMessage && !message) {
      setMessage('');
    }
  }, [editingMessage]);

  const handleTypingStart = useCallback(() => {
    if (!activeChatId || isTypingRef.current) return;
    socketService.startTyping(activeChatId);
    isTypingRef.current = true;
  }, [activeChatId]);

  const handleTypingStop = useCallback(() => {
    if (!activeChatId || !isTypingRef.current) return;
    socketService.stopTyping(activeChatId);
    isTypingRef.current = false;
  }, [activeChatId]);

  const handleMessageChange = (value: string) => {
    setMessage(value);
    handleTypingStart();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(handleTypingStop, 1500);
  };

  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);
    handleTypingStop();

    try {
      if (filePreview) {
        const sendFileMethod = onSendFile || sendFileMessage;
        await sendFileMethod(filePreview.file);
        clearFilePreview();
      } else if (message.trim()) {
        if (onSend) {
          onSend(message.trim(), 'text', undefined, replyToMessage?.id);
        } else {
          sendMessage(message.trim(), 'text', undefined, undefined, undefined, undefined, replyToMessage?.id);
        }
        setMessage('');
      }
    } finally {
      setIsSending(false);
      if (onCancelReply) onCancelReply();
      if (onCancelEdit) onCancelEdit();
    }
  };

  const handleCreatePoll = async (pollData: any) => {
    if (!activeChatId) return;
    setIsSending(true);
    try {
      let createdMessage;
      if (chatId) { // Group
        createdMessage = await socketService.sendGroupMessage(activeChatId, '[POLL]', 'TEXT');
      } else {
        createdMessage = await socketService.sendMessage(activeChatId, '[POLL]', 'TEXT');
      }

      if (createdMessage && createdMessage.id) {
        await pollAPI.createPoll({
          messageId: createdMessage.id,
          ...pollData
        });
        toast.success('Poll created successfully');
      }
    } catch (error) {
      console.error('Error creating poll:', error);
      toast.error('Failed to create poll');
    } finally {
      setIsSending(false);
      setShowPollDialog(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 50MB.');
      return;
    }

    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('image/') ? 'image' : 'file';
    setFilePreview({ file, url, type });

    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const clearFilePreview = () => {
    if (filePreview) URL.revokeObjectURL(filePreview.url);
    setFilePreview(null);
  };

  const handleStartRecording = async (type: 'voice' | 'video') => {
    // We do not manage the upload directly from handleStop in here yet, the context handles logic.
    // Wait, the context's sendMediaMessage needs to be overridden here!
    // Instead of overriding startRecording, we just call the correct function when recording stops?
    // Oh, the actual recording state and file generation is inside ChatContext currently.
    // That means `MessageInput` just triggers startRecording() on the context.
    // Then ChatContext takes care of sending it. This is harder to decouple...
    await startRecording(type);
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  if (!activeChatId) return null;

  // Recording UI
  if (isRecording) {
    return (
      <div className="p-4 bg-card border-t border-border shadow-sm">
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={cancelRecording}
            className="rounded-full h-12 w-12 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-3 bg-destructive/10 px-6 py-3 rounded-full border border-destructive/20 shadow-sm">
            <div className="w-3 h-3 bg-destructive rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
            <span className="text-destructive font-medium tracking-wide">
              Recording {recordingType === 'voice' ? 'Voice' : 'Video'}...
            </span>
            <span className="text-destructive/80 font-mono font-medium">
              {formatDuration(recordingDuration)}
            </span>
          </div>

          <Button
            variant="default"
            size="icon"
            onClick={handleStopRecording}
            className="rounded-full h-12 w-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-transform hover:scale-105 shadow-primary/25"
            title="Send"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border-t border-border relative z-10 transition-colors duration-200">
      {/* Emoji picker */}
      {showEmoji && (
        <div className="px-4 py-2 border-b border-border flex gap-2 flex-wrap bg-card/80 backdrop-blur-sm">
          {EMOJI_LIST.map(e => (
            <button
              key={e}
              onClick={() => {
                setMessage(prev => prev + e);
                setShowEmoji(false);
              }}
              className="text-xl hover:scale-125 transition-transform"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* File preview */}
      {filePreview && (
        <div className="px-4 pt-3 pb-0">
          <div className="relative inline-flex items-center gap-3 bg-secondary/50 rounded-xl p-3 border border-border max-w-xs">
            {filePreview.type === 'image' ? (
              <img src={filePreview.url} className="h-16 w-16 object-cover rounded-lg" alt="preview" />
            ) : (
              <div className="h-16 w-16 bg-primary/10 rounded-lg flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{filePreview.file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(filePreview.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={clearFilePreview}
              className="absolute -top-2 -right-2 w-6 h-6 bg-destructive rounded-full flex items-center justify-center text-destructive-foreground hover:bg-destructive/90 shadow-sm"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Main input area */}
      <div className="p-4">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          {/* Attachment buttons */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
            onChange={handleFileSelect}
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full flex-shrink-0 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file or image"
          >
            <Paperclip className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full flex-shrink-0 transition-colors"
            onClick={() => setShowPollDialog(true)}
            title="Create a Poll"
          >
            <BarChart2 className="w-5 h-5" />
          </Button>

          {/* Text input container */}
          <div className="flex-1 flex flex-col min-w-0">
            {replyToMessage && !editingMessage && (
              <div className="flex items-center justify-between bg-primary/10 rounded-t-xl px-3 py-1.5 border-b border-primary/20">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-semibold text-primary">Replying to {replyToMessage.sender?.name || 'Message'}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-full">
                    {replyToMessage.type === 'text' ? replyToMessage.content : `[${replyToMessage.type}]`}
                  </span>
                </div>
                <button onClick={onCancelReply} className="text-muted-foreground hover:text-foreground p-1 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {editingMessage && (
              <div className="flex items-center justify-between bg-primary/10 rounded-t-xl px-3 py-1.5 border-b border-primary/20">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-semibold text-primary">Editing message</span>
                </div>
                <button onClick={() => { if (onCancelEdit) onCancelEdit(); setMessage(''); }} className="text-muted-foreground hover:text-foreground p-1 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="relative group flex-1">
              <textarea
                value={message}
                onChange={(e) => handleMessageChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={editingMessage ? "Edit message..." : `Message ${activeChatName || ''}...`}
                rows={1}
                className={`w-full bg-secondary/50 border border-transparent focus:bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all ${(replyToMessage || editingMessage) ? 'rounded-b-2xl rounded-t-none' : 'rounded-2xl'} h-12 text-base shadow-sm resize-none px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none leading-[1.5] overflow-y-hidden`}
                style={{ minHeight: '48px', maxHeight: '120px' }}
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors p-1.5 rounded-full hover:bg-accent"
                onClick={() => setShowEmoji(!showEmoji)}
                title="Emoji"
              >
                <Smile className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Send or recording buttons */}
          {(message.trim() || filePreview) ? (
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-12 w-12 p-0 shadow-md transition-all hover:scale-105 active:scale-95 flex-shrink-0"
            >
              <Send className="w-5 h-5" />
            </Button>
          ) : (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleStartRecording('voice')}
                className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full h-12 w-12 transition-colors"
                title="Record voice note"
              >
                <Mic className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleStartRecording('video')}
                className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full h-12 w-12 hidden sm:flex transition-colors"
                title="Record video note"
              >
                <Video className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <CreatePollDialog
        open={showPollDialog}
        onOpenChange={setShowPollDialog}
        onSubmit={handleCreatePoll}
      />
    </div>
  );
}
