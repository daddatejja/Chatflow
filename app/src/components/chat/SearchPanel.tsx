import { useState, useEffect } from 'react';
import { Search, Hash, MessageSquare, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { messageAPI } from '@/services/api';
import { formatTime } from '@/lib/utils';
import { useChat } from '@/context/ChatContext';
import { toast } from 'sonner';

interface SearchPanelProps {
    onClose: () => void;
    onMessageSelect?: (messageId: string, chatId: string, isGroup: boolean) => void;
}

export function SearchPanel({ onClose, onMessageSelect }: SearchPanelProps) {
    const { currentUser: user } = useChat();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim().length >= 2) {
                performSearch(query.trim());
            } else {
                setResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    const performSearch = async (searchQuery: string) => {
        setIsSearching(true);
        try {
            const res = await messageAPI.searchMessages(searchQuery);
            setResults(res.data.messages || []);
        } catch (e) {
            toast.error('Failed to search messages');
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const getChatName = (msg: any) => {
        if (msg.groupId) return msg.group?.name;
        if (msg.senderId === user?.id) return msg.receiver?.name;
        return msg.sender?.name;
    };

    const getChatAvatar = (msg: any) => {
        if (msg.groupId) return msg.group?.avatar;
        if (msg.senderId === user?.id) return msg.receiver?.avatar;
        return msg.sender?.avatar;
    };

    const isGroupMessage = (msg: any) => !!msg.groupId;

    return (
        <div className="absolute top-0 right-0 w-80 h-full bg-background border-l border-border shadow-2xl z-40 flex flex-col animate-in slide-in-from-right-full">
            <div className="p-4 border-b border-border bg-card">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Search className="w-4 h-4 text-primary" /> Search
                    </h2>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        autoFocus
                        placeholder="Search messages..."
                        className="pl-9 h-9 bg-muted border-none"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
            </div>

            <ScrollArea className="flex-1 p-2">
                {isSearching && (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mb-2 text-primary" />
                        <span className="text-sm">Searching...</span>
                    </div>
                )}

                {!isSearching && query.length > 0 && query.length < 2 && (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                        Type at least 2 characters to search
                    </div>
                )}

                {!isSearching && query.length >= 2 && results.length === 0 && (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                        No messages found for "{query}"
                    </div>
                )}

                {!isSearching && results.length > 0 && (
                    <div className="space-y-1">
                        {results.map((msg) => (
                            <button
                                key={msg.id}
                                className="w-full text-left p-3 hover:bg-muted/50 rounded-xl transition-colors flex gap-3"
                                onClick={() => {
                                    if (onMessageSelect) {
                                        const chatId = msg.groupId || (msg.senderId === user?.id ? msg.receiverId : msg.senderId);
                                        onMessageSelect(msg.id, chatId, isGroupMessage(msg));
                                    }
                                    onClose();
                                }}
                            >
                                <div className="relative mt-1">
                                    <Avatar className="w-8 h-8 flex-shrink-0">
                                        <AvatarImage src={getChatAvatar(msg)} />
                                        <AvatarFallback className="bg-primary/20 text-primary">
                                            {isGroupMessage(msg) ? <Hash className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-0.5">
                                        <h4 className="text-sm font-semibold truncate">{getChatName(msg)}</h4>
                                        <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                                            {formatTime(msg.createdAt)}
                                        </span>
                                    </div>
                                    <div className="text-xs font-medium text-foreground/80 mb-0.5">
                                        {msg.sender?.name}:
                                    </div>
                                    <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
                                        {msg.content}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
