import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Group, GroupMessage, MessageType } from '@/types';
import { groupAPI, messageAPI } from '@/services/api';
import { socketService } from '@/services/socket';
import { toast } from 'sonner';

function normalizeGroupMessage(raw: any): GroupMessage {
    return {
        ...raw,
        type: (raw.type || 'TEXT').toLowerCase() as MessageType,
        timestamp: new Date(raw.createdAt || raw.timestamp || Date.now()),
        reactions: raw.reactions || [],
        sender: raw.sender || raw.senderUser,
    };
}

interface GroupChatContextType {
    groups: Group[];
    selectedGroup: Group | null;
    groupMessages: GroupMessage[];
    groupTyping: Record<string, { userId: string; name: string }>;
    groupUnreadCounts: Record<string, number>;
    lastGroupMessages: Record<string, GroupMessage>;
    selectGroup: (group: Group | null) => void;
    loadGroups: () => Promise<void>;
    loadGroupMessages: (groupId: string) => Promise<void>;
    sendGroupMessage: (content: string, type: MessageType, duration?: number, replyToId?: string) => void;
    sendGroupMediaMessage: (blob: Blob, type: 'voice' | 'video', duration: number) => Promise<void>;
    sendGroupFileMessage: (file: File) => Promise<void>;
    addGroupReaction: (messageId: string, emoji: string) => void;
    createGroup: (data: { name: string; description?: string; isPrivate?: boolean; memberIds?: string[] }) => Promise<Group | null>;
    updateGroup: (groupId: string, data: { name?: string; description?: string }) => Promise<void>;
    deleteGroup: (groupId: string) => Promise<void>;
    leaveGroup: (groupId: string) => Promise<void>;
    addMember: (groupId: string, userId: string) => Promise<void>;
    removeMember: (groupId: string, userId: string) => Promise<void>;
    regenerateInviteCode: (groupId: string) => Promise<void>;
    hasMore: boolean;
    isLoadingMore: boolean;
    loadEarlierMessages: () => Promise<void>;
}

const GroupChatContext = createContext<GroupChatContextType | undefined>(undefined);

