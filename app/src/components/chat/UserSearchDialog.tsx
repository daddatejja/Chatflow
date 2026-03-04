import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { userAPI } from '@/services/api';
import { Search, UserPlus, Check, Loader2 } from 'lucide-react';

interface UserSearchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function UserSearchDialog({ open, onOpenChange }: UserSearchDialogProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [sentRequests, setSentRequests] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!open) {
            setQuery('');
            setResults([]);
            setSentRequests({});
        }
    }, [open]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        try {
            const response = await userAPI.searchUsers(query);
            setResults(response.data.users || []);
        } catch (error) {
            console.error('Failed to search users:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSendRequest = async (userId: string) => {
        try {
            await userAPI.sendFriendRequest(userId);
            setSentRequests(prev => ({ ...prev, [userId]: true }));
        } catch (error) {
            console.error('Failed to send friend request:', error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-background text-foreground border-border" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Find Users</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSearch} className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or email..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-9 pr-20"
                        autoFocus
                    />
                    <Button
                        type="submit"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
                        disabled={loading || !query.trim()}
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Search'}
                    </Button>
                </form>

                <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                    {results.length === 0 && query && !loading && (
                        <div className="text-center py-8 text-muted-foreground text-sm flex flex-col items-center">
                            <Search className="w-8 h-8 opacity-20 mb-2" />
                            No users found matching "{query}"
                        </div>
                    )}

                    {results.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-transparent hover:bg-secondary transition-colors">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-border/50">
                                    <AvatarImage src={user.avatar} />
                                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                        {user.name.split(' ').map((n: string) => n[0]).join('')}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h4 className="font-medium text-sm leading-none">{user.name}</h4>
                                    <p className="text-xs text-muted-foreground mt-1">{user.email}</p>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                variant={sentRequests[user.id] ? "secondary" : "default"}
                                className="h-8 rounded-full px-3"
                                onClick={() => handleSendRequest(user.id)}
                                disabled={sentRequests[user.id]}
                            >
                                {sentRequests[user.id] ? (
                                    <>
                                        <Check className="w-3.5 h-3.5 mr-1.5" /> Sent
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add
                                    </>
                                )}
                            </Button>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
