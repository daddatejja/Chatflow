import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/types';
import { userAPI } from '@/services/api';
import { socketService } from '@/services/socket';
import { toast } from 'sonner';

interface FriendsContextType {
  users: User[];
  loadFriends: () => Promise<void>;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);

  const loadFriends = useCallback(async () => {
    try {
      const usersRes = await userAPI.getFriends();
      const friends = (usersRes.data.friends ?? []).map((f: any) => ({
        ...f,
        status: (f.status || 'OFFLINE').toLowerCase(),
      }));
      setUsers(friends);
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    const handleStatus = ({ userId, status }: { userId: string; status: string }) => {
      const normalized = status.toLowerCase() as any;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: normalized } : u));
    };

    const handleFriend = (data: any) => {
      if (data.type === 'accepted') {
        loadFriends();
        toast.success(`${data.friend?.name || 'Someone'} accepted your friend request!`);
      }
    };

    socketService.onStatus(handleStatus);
    socketService.onFriend(handleFriend);

    return () => {
      socketService.offStatus(handleStatus);
      socketService.offFriend(handleFriend);
    };
  }, [loadFriends]);

  return (
    <FriendsContext.Provider value={{ users, loadFriends }}>
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (context === undefined) {
    throw new Error('useFriends must be used within a FriendsProvider');
  }
  return context;
}
