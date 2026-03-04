import { UAParser } from 'ua-parser-js';
import { Request } from 'express';
import { IDeviceInfo, ILocation } from '../types';
import axios from 'axios';

export const getDeviceInfo = (req: Request): IDeviceInfo => {
  const ua = new UAParser(req.headers['user-agent'] || '');
  const browser = ua.getBrowser();
  const os = ua.getOS();
  const device = ua.getDevice();

  let deviceType = 'UNKNOWN';
  if (device.type) {
    const typeMap: Record<string, string> = {
      'mobile': 'MOBILE',
      'tablet': 'TABLET',
      'desktop': 'DESKTOP',
    };
    deviceType = typeMap[device.type] || 'UNKNOWN';
  } else if (!device.type && !device.model) {
    deviceType = 'DESKTOP';
  }

  return {
    browser: browser.name || 'Unknown',
    browserVersion: browser.version || 'Unknown',
    os: os.name || 'Unknown',
    osVersion: os.version || 'Unknown',
    device: device.model || device.vendor || 'Unknown',
    deviceType: deviceType as IDeviceInfo['deviceType']
  };
};

export const getLocationFromIP = async (ip: string): Promise<ILocation | null> => {
  try {
    // Remove IPv6 prefix if present
    const cleanIP = ip.replace(/^::ffff:/, '');

    // Skip private IPs
    if (isPrivateIP(cleanIP)) {
      return null;
    }

    const response = await axios.get(`http://ip-api.com/json/${cleanIP}`, {
      timeout: 5000
    });

    if (response.data && response.data.status === 'success') {
      return {
        country: response.data.country,
        city: response.data.city,
        region: response.data.regionName,
        latitude: response.data.lat,
        longitude: response.data.lon
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting location from IP:', error);
    return null;
  }
};

const isPrivateIP = (ip: string): boolean => {
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i
  ];

  return privateRanges.some(range => range.test(ip));
};

export const getClientIP = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0])
    : req.socket.remoteAddress;
  return ip?.replace(/^::ffff:/, '') || 'unknown';
};
