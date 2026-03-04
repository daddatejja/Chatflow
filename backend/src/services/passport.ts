import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Profile, VerifyCallback } from 'passport-google-oauth20'
import { IOAuthProfile } from '../types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const CALLBACK_URL = process.env.OAUTH_CALLBACK_URL || 'http://localhost:3000/api/auth';

// Google Strategy
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: `${CALLBACK_URL}/google/callback`
    },
    async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email provided'), false);
        }

        const oauthProfile: IOAuthProfile = {
          id: profile.id,
          email,
          name: profile.displayName || email.split('@')[0],
          avatar: profile.photos?.[0]?.value,
          provider: 'google'
        };

        return done(null, oauthProfile as any);
      } catch (error) {
        return done(error, false);
      }
    }
  ));
}

// GitHub Strategy
if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy(
    {
      clientID: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      callbackURL: `${CALLBACK_URL}/github/callback`
    },
    async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
      try {
        const email = profile.emails?.[0]?.value || `${profile.username}@github.com`;

        const oauthProfile: IOAuthProfile = {
          id: profile.id,
          email,
          name: profile.displayName || profile.username || email.split('@')[0],
          avatar: profile.photos?.[0]?.value,
          provider: 'github'
        };

        return done(null, oauthProfile as any);
      } catch (error) {
        return done(error, false);
      }
    }
  ));
}

// Serialize/Deserialize (required but not used with JWT)
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj as any);
});

export default passport;
