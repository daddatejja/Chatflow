import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { FriendsProvider, useFriends } from './FriendsContext';
import { MessageProvider, useMessage } from './MessageContext';
import { CallProvider, useCall } from './CallContext';

/**
 * Composite provider that wraps the application in all the focused providers.
 * Preserves the original ChatProvider interface for App.tsx.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <FriendsProvider>
        <MessageProvider>
          <CallProvider>
            {children}
          </CallProvider>
        </MessageProvider>
      </FriendsProvider>
    </AuthProvider>
  );
}

/**
 * Composite hook that merges all 4 split contexts.
 * Preserves backward compatibility with the ~20 components that use `useChat()`.
 * Components can gradually migrate to using `useAuth()`, `useMessage()`, etc. directly.
 */
export function useChat() {
  const auth = useAuth();
  const friends = useFriends();
  const msg = useMessage();
  const call = useCall();
  
  return { 
    ...auth, 
    ...friends, 
    ...msg, 
    ...call 
  };
}
