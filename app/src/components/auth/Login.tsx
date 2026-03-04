import { useState } from 'react';
import { Buffer } from 'buffer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { authAPI, passkeyAPI } from '@/services/api';
import { Chrome, Github, Fingerprint, Mail, Lock, KeyRound } from 'lucide-react';

interface LoginProps {
  onLogin: (token: string, user: any) => void;
  onSwitchToRegister: () => void;
}

export function Login({ onLogin, onSwitchToRegister }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.login(email, password, mfaCode || undefined);
      localStorage.setItem('token', response.data.token);
      onLogin(response.data.token, response.data.user);
    } catch (err: any) {
      if (err.response?.data?.mfaRequired) {
        setMfaRequired(true);
        setError('Please enter your MFA code');
      } else {
        setError(err.response?.data?.error || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email) {
      setError('Please enter your email first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get authentication options
      const optionsResponse = await passkeyAPI.getAuthOptions(email);
      const options = optionsResponse.data;

      // Start WebAuthn authentication
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: Buffer.from(options.challenge, 'base64'),
          rpId: options.rpId,
          allowCredentials: options.allowCredentials?.map((cred: any) => ({
            id: Buffer.from(cred.id, 'base64'),
            type: 'public-key'
          })),
          userVerification: 'preferred'
        }
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Passkey authentication failed');
      }

      // Verify the credential
      const authResponse = await passkeyAPI.verifyAuth({
        id: credential.id,
        rawId: Buffer.from(credential.rawId).toString('base64'),
        type: credential.type,
        response: {
          authenticatorData: Buffer.from((credential.response as AuthenticatorAssertionResponse).authenticatorData).toString('base64'),
          clientDataJSON: Buffer.from((credential.response as AuthenticatorAssertionResponse).clientDataJSON).toString('base64'),
          signature: Buffer.from((credential.response as AuthenticatorAssertionResponse).signature).toString('base64'),
          userHandle: (credential.response as AuthenticatorAssertionResponse).userHandle
            ? Buffer.from((credential.response as AuthenticatorAssertionResponse).userHandle!).toString('base64')
            : null
        }
      });

      localStorage.setItem('token', authResponse.data.token);
      onLogin(authResponse.data.token, authResponse.data.user);
    } catch (err: any) {
      setError(err.message || 'Passkey authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    authAPI.googleLogin();
  };

  const handleGithubLogin = () => {
    authAPI.githubLogin();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome to ChatFlow</CardTitle>
        <CardDescription>Sign in to start chatting</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="email" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="passkey">Passkey</TabsTrigger>
          </TabsList>

          <TabsContent value="email">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {mfaRequired && (
                <div className="space-y-2">
                  <Label htmlFor="mfa">MFA Code</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="mfa"
                      type="text"
                      placeholder="000000"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      className="pl-10"
                      maxLength={6}
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-4">
              <Separator className="my-4" />
              <p className="text-center text-sm text-muted-foreground mb-4">Or continue with</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleGoogleLogin}
                >
                  <Chrome className="w-4 h-4 mr-2" />
                  Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleGithubLogin}
                >
                  <Github className="w-4 h-4 mr-2" />
                  GitHub
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="passkey">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="passkey-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="passkey-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <Button
                onClick={handlePasskeyLogin}
                className="w-full"
                disabled={loading}
              >
                <Fingerprint className="w-4 h-4 mr-2" />
                {loading ? 'Authenticating...' : 'Sign in with Passkey'}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Make sure you have a passkey registered for this account
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don't have an account?{' '}
          <button
            onClick={onSwitchToRegister}
            className="text-primary hover:underline font-medium"
          >
            Sign up
          </button>
        </p>
      </CardFooter>
    </Card>
  );
}
