import { useChat } from '@/context/ChatContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatLastSeen, getStatusColor } from '@/lib/utils';
import { Search, MoreVertical, Ban } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { User, Message } from '@/types';

function getLastMessagePreview(msg: Message | undefined): string {
  if (!msg) return '';
  if (msg.isDeleted) return '🚫 Message deleted';
  switch (msg.type?.toLowerCase()) {
    case 'voice': return '🎤 Voice message';
    case 'video': return '🎥 Video message';
    case 'image': return `🖼️ ${msg.fileName || 'Image'}`;
    case 'file': return `📎 ${msg.fileName || 'File'}`;
    default: return msg.content?.substring(0, 40) || '';
  }
}

export function ContactList() {
  const { users, selectedChat, selectChat, unreadCounts, currentUser, lastMessages, blockedUsers, blockUser } = useChat();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = (users ?? [])
    .filter(u => !blockedUsers?.some(b => b.id === u.id))
    .filter(user =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col h-full shadow-sm z-10 transition-colors duration-200">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {currentUser && (
              <>
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={currentUser.avatar || ''} />
                    <AvatarFallback>{currentUser.name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(currentUser.status || 'offline')}`} />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground text-sm">{currentUser.name}</h2>
                  <p className="text-xs text-muted-foreground font-medium capitalize">{(currentUser.status || 'offline').toLowerCase()}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary/50 border-transparent focus-visible:bg-background focus-visible:border-primary focus-visible:ring-primary/20 transition-all rounded-full h-10"
          />
        </div>
      </div>

      {/* Contacts */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-0.5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-2">
            Contacts ({filteredUsers.length})
          </h3>

          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {searchQuery ? 'No contacts found' : 'No contacts yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : 'Use the add button (👤+) in the top bar to find friends.'}
              </p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <ContactItem
                key={user.id}
                user={user}
                isSelected={selectedChat?.id === user.id}
                unreadCount={unreadCounts[user.id] || 0}
                lastMessage={lastMessages[user.id]}
                onClick={() => selectChat(user)}
                onBlock={() => blockUser(user.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ContactItemProps {
  user: User;
  isSelected: boolean;
  unreadCount: number;
  lastMessage?: Message;
  onClick: () => void;
  onBlock: () => void;
}

function ContactItem({ user, isSelected, unreadCount, lastMessage, onClick, onBlock }: ContactItemProps) {
  const preview = getLastMessagePreview(lastMessage);
  const timeLabel = lastMessage ? (() => {
    const d = new Date(lastMessage.timestamp);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return d.toLocaleDateString();
  })() : '';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Space') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`w-full flex items-center gap-3 py-3 px-3 rounded-xl transition-all duration-200 border border-transparent cursor-pointer ${isSelected
        ? 'bg-primary/10 border-primary/20 shadow-sm'
        : 'hover:bg-accent hover:border-border'
        }`}
    >
      <div className="relative shadow-sm rounded-full flex-shrink-0">
        <Avatar className="h-12 w-12 border border-border/50">
          <AvatarImage src={user.avatar} />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-medium">
            {user.name.split(' ').map(n => n[0]).join('')}
          </AvatarFallback>
        </Avatar>
        <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-background shadow-sm ${getStatusColor(user.status)}`} />
      </div>

      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <h4 className={`font-medium truncate pr-2 ${isSelected ? 'text-primary font-semibold' : 'text-foreground'}`}>
            {user.name}
          </h4>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {timeLabel && (
              <span className={`text-[10px] font-medium ${unreadCount > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                {timeLabel}
              </span>
            )}
            {unreadCount > 0 && (
              <Badge className="bg-primary hover:bg-primary text-primary-foreground text-[10px] px-1.5 py-0 min-w-[1.25rem] flex justify-center shadow-sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive font-medium cursor-pointer" onClick={(e) => { e.stopPropagation(); onBlock(); }}>
                  <Ban className="w-4 h-4 mr-2" />
                  Block User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className={`text-xs truncate ${unreadCount > 0 ? 'font-medium text-foreground' : isSelected ? 'text-primary/80' : 'text-muted-foreground'}`}>
          {preview || (user.status === 'online' ? '● Online' : formatLastSeen(user.lastSeen))}
        </p>
      </div>
    </div>
  );
}
