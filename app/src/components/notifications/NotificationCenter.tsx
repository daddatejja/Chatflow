import { useState, useEffect } from 'react';
import { Bell, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTime } from '@/lib/utils';
// Temporarily aliasing this or using local api fetch
import api from '@/services/api';
import { socketService } from '@/services/socket';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function NotificationCenter() {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const { showNotification, requestPermission, permission } = useBrowserNotifications();

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            setNotifications(res.data.notifications || []);
        } catch (e) {
            console.error('Failed to fetch notifications', e);
        }
    };

    useEffect(() => {
        // Attempt to request permission silently if default, but browsers usually block this.
        // So we just check permission. User can enable manually if needed.
        if (permission === 'default') {
            requestPermission();
        }
    }, [permission, requestPermission]);

    useEffect(() => {
        fetchNotifications();

        const handleNewNotification = (notification: any) => {
            setNotifications(prev => [notification, ...prev]);
            showNotification(notification.title, {
                body: notification.body,
                tag: notification.id
            });
        };



        // socket.ts emits event 'notification:receive'. We bind handleNewNotification there.
        // For updates (like marks as read), the backend might not emit a specific socket event yet, or we could poll.
        socketService.onNotification(handleNewNotification);

        return () => {
            socketService.offNotification(handleNewNotification);
        };
    }, [showNotification]);

    const unreadCount = notifications.filter(n => !n.read).length;

    const markAsRead = async (id: string) => {
        try {
            await api.patch(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch {
            toast.error('Failed to mark as read');
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.patch('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch {
            toast.error('Failed to mark all as read');
        }
    };

    const deleteNotification = async (id: string) => {
        try {
            await api.delete(`/notifications/${id}`);
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch {
            toast.error('Failed to delete notification');
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative text-foreground hover:bg-accent/50 rounded-full"
                    title="Notifications"
                >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-primary">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-80 p-0 mr-4 mt-2" align="end" sideOffset={8}>
                <div className="flex items-center justify-between p-4 border-b border-border bg-card">
                    <h4 className="font-semibold flex items-center gap-2">
                        <Bell className="w-4 h-4 text-primary" /> Notifications
                    </h4>
                    {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-auto py-1 px-2 text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Mark all read
                        </Button>
                    )}
                </div>

                <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                            <Bell className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-sm">No notifications yet</p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {notifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    className={`p-4 border-b border-border/50 group flex gap-3 transition-colors ${notif.read ? 'bg-background' : 'bg-primary/5'
                                        }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm ${notif.read ? 'text-foreground/80' : 'font-semibold text-foreground'}`}>
                                            {notif.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {notif.body}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-2">
                                            {formatTime(notif.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex flex-col justify-start opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                                        {!notif.read && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="w-6 h-6 hover:bg-primary/10 hover:text-primary"
                                                onClick={() => markAsRead(notif.id)}
                                                title="Mark as read"
                                            >
                                                <CheckCircle2 className="w-3 h-3" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="w-6 h-6 hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => deleteNotification(notif.id)}
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
