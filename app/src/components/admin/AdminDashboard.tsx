import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  MessageSquare,
  UserCheck,
  Activity,
  TrendingUp,
  BarChart3,
  LogOut,
  Shield
} from 'lucide-react';
import api from '@/services/api';
import { toast } from 'sonner';

interface DashboardStats {
  stats: {
    totalUsers: number;
    onlineUsers: number;
    totalGroups: number;
    totalMessages: number;
    todayMessages: number;
    newUsersToday: number;
    activeSessions: number;
  };
  charts: {
    messagesPerDay: { date: string; count: number }[];
    usersPerDay: { date: string; count: number }[];
  };
}

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const response = await api.get('/admin/dashboard');
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">ChatFlow Administration</p>
            </div>
          </div>
          <Button variant="outline" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Exit Admin
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="logs">Admin Logs</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Users"
                value={stats?.stats.totalUsers || 0}
                icon={<Users className="w-5 h-5" />}
                trend={`+${stats?.stats.newUsersToday || 0} today`}
                trendUp={true}
              />
              <StatCard
                title="Online Users"
                value={stats?.stats.onlineUsers || 0}
                icon={<UserCheck className="w-5 h-5" />}
                subtitle="Currently active"
              />
              <StatCard
                title="Total Messages"
                value={stats?.stats.totalMessages || 0}
                icon={<MessageSquare className="w-5 h-5" />}
                trend={`+${stats?.stats.todayMessages || 0} today`}
                trendUp={true}
              />
              <StatCard
                title="Active Sessions"
                value={stats?.stats.activeSessions || 0}
                icon={<Activity className="w-5 h-5" />}
                subtitle="Across all devices"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Messages (Last 7 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats?.charts.messagesPerDay.map((day) => (
                      <div key={day.date} className="flex items-center gap-4">
                        <span className="w-24 text-sm text-gray-500">
                          {new Date(day.date).toLocaleDateString()}
                        </span>
                        <div className="flex-1 h-8 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (day.count / (Math.max(...stats.charts.messagesPerDay.map(d => d.count)) || 1)) * 100)}%`
                            }}
                          />
                        </div>
                        <span className="w-16 text-sm font-medium text-right">
                          {day.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    New Users (Last 7 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats?.charts.usersPerDay.map((day) => (
                      <div key={day.date} className="flex items-center gap-4">
                        <span className="w-24 text-sm text-gray-500">
                          {new Date(day.date).toLocaleDateString()}
                        </span>
                        <div className="flex-1 h-8 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (day.count / (Math.max(...stats.charts.usersPerDay.map(d => d.count)) || 1)) * 100)}%`
                            }}
                          />
                        </div>
                        <span className="w-16 text-sm font-medium text-right">
                          {day.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <UsersManagement />
          </TabsContent>

          <TabsContent value="groups">
            <GroupsManagement />
          </TabsContent>

          <TabsContent value="logs">
            <AdminLogs />
          </TabsContent>

          <TabsContent value="settings">
            <SystemSettings />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  trend,
  trendUp,
  subtitle
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            {icon}
          </div>
          {trend && (
            <Badge variant={trendUp ? 'default' : 'secondary'} className="text-xs">
              {trend}
            </Badge>
          )}
        </div>
        <div className="mt-4">
          <p className="text-3xl font-bold">{value.toLocaleString()}</p>
          <p className="text-sm text-gray-500">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// Users Management Component
function UsersManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [page] = useState(1);
  const [, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users', {
        params: { page, limit: 20, search }
      });
      setUsers(response.data.users);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await api.delete(`/admin/users/${userId}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const handleToggleBan = async (user: any) => {
    if (!confirm(`Are you sure you want to ${user.isBanned ? 'unban' : 'ban'} ${user.name}?`)) return;
    try {
      await api.put(`/admin/users/${user.id}`, { isBanned: !user.isBanned });
      toast.success(user.isBanned ? 'User unbanned' : 'User banned');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update user status');
    }
  };

  const handleToggleAdmin = async (user: any) => {
    if (!confirm(`Are you sure you want to ${user.isAdmin ? 'remove admin rights from' : 'grant admin rights to'} ${user.name}?`)) return;
    try {
      await api.put(`/admin/users/${user.id}`, { isAdmin: !user.isAdmin });
      toast.success(user.isAdmin ? 'Admin rights removed' : 'Admin rights granted');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update admin status');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>Manage all registered users</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
        <ScrollArea className="h-[500px]">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Joined</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatar || '/default-avatar.png'}
                        alt={user.name}
                        className="w-10 h-10 rounded-full"
                      />
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div>
                        <Badge variant={user.status === 'ONLINE' ? 'default' : 'secondary'}>
                          {user.status}
                        </Badge>
                        {user.isAdmin && (
                          <Badge className="ml-2 bg-purple-500">Admin</Badge>
                        )}
                      </div>
                      {user.isBanned && (
                        <div><Badge variant="destructive">Banned</Badge></div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={user.isBanned ? "outline" : "secondary"}
                        size="sm"
                        onClick={() => handleToggleBan(user)}
                      >
                        {user.isBanned ? 'Unban' : 'Ban'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleAdmin(user)}
                      >
                        {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Groups Management Component
function GroupsManagement() {
  const [groups, setGroups] = useState<any[]>([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await api.get('/admin/groups');
      setGroups(response.data.groups);
    } catch (error) {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      await api.delete(`/admin/groups/${groupId}`);
      toast.success('Group deleted');
      fetchGroups();
    } catch (error) {
      toast.error('Failed to delete group');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group Management</CardTitle>
        <CardDescription>Manage all groups</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <img
                    src={group.avatar || '/default-group.png'}
                    alt={group.name}
                    className="w-12 h-12 rounded-lg"
                  />
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-sm text-gray-500">
                      Owner: {group.owner.name} • {group._count.members} members • {group._count.messages} messages
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteGroup(group.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Admin Logs Component
function AdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await api.get('/admin/logs');
      setLogs(response.data.logs);
    } catch (error) {
      toast.error('Failed to load logs');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin Logs</CardTitle>
        <CardDescription>Audit trail of admin actions</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="p-3 border rounded-lg text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{log.action}</span>
                  <span className="text-gray-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-600 mt-1">
                  By: {log.admin?.name || 'Unknown'} • Entity: {log.entityType}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// System Settings Component
function SystemSettings() {
  const [broadcastMessage, setBroadcastMessage] = useState('');

  const handleBroadcast = async () => {
    try {
      await api.post('/admin/broadcast', {
        title: 'System Announcement',
        body: broadcastMessage
      });
      toast.success('Broadcast sent');
      setBroadcastMessage('');
    } catch (error) {
      toast.error('Failed to send broadcast');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Settings</CardTitle>
        <CardDescription>Configure system-wide settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="font-medium mb-2">Broadcast Message</h3>
          <textarea
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            placeholder="Enter message to broadcast to all users..."
            className="w-full px-4 py-2 border rounded-lg h-32 resize-none"
          />
          <Button
            className="mt-2"
            onClick={handleBroadcast}
            disabled={!broadcastMessage.trim()}
          >
            Send Broadcast
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
