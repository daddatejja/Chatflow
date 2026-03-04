import axios from 'axios';
import crypto from 'crypto';

export const generateAvatarFromName = (name: string): string => {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  // Generate a consistent color based on name
  const hash = crypto.createHash('md5').update(name).digest('hex');
  const hue = parseInt(hash.slice(0, 2), 16) % 360;
  
  // Create SVG avatar
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:hsl(${hue},70%,60%);stop-opacity:1" />
          <stop offset="100%" style="stop-color:hsl(${(hue + 40) % 360},70%,50%);stop-opacity:1" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#grad)"/>
      <text x="100" y="120" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="white" text-anchor="middle">${initials}</text>
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

export const generateAIAvatar = async (prompt: string): Promise<string | null> => {
  try {
    // Using Pollinations.ai for free AI image generation
    const encodedPrompt = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${seed}&nologo=true`;
    
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('Error generating AI avatar:', error);
    return null;
  }
};

export const generateRandomAvatar = (): string => {
  const styles = [
    'adventurer',
    'avataaars',
    'big-ears',
    'big-smile',
    'bottts',
    'croodles',
    'fun-emoji',
    'lorelei',
    'micah',
    'notionists',
    'open-peeps',
    'personas'
  ];
  
  const style = styles[Math.floor(Math.random() * styles.length)];
  const seed = Math.random().toString(36).substring(7);
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
};
