import { Request } from 'express';
import { User as PrismaUser } from '@prisma/client';

// Use Prisma's generated User type directly to avoid null/undefined mismatches
export type IUser = PrismaUser;

export interface IPasskey {
  id: string;
  publicKey: Buffer;
  counter: number;
  deviceName: string;
  deviceType: string;
  createdAt: Date;
  lastUsed: Date;
}

export interface IDeviceInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN';
}

export interface ILocation {
  country?: string;
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
}

declare global {
  namespace Express {
    interface User extends IUser { }
    interface Request {
      token?: string;
      sessionId?: string;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user?: Express.User;
  token?: string;
  sessionId?: string;
}

export interface IOAuthProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'google' | 'github';
}
