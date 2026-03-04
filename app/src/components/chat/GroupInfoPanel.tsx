import { useGroupChat } from '@/context/GroupChatContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Hash, Users, UserPlus, LogOut, Copy, Check, Trash2, X, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { GroupMember } from '@/types';
import { useChat } from '@/context/ChatContext';

interface GroupInfoPanelProps {
    onClose: () => void;
}

export function GroupInfoPanel({ onClose }: GroupInfoPanelProps) {
    const { selectedGroup, leaveGroup, deleteGroup, regenerateInviteCode, removeMember } = useGroupChat();
    const { currentUser: user } = useChat();
    const [copied, setCopied] = useState(false);

    if (!selectedGroup) return null;

    const myRole = selectedGroup.members.find(m => m.userId === user?.id)?.role || 'MEMBER';
    const isAdminOrOwner = myRole === 'OWNER' || myRole === 'ADMIN';
    const isOwner = myRole === 'OWNER';

    const handleCopyHash = () => {
        if (!selectedGroup.inviteCode) return;
        navigator.clipboard.writeText(selectedGroup.inviteCode);
        setCopied(true);
        toast.success('Invite code copied');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRemove = (member: GroupMember) => {
        if (!window.confirm(`Are you sure you want to remove ${member.user.name}?`)) return;
        removeMember(selectedGroup.id, member.userId);
    };

    return (
        <div className="w-80 h-full bg-background border-l border-border flex flex-col absolute right-0 top-0 z-20 shadow-xl transition-all">
            <div className="h-16 flex items-center justify-between px-4 border-b border-border bg-card">
                <h3 className="font-semibold flex items-center gap-2">
                    <Hash className="w-4 h-4 text-primary" /> Group Info
                </h3>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-6 flex flex-col items-center border-b border-border">
                    <Avatar className="w-24 h-24 mb-4 ring-4 ring-muted">
                        <AvatarImage src={selectedGroup.avatar} />
                        <AvatarFallback className="text-3xl bg-primary text-primary-foreground">
                            {selectedGroup.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <h2 className="text-xl font-bold text-center leading-tight mb-1">{selectedGroup.name}</h2>
                    <p className="text-sm text-muted-foreground mb-3 text-center">
                        {selectedGroup.description || 'No description provided'}
                    </p>
                    <Badge variant="secondary" className="flex items-center gap-1 font-normal">
                        <Users className="w-3 h-3" />
                        {selectedGroup.members?.length || 0} members
                    </Badge>
                </div>

                {selectedGroup.isPrivate && isAdminOrOwner && (
                    <div className="p-4 border-b border-border">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Invite Code</h4>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-md p-2 text-center font-mono text-sm border font-medium">
                                {selectedGroup.inviteCode || 'No code generated'}
                            </div>
                            <Button size="icon" variant="outline" onClick={handleCopyHash} className="h-9 w-9">
                                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                            </Button>
                        </div>
                        {isOwner && (
                            <Button
                                variant="link"
                                size="sm"
                                className="text-xs mt-1 h-auto p-0 text-muted-foreground hover:text-primary"
                                onClick={() => regenerateInviteCode(selectedGroup.id)}
                            >
                                Regenerate Code
                            </Button>
                        )}
                    </div>
                )}

                <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members</h4>
                        {isAdminOrOwner && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" title="Add members">
                                <UserPlus className="w-3 h-3" />
                            </Button>
                        )}
                    </div>

                    <div className="space-y-3">
                        {selectedGroup.members?.map(member => (
                            <div key={member.userId} className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Avatar className="w-8 h-8">
                                            <AvatarImage src={member.user.avatar} />
                                            <AvatarFallback>{member.user.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${member.user.status === 'online' ? 'bg-green-500' :
                                            member.user.status === 'away' ? 'bg-amber-500' :
                                                member.user.status === 'busy' ? 'bg-red-500' : 'bg-gray-400'
                                            }`} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium flex items-center gap-1">
                                            {member.user.name} {member.userId === user?.id && <span className="text-muted-foreground text-xs">(You)</span>}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            {member.role === 'OWNER' && <ShieldAlert className="w-2.5 h-2.5 text-primary" />}
                                            {member.role}
                                        </span>
                                    </div>
                                </div>

                                {isAdminOrOwner && member.userId !== user?.id && member.role !== 'OWNER' && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => handleRemove(member)}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </ScrollArea>

            <div className="p-4 border-t border-border mt-auto space-y-2 bg-muted/20">
                {!isOwner && (
                    <Button
                        variant="outline"
                        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                        onClick={() => {
                            if (window.confirm('Are you sure you want to leave this group?')) leaveGroup(selectedGroup.id);
                        }}
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        Leave Group
                    </Button>
                )}

                {isOwner && (
                    <Button
                        variant="outline"
                        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                        onClick={() => {
                            if (window.confirm('Are you sure you want to permanently delete this group? This cannot be undone.')) {
                                deleteGroup(selectedGroup.id);
                            }
                        }}
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Group
                    </Button>
                )}
            </div>
        </div>
    );
}
