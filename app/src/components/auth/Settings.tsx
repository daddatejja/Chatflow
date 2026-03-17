import { useState, useEffect } from 'react';
import { Buffer } from 'buffer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { userAPI, authAPI, passkeyAPI, sessionAPI } from '@/services/api';
import { Camera, Fingerprint, Shield, Smartphone, LogOut, Monitor, Globe, Clock, Trash2, KeyRound, Bell } from 'lucide-react';
import { subscribeToPushNotifications, unsubscribeFromPushNotifications } from '@/services/pushNotifications';
import { toast } from 'sonner';

interface SettingsProps {
  user: any;
  onUpdateUser: (user: any) => void;
  onLogout: () => void;
  onClose?: () => void;
}

export function Settings({ user, onUpdateUser, onLogout, onClose }: SettingsProps) {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your account settings and preferences</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto sm:grid-cols-4 sm:h-10 mb-8">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="passkeys">Passkeys</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px]">
            <TabsContent value="profile" className="mt-4">
              <ProfileSettings user={user} onUpdateUser={onUpdateUser} />
            </TabsContent>

            <TabsContent value="security" className="mt-4">
              <SecuritySettings user={user} onUpdateUser={onUpdateUser} />
            </TabsContent>

            <TabsContent value="passkeys" className="mt-4">
              <PasskeySettings />
            </TabsContent>

            <TabsContent value="sessions" className="mt-4">
              <SessionSettings onLogout={onLogout} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Profile Settings Component
function ProfileSettings({ user, onUpdateUser }: { user: any; onUpdateUser: (user: any) => void }) {
  const [name, setName] = useState(user.name);
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      const response = await userAPI.updateProfile(name);
      onUpdateUser({ ...user, name: response.data.user.name });
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarLoading(true);
    try {
      const response = await userAPI.updateAvatar(file);
      onUpdateUser({ ...user, avatar: response.data.avatar });
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      toast.error('Failed to upload avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleGenerateAvatar = async () => {
    setAvatarLoading(true);
    try {
      const response = await userAPI.generateAvatar();
      onUpdateUser({ ...user, avatar: response.data.avatar });
    } catch (error) {
      console.error('Failed to generate avatar:', error);
      toast.error('Failed to generate avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRandomAvatar = async () => {
    setAvatarLoading(true);
    try {
      const response = await userAPI.randomAvatar();
      onUpdateUser({ ...user, avatar: response.data.avatar });
    } catch (error) {
      console.error('Failed to generate random avatar:', error);
      toast.error('Failed to generate random avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6">
        <div className="relative">
          <Avatar className="w-24 h-24">
            <AvatarImage src={user.avatar} />
            <AvatarFallback>{user.name?.[0]}</AvatarFallback>
          </Avatar>
          <label className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-sm">
            <Camera className="w-4 h-4" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
              disabled={avatarLoading}
            />
          </label>
        </div>
        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={handleGenerateAvatar}
            disabled={avatarLoading}
          >
            Generate AI Avatar
          </Button>
          <Button
            variant="outline"
            onClick={handleRandomAvatar}
            disabled={avatarLoading}
          >
            Random Avatar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Display Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={user.email} disabled />
      </div>

      <Button onClick={handleUpdateProfile} disabled={loading}>
        Save Changes
      </Button>
    </div>
  );
}

// Security Settings Component
function SecuritySettings({ user, onUpdateUser }: { user: any; onUpdateUser: (user: any) => void }) {
  const [mfaQRCode, setMfaQRCode] = useState('');
  const [, setMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(async (registration) => {
        const sub = await registration.pushManager.getSubscription();
        setPushEnabled(!!sub);
      });
    }
  }, []);

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        const success = await unsubscribeFromPushNotifications();
        if (success) setPushEnabled(false);
      } else {
        const success = await subscribeToPushNotifications();
        if (success) setPushEnabled(true);
        else alert('Failed to enable push notifications. Check your browser permissions.');
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handleSetupMFA = async () => {
    try {
      const response = await authAPI.setupMFA();
      setMfaQRCode(response.data.qrCode);
      setMfaSecret(response.data.secret);
      setShowMFASetup(true);
    } catch (error) {
      console.error('Failed to setup MFA:', error);
      toast.error('Failed to setup MFA');
    }
  };

  const handleVerifyMFA = async () => {
    try {
      await authAPI.verifyMFA(mfaCode);
      onUpdateUser({ ...user, mfaEnabled: true });
      setShowMFASetup(false);
      setMfaCode('');
    } catch (error) {
      console.error('Failed to verify MFA:', error);
      toast.error('Failed to verify MFA code');
    }
  };

  const handleDisableMFA = async () => {
    try {
      await authAPI.disableMFA(mfaCode);
      onUpdateUser({ ...user, mfaEnabled: false });
      setMfaCode('');
    } catch (error) {
      console.error('Failed to disable MFA:', error);
      toast.error('Failed to disable MFA');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Receive notifications even when the app is closed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{pushEnabled ? 'Enabled' : 'Disabled'}</p>
              <p className="text-sm text-muted-foreground">
                Get notified about new messages and friend requests
              </p>
            </div>
            <Button 
                variant={pushEnabled ? "outline" : "default"} 
                onClick={handleTogglePush}
                disabled={pushLoading}
            >
              {pushLoading ? 'Updating' : (pushEnabled ? 'Disable' : 'Enable')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user.mfaEnabled ? (
            <div className="space-y-4">
              <Badge className="bg-green-500">Enabled</Badge>
              <div className="space-y-2">
                <Label>Disable MFA</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter MFA code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                  />
                  <Button variant="destructive" onClick={handleDisableMFA}>
                    Disable
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Badge variant="secondary">Disabled</Badge>
              {!showMFASetup ? (
                <Button onClick={handleSetupMFA}>Set Up MFA</Button>
              ) : (
                <div className="space-y-4">
                  <img src={mfaQRCode} alt="MFA QR Code" className="w-48 h-48 bg-white p-2 rounded-md" />
                  <p className="text-sm text-muted-foreground">
                    Scan this QR code with your authenticator app, then enter the code below.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter MFA code"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                    />
                    <Button onClick={handleVerifyMFA}>Verify</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await userAPI.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
    } catch (error) {
      console.error('Failed to change password:', error);
      toast.error('Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Current Password</Label>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>New Password</Label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Confirm New Password</Label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={loading}>
        Change Password
      </Button>
    </form>
  );
}

// Passkey Settings Component
function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPasskeys();
  }, []);

  const loadPasskeys = async () => {
    try {
      const response = await passkeyAPI.getPasskeys();
      setPasskeys(response.data.passkeys);
    } catch (error) {
      console.error('Failed to load passkeys:', error);
      toast.error('Failed to load passkeys');
    }
  };

  const handleRegisterPasskey = async () => {
    setLoading(true);
    try {
      const optionsResponse = await passkeyAPI.getRegisterOptions();
      const options = optionsResponse.data;

      const credential = await navigator.credentials.create({
        publicKey: {
          rp: { name: options.rp.name, id: options.rp.id },
          user: {
            id: Buffer.from(options.user.id, 'base64'),
            name: options.user.name,
            displayName: options.user.displayName
          },
          challenge: Buffer.from(options.challenge, 'base64'),
          pubKeyCredParams: options.pubKeyCredParams,
          authenticatorSelection: options.authenticatorSelection,
          attestation: options.attestation
        }
      }) as PublicKeyCredential;

      await passkeyAPI.verifyRegister({
        id: credential.id,
        rawId: Buffer.from(credential.rawId).toString('base64'),
        type: credential.type,
        response: {
          clientDataJSON: Buffer.from((credential.response as AuthenticatorAttestationResponse).clientDataJSON).toString('base64'),
          attestationObject: Buffer.from((credential.response as AuthenticatorAttestationResponse).attestationObject).toString('base64')
        }
      });

      loadPasskeys();
    } catch (error) {
      console.error('Failed to register passkey:', error);
      toast.error('Failed to register passkey');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    try {
      await passkeyAPI.deletePasskey(passkeyId);
      loadPasskeys();
    } catch (error) {
      console.error('Failed to delete passkey:', error);
      toast.error('Failed to delete passkey');
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={handleRegisterPasskey} disabled={loading}>
        <Fingerprint className="w-4 h-4 mr-2" />
        Register New Passkey
      </Button>

      <div className="space-y-2">
        {passkeys.map((passkey) => (
          <Card key={passkey.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">{passkey.deviceName}</p>
                  <p className="text-sm text-muted-foreground">
                    Last used: {new Date(passkey.lastUsed).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeletePasskey(passkey.id)}
                className="hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Session Settings Component
function SessionSettings({ onLogout }: { onLogout: () => void }) {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await sessionAPI.getSessions();
      setSessions(response.data.sessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('Failed to load sessions');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await sessionAPI.revokeSession(sessionId);
      loadSessions();
    } catch (error) {
      console.error('Failed to revoke session:', error);
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeOtherSessions = async () => {
    try {
      await sessionAPI.revokeOtherSessions();
      loadSessions();
    } catch (error) {
      console.error('Failed to revoke other sessions:', error);
      toast.error('Failed to revoke other sessions');
    }
  };

  const handleLogoutAll = async () => {
    try {
      await authAPI.logoutAll();
      onLogout();
    } catch (error) {
      console.error('Failed to logout all:', error);
      toast.error('Failed to logout from all devices');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleRevokeOtherSessions}>
          Revoke Other Sessions
        </Button>
        <Button variant="destructive" onClick={handleLogoutAll}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout All Devices
        </Button>
      </div>

      <div className="space-y-2">
        {sessions.map((session) => (
          <Card key={session.id} className={session.isCurrentSession ? 'border-blue-500' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {session.deviceInfo.deviceType === 'desktop' ? (
                      <Monitor className="w-5 h-5 text-gray-500" />
                    ) : (
                      <Smartphone className="w-5 h-5 text-gray-500" />
                    )}
                    <span className="font-medium">
                      {session.deviceInfo.browser} on {session.deviceInfo.os}
                    </span>
                    {session.isCurrentSession && (
                      <Badge className="bg-blue-500">Current</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Globe className="w-4 h-4" />
                      {session.ipAddress}
                    </span>
                    {session.location?.city && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-4 h-4" />
                        {session.location.city}, {session.location.country}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Last active: {new Date(session.lastActive).toLocaleString()}
                    </span>
                  </div>
                </div>
                {!session.isCurrentSession && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevokeSession(session.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default Settings;
