import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@/types';
import { userAPI } from '@/services/api';
import { toast } from 'sonner';

interface AuthContextType {
  currentUser: User | null;
  blockedUsers: User[];
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const [profileRes, blockedRes] = await Promise.all([
          userAPI.getProfile(),
          userAPI.getBlockedUsers()
        ]);
        const user = profileRes.data.user;
        setCurrentUser({ ...user, status: (user.status || 'OFFLINE').toLowerCase() });
        setBlockedUsers(blockedRes.data.blockedUsers || []);
      } catch (error) {
        console.error('Failed to load auth user data:', error);
      }
    };
    loadUserData();
  }, []);

  const blockUser = useCallback(async (userId: string) => {
    try {
      await userAPI.blockUser(userId);
      setBlockedUsers(prev => {
        // We might not have the full user object to add, but we need to track it.
        // Usually the backend returns it or we just refetch. Let's refetch to be safe.
        userAPI.getBlockedUsers().then(res => setBlockedUsers(res.data.blockedUsers || []));
        return prev;
      });
      toast.success('User blocked successfully');
    } catch (error: any) {
      console.error('Failed to block user:', error);
      toast.error(error.response?.data?.error || 'Failed to block user');
    }
  }, []);

  const unblockUser = useCallback(async (userId: string) => {
    try {
      await userAPI.unblockUser(userId);
      setBlockedUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('User unblocked successfully');
    } catch (error: any) {
      console.error('Failed to unblock user:', error);
      toast.error(error.response?.data?.error || 'Failed to unblock user');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, blockedUsers, blockUser, unblockUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
