import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { userAPI } from '@/services/api';
import { useChat } from '@/context/ChatContext';
import { Check, X, UserCog, Loader2 } from 'lucide-react';

interface FriendRequestsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRequestHandled?: () => void;
}

export function FriendRequestsDialog({ open, onOpenChange, onRequestHandled }: FriendRequestsDialogProps) {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const { loadFriends } = useChat();

    useEffect(() => {
        if (open) {
            loadRequests();
        }
    }, [open]);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const response = await userAPI.getFriendRequests();
            // Adjust based on actual API response, usually requests are in data.requests
            setRequests(response.data.requests || []);
        } catch (error) {
            console.error('Failed to load friend requests:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async (requestId: string) => {
        setProcessingId(requestId);
        try {
            await userAPI.acceptFriendRequest(requestId);
            setRequests(requests.filter(req => req.id !== requestId));
            await loadFriends();
            onRequestHandled?.();
        } catch (error) {
            console.error('Failed to accept request:', error);
        } finally {
            setProcessingId(null);
        }
    };

    const handleDecline = async (requestId: string) => {
        setProcessingId(requestId);
        try {
            await userAPI.declineFriendRequest(requestId);
            setRequests(requests.filter(req => req.id !== requestId));
            onRequestHandled?.();
        } catch (error) {
            console.error('Failed to decline request:', error);
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-background text-foreground border-border" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>Friend Requests</DialogTitle>
                </DialogHeader>

                <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm flex flex-col items-center">
                            <UserCog className="w-8 h-8 opacity-20 mb-2" />
                            You have no pending friend requests.
                        </div>
                    ) : (
                        requests.map((req) => (
                            <div key={req.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-transparent hover:bg-secondary transition-colors">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10 border border-border/50">
                                        <AvatarImage src={req.sender?.avatar} />
                                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                            {req.sender?.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h4 className="font-medium text-sm leading-none">{req.sender?.name || 'Unknown User'}</h4>
                                        <p className="text-xs text-muted-foreground mt-1">wants to be your friend</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="icon"
                                        variant="default"
                                        className="h-8 w-8 rounded-full bg-green-500 hover:bg-green-600 text-white"
                                        onClick={() => handleAccept(req.id)}
                                        disabled={processingId === req.id}
                                    >
                                        {processingId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-8 w-8 rounded-full hover:bg-destructive hover:text-destructive-foreground border-border"
                                        onClick={() => handleDecline(req.id)}
                                        disabled={processingId === req.id}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
