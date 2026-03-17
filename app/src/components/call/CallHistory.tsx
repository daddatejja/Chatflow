import { useState, useEffect } from "react";
import { formatTime } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { callAPI } from "@/services/api";
import { Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing, Video, X } from "lucide-react";
import { useChat } from "@/context/ChatContext";

export function CallHistory({ onClose }: { onClose: () => void }) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const { currentUser, startCall, selectChat, users } = useChat();

    const loadHistory = async (loadMore = false) => {
        try {
            const currentCursor = loadMore && cursor ? cursor : undefined;
            const res = await callAPI.getHistory(currentCursor);

            const newLogs = res.data?.calls || [];
            if (newLogs.length > 0) {
                setLogs(prev => loadMore ? [...prev, ...newLogs] : newLogs);
            }

            setHasMore(!!res.data?.nextCursor);
            setCursor(res.data?.nextCursor || null);
        } catch (e) {
            console.error('Failed to load call history', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    const handleCallBack = (userId: string, type: 'audio' | 'video') => {
        const userToCall = users.find(u => u.id === userId);
        if (!userToCall) return;

        selectChat(userToCall);
        startCall(type);
        onClose();
    };

    const getCallIcon = (log: any) => {
        const isMissed = log.status === 'MISSED';
        const isOutgoing = log.callerId === currentUser?.id;

        if (isMissed) {
            return <PhoneMissed className="w-5 h-5 text-red-500" />;
        }
        if (isOutgoing) {
            return <PhoneOutgoing className="w-5 h-5 text-green-500" />;
        }
        return <PhoneIncoming className="w-5 h-5 text-blue-500" />;
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m === 0) return `${s}s`;
        return `${m}m ${s}s`;
    };

    return (
        <div className="absolute inset-y-0 right-0 w-full sm:w-80 bg-card border-l border-border shadow-2xl flex flex-col z-40 animate-in slide-in-from-right-8 duration-300">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    Call History
                </h2>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                    <X className="w-5 h-5" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                {loading && !logs.length ? (
                    <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        <p className="text-sm mt-2">Loading history...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <Phone className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No recent calls</p>
                    </div>
                ) : (
                    <div className="p-3 flex flex-col gap-2">
                        {logs.map((log) => {
                            const isOutgoing = log.callerId === currentUser?.id;
                            const peerInfo = isOutgoing ? log.receiver : log.caller;
                            const isMissed = log.status === 'MISSED';
                            const date = new Date(log.createdAt);

                            return (
                                <div key={log.id} className="p-3 rounded-lg hover:bg-accent/50 group transition-colors border border-transparent hover:border-border">
                                    <div className="flex items-start gap-3">
                                        <Avatar className="w-10 h-10 ring-1 ring-border mt-0.5">
                                            <AvatarImage src={peerInfo?.avatar} />
                                            <AvatarFallback className="bg-primary/10 text-primary uppercase">
                                                {peerInfo?.name?.substring(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className={`font-medium truncate pr-2 ${isMissed ? 'text-red-500' : ''}`}>
                                                    {peerInfo?.name || 'Unknown User'}
                                                </span>
                                                <span className="text-xs text-muted-foreground whitespace-nowrap whitespace-nowrap">
                                                    {formatTime(date)}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                {getCallIcon(log)}
                                                <span>{log.callType === 'VIDEO' ? 'Video' : 'Audio'}</span>
                                                {log.duration > 0 && (
                                                    <>
                                                        <span className="opacity-50">•</span>
                                                        <span>{formatDuration(log.duration)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {peerInfo && (
                                        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="h-8 rounded-full px-3 text-xs"
                                                onClick={() => handleCallBack(peerInfo.id, 'audio')}
                                            >
                                                <Phone className="w-3.5 h-3.5 mr-1.5" /> Voice
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="h-8 rounded-full px-3 text-xs"
                                                onClick={() => handleCallBack(peerInfo.id, 'video')}
                                            >
                                                <Video className="w-3.5 h-3.5 mr-1.5" /> Video
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {hasMore && (
                            <Button
                                variant="ghost"
                                className="w-full mt-2 text-muted-foreground"
                                onClick={() => loadHistory(true)}
                                disabled={loading}
                            >
                                {loading ? 'Loading...' : 'Load more logs'}
                            </Button>
                        )}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
