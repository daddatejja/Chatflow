import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useGroupChat } from '@/context/GroupChatContext';
import { userAPI } from '@/services/api';
import type { User } from '@/types';
import { Check, Loader2 } from 'lucide-react';

interface CreateGroupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
    const { createGroup } = useGroupChat();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(true);
    const [friends, setFriends] = useState<User[]>([]);
    const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingFriends, setLoadingFriends] = useState(false);

    useEffect(() => {
        if (open) {
            setName('');
            setDescription('');
            setIsPrivate(true);
            setSelectedFriends([]);
            loadFriends();
        }
    }, [open]);

    const loadFriends = async () => {
        try {
            setLoadingFriends(true);
            const res = await userAPI.getFriends();
            // Friends come back as User objects now
            const friendUsers = res.data.friends || [];
            setFriends(friendUsers);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingFriends(false);
        }
    };

    const toggleFriend = (id: string) => {
        setSelectedFriends(prev =>
            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsLoading(true);
        const group = await createGroup({
            name: name.trim(),
            description: description.trim(),
            isPrivate,
            memberIds: selectedFriends
        });
        setIsLoading(false);

        if (group) {
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create New Group</DialogTitle>
                    <div className="text-sm text-muted-foreground" id="create-group-desc">
                        Add friends to start a new group conversation.
                    </div>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4" aria-describedby="create-group-desc">
                    <div className="space-y-2">
                        <Label htmlFor="name">Group Name</Label>
                        <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekend Plan" required />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="desc">Description (Optional)</Label>
                        <Input id="desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this group about?" />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Private Group</Label>
                            <div className="text-xs text-muted-foreground">Only invited people can join</div>
                        </div>
                        <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                    </div>

                    <div className="space-y-2 pt-2">
                        <Label>Add Friends ({selectedFriends.length} selected)</Label>
                        <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2 bg-muted/20">
                            {loadingFriends ? (
                                <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                            ) : friends.length === 0 ? (
                                <div className="text-sm text-center text-muted-foreground py-4">No friends found</div>
                            ) : (
                                friends.filter(Boolean).map(friend => (
                                    <div
                                        key={friend?.id}
                                        onClick={() => friend?.id && toggleFriend(friend.id)}
                                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
                                    >
                                        <div className="relative flex-shrink-0">
                                            <Avatar className="w-8 h-8">
                                                <AvatarImage src={friend?.avatar} />
                                                <AvatarFallback>{friend?.name?.[0] || '?'}</AvatarFallback>
                                            </Avatar>
                                            {selectedFriends.includes(friend?.id) && (
                                                <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                                                    <Check className="w-3 h-3" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-sm font-medium flex-1 truncate">{friend?.name || 'Unknown User'}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={!name.trim() || isLoading}>
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create Group
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
