import { useGroupChat } from '@/context/GroupChatContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Users, Search, Hash } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { useState } from 'react';
import { CreateGroupDialog } from './CreateGroupDialog';

export function GroupList() {
    const { groups, selectedGroup, selectGroup, groupUnreadCounts, lastGroupMessages } = useGroupChat();
    const [search, setSearch] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="h-full flex flex-col bg-background border-r border-border">
            <div className="p-4 border-b border-border space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" /> Groups
                    </h2>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="w-5 h-5" />
                    </Button>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search groups..."
                        className="pl-9 bg-muted/50 border-none h-9"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {groups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <Users className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="font-medium text-lg mb-2">No groups yet</h3>
                        <p className="text-muted-foreground text-sm mb-6">Create a group to chat with multiple friends at once.</p>
                        <Button onClick={() => setIsCreateOpen(true)}>Create Group</Button>
                    </div>
                ) : filteredGroups.length === 0 ? (
                    <div className="text-center p-4 text-muted-foreground text-sm">No groups found</div>
                ) : (
                    filteredGroups.map(group => {
                        const isSelected = selectedGroup?.id === group.id;
                        const lastMsg = lastGroupMessages[group.id];
                        const unreadCount = groupUnreadCounts[group.id] || 0;

                        return (
                            <button
                                key={group.id}
                                onClick={() => selectGroup(group)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                                    }`}
                            >
                                <Avatar className="w-12 h-12 flex-shrink-0">
                                    <AvatarImage src={group.avatar} />
                                    <AvatarFallback className={isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20'}>
                                        <Hash className="w-5 h-5" />
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className={`font-semibold truncate ${unreadCount > 0 ? 'text-foreground' : 'text-foreground/90'}`}>
                                            {group.name}
                                        </h3>
                                        {lastMsg && (
                                            <span className={`text-xs flex-shrink-0 ml-2 ${unreadCount > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                                                {formatTime(lastMsg.timestamp)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center gap-2">
                                        <p className={`text-sm truncate ${unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                            {lastMsg ? (
                                                <span>
                                                    <span className="opacity-70">{lastMsg.sender?.name}:</span>{' '}
                                                    {lastMsg.type === 'text' ? lastMsg.content : `Sent a ${lastMsg.type}`}
                                                </span>
                                            ) : (
                                                group.description || <span className="italic">No messages yet</span>
                                            )}
                                        </p>
                                        {unreadCount > 0 && (
                                            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                                                {unreadCount > 99 ? '99+' : unreadCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            <CreateGroupDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        </div>
    );
}