export function GroupChatProvider({ children }: { children: React.ReactNode }) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
    const [groupTyping, setGroupTyping] = useState<Record<string, { userId: string; name: string }>>({});
    const [groupUnreadCounts, setGroupUnreadCounts] = useState<Record<string, number>>({});
    const [lastGroupMessages, setLastGroupMessages] = useState<Record<string, GroupMessage>>({});
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [cursor, setCursor] = useState<string | null>(null);

    const selectedGroupRef = useRef<Group | null>(null);
    useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);

    const loadGroups = useCallback(async () => {
        try {
            const res = await groupAPI.getMyGroups();
            const raw = res.data.groups || [];
            setGroups(raw.map((g: any) => ({
                ...g,
                members: (g.members || []).map((m: any) => ({
                    ...m,
                    user: { ...m.user, status: (m.user.status || 'OFFLINE').toLowerCase() }
                }))
            })));
        } catch (e) { console.error('Failed to load groups:', e); }
    }, []);

    const loadGroupMessages = useCallback(async (groupId: string) => {
        try {
            setHasMore(false);
            setCursor(null);
            const res = await messageAPI.getGroupMessages(groupId);
            const msgs = (res.data.messages || []).map(normalizeGroupMessage);
            setGroupMessages(msgs);
            if (msgs.length > 0) setLastGroupMessages(prev => ({ ...prev, [groupId]: msgs[msgs.length - 1] }));
            setGroupUnreadCounts(prev => ({ ...prev, [groupId]: 0 }));
            setHasMore(res.data.pagination?.hasMore || false);
            setCursor(res.data.pagination?.cursor || null);
        } catch (e) { console.error('Failed to load group messages:', e); }
    }, []);

    const loadEarlierMessages = useCallback(async () => {
        const group = selectedGroupRef.current;
        if (!group || isLoadingMore || !hasMore || !cursor) return;
        try {
            setIsLoadingMore(true);
            const res = await messageAPI.getGroupMessages(group.id, undefined, undefined, cursor);
            const msgs = (res.data.messages || []).map(normalizeGroupMessage);
            setGroupMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const newMsgs = msgs.filter((m: GroupMessage) => !existingIds.has(m.id));
                return [...newMsgs, ...prev];
            });
            setHasMore(res.data.pagination?.hasMore || false);
            setCursor(res.data.pagination?.cursor || null);
        } catch (e) {
            console.error('Failed to load earlier messages:', e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMore, cursor]);

    // Socket group events
    useEffect(() => {
        const handleGroupMessage = (raw: any) => {
            const message = normalizeGroupMessage(raw);
            const selected = selectedGroupRef.current;
            setGroupMessages(prev => {
                if (selected?.id !== message.groupId) return prev;
                if (prev.some(m => m.id === message.id)) return prev;
                return [...prev, message];
            });
            setLastGroupMessages(prev => ({ ...prev, [message.groupId]: message }));
            if (selected?.id !== message.groupId) {
                setGroupUnreadCounts(prev => ({ ...prev, [message.groupId]: (prev[message.groupId] || 0) + 1 }));
                const grp = groups.find(g => g.id === message.groupId);
                if (grp) toast.message(`${grp.name}`, { description: `${message.sender?.name || 'Someone'}: ${message.type === 'text' ? message.content : `Sent a ${message.type}`}` });
            }
        };

        const handleGroupTyping = (data: any) => {
            const key = `${data.groupId}:${data.userId}`;
            setGroupTyping(prev => ({ ...prev, [key]: { userId: data.userId, name: data.userName || 'Someone' } }));
            setTimeout(() => setGroupTyping(prev => { const copy = { ...prev }; delete copy[key]; return copy; }), 3000);
        };

        socketService.onGroupMessage(handleGroupMessage);
        socketService.onGroupTyping(handleGroupTyping);
        return () => {
            socketService.offGroupMessage(handleGroupMessage);
            socketService.offGroupTyping(handleGroupTyping);
        };
    }, [groups]);

    // Join socket rooms when groups load
    useEffect(() => {
        groups.forEach(g => socketService.joinGroup(g.id));
        return () => { groups.forEach(g => socketService.leaveGroup(g.id)); };
    }, [groups]);

    const selectGroup = useCallback((group: Group | null) => {
        setSelectedGroup(group);
        if (group) loadGroupMessages(group.id);
        else setGroupMessages([]);
    }, [loadGroupMessages]);

    const sendGroupMessage = useCallback(async (content: string, type: MessageType, duration?: number, replyToId?: string) => {
        const group = selectedGroupRef.current;
        if (!group) return;
        try {
            await socketService.sendGroupMessage(group.id, content, type, duration, replyToId);
        } catch {
            toast.error('Failed to send message');
        }
    }, []);

    const sendGroupMediaMessage = useCallback(async (blob: Blob, type: 'voice' | 'video', duration: number) => {
        const group = selectedGroupRef.current;
        if (!group) return;
        try {
            const ext = 'webm'; const fileName = `${type}-${Date.now()}.${ext}`;
            const response = await messageAPI.uploadGroupMedia(blob, type, group.id, duration, fileName);
            const msg = normalizeGroupMessage(response.data.message);
            setGroupMessages(prev => [...prev, msg]);
            setLastGroupMessages(prev => ({ ...prev, [group.id]: msg }));
        } catch { toast.error('Failed to send media'); }
    }, []);

    const sendGroupFileMessage = useCallback(async (file: File) => {
        const group = selectedGroupRef.current;
        if (!group) return;
        try {
            const type = file.type.startsWith('image/') ? 'image' as const : 'file' as const;
            const response = await messageAPI.uploadGroupMedia(file, type, group.id, undefined, file.name);
            const msg = normalizeGroupMessage(response.data.message);
            setGroupMessages(prev => [...prev, msg]);
            setLastGroupMessages(prev => ({ ...prev, [group.id]: msg }));
        } catch { toast.error('Failed to send file'); }
    }, []);

    const addGroupReaction = useCallback((messageId: string, emoji: string) => {
        socketService.emitReaction(messageId, emoji, 'add');
    }, []);

    const createGroup = useCallback(async (data: any) => {
        try {
            const res = await groupAPI.createGroup(data);
            const group = res.data.group;
            setGroups(prev => [group, ...prev]);
            socketService.joinGroup(group.id);
            toast.success(`Group "${group.name}" created!`);
            return group;
        } catch { toast.error('Failed to create group'); return null; }
    }, []);

    const updateGroup = useCallback(async (groupId: string, data: any) => {
        try {
            const res = await groupAPI.updateGroup(groupId, data);
            const updated = res.data.group;
            setGroups(prev => prev.map(g => g.id === groupId ? { ...g, ...updated } : g));
            setSelectedGroup(prev => prev?.id === groupId ? { ...prev, ...updated } : prev);
        } catch { toast.error('Failed to update group'); }
    }, []);

    const deleteGroup = useCallback(async (groupId: string) => {
        try {
            await groupAPI.deleteGroup(groupId);
            setGroups(prev => prev.filter(g => g.id !== groupId));
            if (selectedGroupRef.current?.id === groupId) setSelectedGroup(null);
            toast.success('Group deleted');
        } catch { toast.error('Failed to delete group'); }
    }, []);

    const leaveGroup = useCallback(async (groupId: string) => {
        try {
            await groupAPI.leaveGroup(groupId);
            setGroups(prev => prev.filter(g => g.id !== groupId));
            if (selectedGroupRef.current?.id === groupId) setSelectedGroup(null);
            toast.success('Left group');
        } catch { toast.error('Failed to leave group'); }
    }, []);

    const addMember = useCallback(async (groupId: string, userId: string) => {
        try {
            await groupAPI.addMember(groupId, userId);
            await loadGroups();
            toast.success('Member added');
        } catch { toast.error('Failed to add member'); }
    }, [loadGroups]);

    const removeMember = useCallback(async (groupId: string, userId: string) => {
        try {
            await groupAPI.removeMember(groupId, userId);
            setGroups(prev => prev.map(g => g.id === groupId ? { ...g, members: g.members.filter(m => m.userId !== userId) } : g));
            toast.success('Member removed');
        } catch { toast.error('Failed to remove member'); }
    }, []);

    const regenerateInviteCode = useCallback(async (groupId: string) => {
        try {
            const res = await groupAPI.regenerateInviteCode(groupId);
            const { inviteCode } = res.data;
            setGroups(prev => prev.map(g => g.id === groupId ? { ...g, inviteCode } : g));
            setSelectedGroup(prev => prev?.id === groupId ? { ...prev, inviteCode } : prev);
            toast.success('Invite code regenerated');
        } catch { toast.error('Failed to regenerate code'); }
    }, []);

    useEffect(() => { loadGroups(); }, [loadGroups]);

    return (
        <GroupChatContext.Provider value={{
            groups, selectedGroup, groupMessages, groupTyping, groupUnreadCounts, lastGroupMessages,
            selectGroup, loadGroups, loadGroupMessages,
            sendGroupMessage, sendGroupMediaMessage, sendGroupFileMessage, addGroupReaction,
            createGroup, updateGroup, deleteGroup, leaveGroup, addMember, removeMember, regenerateInviteCode,
            hasMore, isLoadingMore, loadEarlierMessages
        }}>
            {children}
        </GroupChatContext.Provider>
    );
}

export function useGroupChat() {
    const ctx = useContext(GroupChatContext);
    if (!ctx) throw new Error('useGroupChat must be used within GroupChatProvider');
    return ctx;
}
