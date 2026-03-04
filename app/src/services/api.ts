import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),

  login: (email: string, password: string, mfaCode?: string) =>
    api.post('/auth/login', { email, password, mfaCode }),

  logout: () => api.post('/auth/logout'),
  logoutAll: () => api.post('/auth/logout-all'),

  setupMFA: () => api.post('/auth/mfa/setup'),
  verifyMFA: (code: string) => api.post('/auth/mfa/verify', { code }),
  disableMFA: (code: string) => api.post('/auth/mfa/disable', { code }),

  googleLogin: () => {
    window.location.href = `${API_URL}/auth/google`;
  },

  githubLogin: () => {
    window.location.href = `${API_URL}/auth/github`;
  },

  // Password reset
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),

  // Email verification
  sendVerification: () => api.post('/auth/send-verification'),
  verifyEmail: (token: string) =>
    api.post('/auth/verify-email', { token }),
};

// Passkey API
export const passkeyAPI = {
  getRegisterOptions: () => api.post('/passkeys/register/options'),
  verifyRegister: (credential: any) => api.post('/passkeys/register/verify', credential),
  getAuthOptions: (email: string) => api.post('/passkeys/auth/options', { email }),
  verifyAuth: (credential: any) => api.post('/passkeys/auth/verify', credential),
  getPasskeys: () => api.get('/passkeys'),
  deletePasskey: (passkeyId: string) => api.delete(`/passkeys/${passkeyId}`)
};

// Session API
export const sessionAPI = {
  getSessions: () => api.get('/sessions'),
  revokeSession: (sessionId: string) => api.delete(`/sessions/${sessionId}`),
  revokeOtherSessions: () => api.delete('/sessions')
};

// User API
export const userAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (name: string, bio?: string) => api.patch('/users/profile', { name, bio }),
  updateAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  generateAvatar: (prompt?: string) => api.post('/users/avatar/generate', { prompt }),
  randomAvatar: () => api.post('/users/avatar/random'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/users/change-password', { currentPassword, newPassword }),
  searchUsers: (query: string) => api.get('/users/search', { params: { query } }),
  getUser: (userId: string) => api.get(`/users/${userId}`),

  // Friends
  getFriends: () => api.get('/users/friends'),
  getFriendRequests: () => api.get('/users/friends/requests'),
  sendFriendRequest: (userId: string) => api.post('/users/friends/request', { userId }),
  acceptFriendRequest: (requestId: string) => api.post(`/users/friends/requests/${requestId}/accept`),
  declineFriendRequest: (requestId: string) => api.post(`/users/friends/requests/${requestId}/decline`),
  removeFriend: (friendId: string) => api.delete(`/users/friends/${friendId}`),

  // Blocking
  getBlockedUsers: () => api.get('/users/block/list'),
  blockUser: (userId: string) => api.post('/users/block', { userId }),
  unblockUser: (userId: string) => api.delete(`/users/block/${userId}`)
};

// Group API
export const groupAPI = {
  createGroup: (data: { name: string; description?: string; isPrivate?: boolean; memberIds?: string[] }) =>
    api.post('/groups', data),
  getMyGroups: () => api.get('/groups'),
  getGroup: (groupId: string) => api.get(`/groups/${groupId}`),
  updateGroup: (groupId: string, data: { name?: string; description?: string; avatar?: string }) =>
    api.patch(`/groups/${groupId}`, data),
  deleteGroup: (groupId: string) => api.delete(`/groups/${groupId}`),
  joinGroup: (inviteCode: string) => api.post('/groups/join', { inviteCode }),
  addMember: (groupId: string, userId: string) => api.post(`/groups/${groupId}/members`, { userId }),
  removeMember: (groupId: string, userId: string) => api.delete(`/groups/${groupId}/members/${userId}`),
  updateMemberRole: (groupId: string, userId: string, role: 'ADMIN' | 'MEMBER') =>
    api.patch(`/groups/${groupId}/members/${userId}/role`, { role }),
  leaveGroup: (groupId: string) => api.post(`/groups/${groupId}/leave`),
  regenerateInviteCode: (groupId: string) => api.post(`/groups/${groupId}/regenerate-invite`)
};

