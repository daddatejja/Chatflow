import { useState, useEffect } from 'react';
import { ChatProvider } from '@/context/ChatContext';
import { GroupChatProvider } from '@/context/GroupChatContext';
import { ContactList } from '@/components/chat/ContactList';
import { ChatArea } from '@/components/chat/ChatArea';
import { GroupList } from '@/components/chat/GroupList';
import { GroupChatArea } from '@/components/chat/GroupChatArea';
import { CallModal } from '@/components/call/CallModal';
import { Login } from '@/components/auth/Login';
import { Register } from '@/components/auth/Register';
import { Settings } from '@/components/auth/Settings';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { userAPI, authAPI } from '@/services/api';
import { socketService } from '@/services/socket';
import { UserSearchDialog } from '@/components/chat/UserSearchDialog';
import { FriendRequestsDialog } from '@/components/chat/FriendRequestsDialog';
import { SearchPanel } from '@/components/chat/SearchPanel';
import { CallHistory } from '@/components/call/CallHistory';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { UserPlus, Bell, Shield, Settings as SettingsIcon, LogOut, Sun, Moon, Search, Phone, Menu, ArrowLeft, MoreVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { ThemeProvider } from '@/components/theme-provider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useTheme } from 'next-themes';

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [activeTab, setActiveTab] = useState<'dms' | 'groups'>('dms');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const { theme, setTheme } = useTheme();

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const [profileRes, requestsRes] = await Promise.all([
            userAPI.getProfile(),
            userAPI.getFriendRequests()
          ]);
          setUser(profileRes.data.user);
          setUnreadNotifications(requestsRes.data.requests?.length || 0);
          setIsAuthenticated(true);
          socketService.connect(token);
        } catch (error) {
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  // Listen for real-time notifications
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleNotification = (notification: any) => {
      if (notification.type === 'FRIEND_REQUEST') {
        setUnreadNotifications(prev => prev + 1);
      }
    };

    socketService.onNotification(handleNotification);
    return () => {
      socketService.offNotification(handleNotification);
    };
  }, [isAuthenticated]);

  const handleLogin = (token: string, userData: any) => {
    localStorage.setItem('token', token);
    setUser(userData);
    setIsAuthenticated(true);
    socketService.connect(token);
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('token');
    socketService.disconnect();
    setIsAuthenticated(false);
    setUser(null);
    setShowSettings(false);
    setShowAdmin(false);
    setShowUserSearch(false);
    setShowFriendRequests(false);
    setShowSearch(false);
    setShowCallHistory(false);
  };

  const handleUpdateUser = (updatedUser: any) => {
    setUser({ ...user, ...updatedUser });
  };

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    if (token) {
      localStorage.setItem('token', token);
      window.history.replaceState({}, document.title, window.location.pathname);
      window.location.reload();
    }

    if (error) {
      console.error('OAuth error:', error);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background p-4">
        {showRegister ? (
          <Register
            onRegister={handleLogin}
            onSwitchToLogin={() => setShowRegister(false)}
          />
        ) : (
          <Login
            onLogin={handleLogin}
            onSwitchToRegister={() => setShowRegister(true)}
          />
        )}
        <Toaster position="top-right" />
      </div>
    );
  }

  // Admin Dashboard
  if (showAdmin) {
    return (
      <>
        <AdminDashboard onLogout={() => setShowAdmin(false)} />
        <Toaster position="top-right" />
      </>
    );
  }

  return (
    <ChatProvider>
      <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-card border-b border-border px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-2 sm:gap-6">
            {/* Mobile hamburger / back button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-foreground hover:bg-accent/50 rounded-full"
              onClick={() => setMobileSidebarOpen(prev => !prev)}
            >
              {mobileSidebarOpen ? <ArrowLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h1 className="font-semibold text-lg hidden sm:block">ChatFlow</h1>
            </div>

            {/* Main Navigation Tabs */}
            <div className="flex bg-muted/50 p-1 rounded-lg">
              <Button
                variant={activeTab === 'dms' ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-7 px-3 text-xs ${activeTab === 'dms' ? 'bg-background shadow-sm' : ''}`}
                onClick={() => setActiveTab('dms')}
              >
                Direct Messages
              </Button>
              <Button
                variant={activeTab === 'groups' ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-7 px-3 text-xs ${activeTab === 'groups' ? 'bg-background shadow-sm' : ''}`}
                onClick={() => setActiveTab('groups')}
              >
                Groups
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationCenter />

            {/* Friend Requests */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFriendRequests(true)}
              className="relative text-foreground hover:bg-accent/50 rounded-full"
              title="Friend Requests"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500">
                  {unreadNotifications}
                </Badge>
              )}
            </Button>

            <span className="text-sm font-medium hidden sm:inline-block border-l border-border pl-4 ml-2">{user?.name}</span>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-foreground hover:bg-accent/50 rounded-full"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            {/* Message Search */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSearch(true)}
              className="text-foreground hover:bg-accent/50 rounded-full"
              title="Search Messages"
            >
              <Search className="w-5 h-5" />
            </Button>

            {/* Call History */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowCallHistory(true)}
              className="hidden sm:flex text-foreground hover:bg-accent/50 rounded-full"
              title="Call History"
            >
              <Phone className="w-5 h-5" />
            </Button>

            {/* User Search */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowUserSearch(true)}
              className="hidden sm:flex text-foreground hover:bg-accent/50 rounded-full"
              title="Find Users"
            >
              <UserPlus className="w-5 h-5" />
            </Button>

            {/* Admin Button */}
            {user?.isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAdmin(true)}
                className="hidden sm:flex text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-full"
              >
                <Shield className="w-5 h-5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              className="hidden sm:flex text-foreground hover:bg-accent/50 rounded-full"
            >
              <SettingsIcon className="w-5 h-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="hidden sm:flex text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
            >
              <LogOut className="w-5 h-5" />
            </Button>

            {/* Mobile Dropdown Menu */}
            <div className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-foreground hover:bg-accent/50 rounded-full ml-1">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setShowCallHistory(true)}>
                    <Phone className="w-4 h-4 mr-2" /> Call History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowUserSearch(true)}>
                    <UserPlus className="w-4 h-4 mr-2" /> Find Users
                  </DropdownMenuItem>
                  {user?.isAdmin && (
                    <DropdownMenuItem onClick={() => setShowAdmin(true)} className="text-purple-600 dark:text-purple-400">
                      <Shield className="w-4 h-4 mr-2" /> Admin Dashboard
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    <SettingsIcon className="w-4 h-4 mr-2" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
                    <LogOut className="w-4 h-4 mr-2" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden relative">
          <GroupChatProvider>
            <div className="w-full h-full flex">
              {/* Sidebar - full screen on mobile when open, fixed width on desktop */}
              <div className={`
                ${mobileSidebarOpen ? 'flex' : 'hidden'}
                md:flex
                flex-col
                w-full md:w-80
                shrink-0
                border-r border-border
                absolute md:relative
                inset-0 md:inset-auto
                z-20 md:z-auto
                bg-background
                ${activeTab === 'dms' ? '' : 'hidden md:hidden'}
              `}>
                <ContactList onContactSelect={() => setMobileSidebarOpen(false)} />
              </div>
              <div className={`
                ${mobileSidebarOpen ? 'hidden' : 'flex'}
                md:flex
                flex-col flex-1 min-w-0
                ${activeTab === 'dms' ? '' : 'hidden md:hidden'}
              `}>
                <ChatArea />
              </div>

              <div className={`
                ${mobileSidebarOpen ? 'flex' : 'hidden'}
                md:flex
                flex-col
                w-full md:w-80
                shrink-0
                border-r border-border
                absolute md:relative
                inset-0 md:inset-auto
                z-20 md:z-auto
                bg-background
                ${activeTab === 'groups' ? '' : 'hidden md:hidden'}
              `}>
                <GroupList onGroupSelect={() => setMobileSidebarOpen(false)} />
              </div>
              <div className={`
                ${mobileSidebarOpen ? 'hidden' : 'flex'}
                md:flex
                flex-col flex-1 min-w-0
                ${activeTab === 'groups' ? '' : 'hidden md:hidden'}
              `}>
                <GroupChatArea />
              </div>
            </div>
          </GroupChatProvider>
        </div>
      </div>

      {showSettings && (
        <Settings
          user={user}
          onUpdateUser={handleUpdateUser}
          onLogout={handleLogout}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showSearch && (
        <SearchPanel
          onClose={() => setShowSearch(false)}
          onMessageSelect={(_msgId, _chatId, isGroup) => {
            setActiveTab(isGroup ? 'groups' : 'dms');
          }}
        />
      )}

      {showCallHistory && (
        <CallHistory onClose={() => setShowCallHistory(false)} />
      )}

      <UserSearchDialog open={showUserSearch} onOpenChange={setShowUserSearch} />
      <FriendRequestsDialog
        open={showFriendRequests}
        onOpenChange={(open) => {
          setShowFriendRequests(open);
          if (!open) {
            // Re-fetch to update badge count
            userAPI.getFriendRequests().then(res => {
              setUnreadNotifications(res.data.requests?.length || 0);
            }).catch(console.error);
          }
        }}
        onRequestHandled={() => {
          userAPI.getFriendRequests().then(res => {
            setUnreadNotifications(res.data.requests?.length || 0);
          }).catch(console.error);
        }}
      />
      <CallModal />
      <Toaster position="top-right" />
    </ChatProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme" attribute="class">
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