// Message API
export const messageAPI = {
  getMessages: (userId: string, page?: number, limit?: number, cursor?: string | null) =>
    api.get(`/messages/${userId}`, { params: { page, limit, cursor } }),
  sendMessage: (receiverId: string, content: string, type?: string, duration?: number, replyToId?: string) =>
    api.post('/messages', { receiverId, content, type, duration, replyToId }),
  editMessage: (messageId: string, content: string) =>
    api.patch(`/messages/${messageId}`, { content }),
  deleteMessage: (messageId: string) => api.delete(`/messages/${messageId}`),
  getUnreadCounts: () => api.get('/messages/unread'),
  markAsRead: (userId: string) => api.patch(`/messages/${userId}/read`),

  // File/Voice/Video upload
  uploadMedia: (file: Blob | File, type: 'voice' | 'video' | 'image' | 'file', receiverId: string, duration?: number, fileName?: string) => {
    const formData = new FormData();
    formData.append('file', file, fileName || 'recording');
    formData.append('receiverId', receiverId);
    formData.append('type', type.toUpperCase());
    if (duration !== undefined) formData.append('duration', String(duration));
    return api.post('/messages/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Reactions
  addReaction: (messageId: string, emoji: string) =>
    api.post(`/messages/${messageId}/reactions`, { emoji }),
  removeReaction: (messageId: string, emoji: string) =>
    api.delete(`/messages/${messageId}/reactions`, { data: { emoji } }),

  // Thread replies
  addThreadReply: (messageId: string, content: string) =>
    api.post(`/messages/${messageId}/replies`, { content }),

  // File/Voice/Video upload (group)
  uploadGroupMedia: (file: Blob | File, type: string, groupId: string, duration?: number, fileName?: string) => {
    const formData = new FormData();
    formData.append('file', file, fileName || 'recording');
    formData.append('groupId', groupId);
    formData.append('type', type.toUpperCase());
    if (duration !== undefined) formData.append('duration', String(duration));
    return api.post('/messages/upload/group', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Search messages
  searchMessages: (query: string, userId?: string) =>
    api.get('/messages/search', { params: { q: query, userId } }),

  // Group messages
  getGroupMessages: (groupId: string, page?: number, limit?: number, cursor?: string | null) =>
    api.get(`/messages/group/${groupId}`, { params: { page, limit, cursor } }),
  sendGroupMessage: (groupId: string, content: string, type?: string, duration?: number) =>
    api.post(`/messages/group/${groupId}`, { content, type, duration }),
  addGroupReaction: (groupId: string, messageId: string, emoji: string) =>
    api.post(`/messages/group/${groupId}/${messageId}/reactions`, { emoji })
};

// Notification API
export const notificationAPI = {
  getNotifications: (page?: number, limit?: number, unreadOnly?: boolean) =>
    api.get('/notifications', { params: { page, limit, unreadOnly } }),
  markAsRead: (notificationId: string) =>
    api.patch(`/notifications/${notificationId}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  deleteNotification: (notificationId: string) =>
    api.delete(`/notifications/${notificationId}`)
};

// Admin API
export const adminAPI = {
  getDashboardStats: () => api.get('/admin/dashboard'),
  getUsers: (page?: number, limit?: number, search?: string) =>
    api.get('/admin/users', { params: { page, limit, search } }),
  getUserDetails: (userId: string) => api.get(`/admin/users/${userId}`),
  updateUser: (userId: string, data: any) => api.patch(`/admin/users/${userId}`, data),
  deleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),
  getGroups: (page?: number, limit?: number, search?: string) =>
    api.get('/admin/groups', { params: { page, limit, search } }),
  deleteGroup: (groupId: string) => api.delete(`/admin/groups/${groupId}`),
  getLogs: (page?: number, limit?: number) =>
    api.get('/admin/logs', { params: { page, limit } }),
  updateSystemSettings: (settings: any) => api.patch('/admin/settings', settings),
  broadcast: (title: string, body: string, type?: string) =>
    api.post('/admin/broadcast', { title, body, type }),
  // Notifications
  getNotifications: () => api.get('/notifications'),
  markNotificationAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllNotificationsAsRead: () => api.patch('/notifications/read-all'),
  deleteNotification: (id: string) => api.delete(`/notifications/${id}`)
};

// Call API
export const callAPI = {
  getHistory: (cursor?: string) => api.get('/calls/history', { params: { cursor } })
};

// Poll API
export const pollAPI = {
  createPoll: (data: { messageId: string; question: string; options: string[]; isMultiple?: boolean; isAnonymous?: boolean; endsAt?: string }) =>
    api.post('/polls', data),
  votePoll: (pollId: string, optionIds: string[]) =>
    api.post('/polls/vote', { pollId, optionIds }),
  getPoll: (pollId: string) => api.get(`/polls/${pollId}`)
};

export default api;
