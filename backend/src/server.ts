import express, { Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import passport from './services/passport';
import routes from './routes';
import callRoutes from './routes/call';
import { prisma } from './lib/prisma';
import { authenticateSocket } from './middleware/socketAuth';
import { authenticate, AuthenticatedRequest } from './middleware/auth';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Parse allowed origins from env (comma-separated)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  // Enable polling fallback for cPanel/shared hosting compatibility
  transports: ['websocket', 'polling'],
  allowEIO3: true
});
app.set('io', io);

const PORT = process.env.PORT || 3000;

// Handle preflight OPTIONS requests FIRST (critical for cPanel/Apache proxy)
app.options('*', (_req, res) => {
  const origin = _req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// CORS middleware (MUST come before helmet)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Security middleware (after CORS so it doesn't interfere with CORS headers)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(passport.initialize());

// Ensure uploads directory exists (use absolute path for production)
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Static files for uploads
app.use('/uploads', express.static(uploadsDir));

// Multer config for file uploads
// Allowed file types for upload
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/mp4',
  // Video
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  // Documents
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-rar-compressed',
  'text/plain', 'text/csv'
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});

// API routes
app.use('/api', routes);
app.use('/api/calls', callRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// File/voice/video upload endpoint (declared after io so we can emit to rooms)
app.post('/api/messages/upload', authenticate, upload.single('file'), async (req: express.Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { receiverId, type, duration } = req.body;
    const senderId = authReq.user!.id;
    const fileUrl = `/uploads/${req.file.filename}`;

    const message = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        type: (type || 'FILE') as any,
        content: fileUrl,
        duration: duration ? parseInt(duration) : undefined,
        isRead: false,
      },
      include: { reactions: true, threadReplies: true }
    });

    const msgWithMeta = {
      ...message,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    };

    io.to(`user:${receiverId}`).emit('message:receive', msgWithMeta);
    io.to(`user:${senderId}`).emit('message:receive', msgWithMeta);
    res.status(201).json({ message: msgWithMeta });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Group file/voice/video upload endpoint
app.post('/api/messages/upload/group', authenticate, upload.single('file'), async (req: express.Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { groupId, type, duration } = req.body;
    const senderId = authReq.user!.id;
    const fileUrl = `/uploads/${req.file.filename}`;

    const message = await prisma.groupMessage.create({
      data: {
        groupId,
        senderId,
        type: (type || 'FILE') as any,
        content: fileUrl,
        duration: duration ? parseInt(duration) : undefined,
      },
      include: {
        reactions: true,
        sender: { select: { id: true, name: true, avatar: true } }
      }
    });

    const msgWithMeta = {
      ...message,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    };

    io.to(`group:${groupId}`).emit('group:message', msgWithMeta);
    res.status(201).json({ message: msgWithMeta });
  } catch (error) {
    console.error('Group upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Socket.IO authentication middleware
io.use(authenticateSocket);

// Socket.IO connection handling
io.on('connection', (socket) => {
  const userId = socket.data.userId;

  console.log(`User connected: ${userId}`);

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Update user online status
  const updateOnlineStatus = async (status: string) => {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { status: status as any, lastSeen: new Date() }
      });

      // Broadcast status to friends
      const friends = await prisma.friend.findMany({
        where: {
          OR: [
            { senderId: userId, status: 'ACCEPTED' },
            { receiverId: userId, status: 'ACCEPTED' }
          ]
        }
      });

      friends.forEach(friend => {
        const friendId = friend.senderId === userId ? friend.receiverId : friend.senderId;
        io.to(`user:${friendId}`).emit('user:status', { userId, status });
      });
    } catch (error) {
      console.error('Error updating online status:', error);
    }
  };

  updateOnlineStatus('ONLINE');

  // Join group rooms
  socket.on('group:join', async ({ groupId }) => {
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (membership) {
      socket.join(`group:${groupId}`);
      console.log(`User ${userId} joined group ${groupId}`);
    }
  });

  socket.on('group:leave', ({ groupId }) => {
    socket.leave(`group:${groupId}`);
    console.log(`User ${userId} left group ${groupId}`);
  });

  // Handle typing indicator
  socket.on('typing:start', ({ receiverId, groupId }) => {
    if (groupId) {
      socket.to(`group:${groupId}`).emit('typing:start', { userId, groupId });
    } else {
      socket.to(`user:${receiverId}`).emit('typing:start', { userId });
    }
  });

  socket.on('typing:stop', ({ receiverId, groupId }) => {
    if (groupId) {
      socket.to(`group:${groupId}`).emit('typing:stop', { userId, groupId });
    } else {
      socket.to(`user:${receiverId}`).emit('typing:stop', { userId });
    }
  });

  // Handle direct message
  socket.on('message:send', async (data, callback) => {
    try {
      const { receiverId, type, content, duration, replyToId, fileName, fileSize, mimeType } = data;

      const message = await prisma.message.create({
        data: {
          senderId: userId,
          receiverId,
          type: type ? type.toUpperCase() : 'TEXT',
          content,
          duration,
          replyToId,
          isRead: false
        },
        include: {
          reactions: true,
          threadReplies: true
        }
      });

      const msgWithMeta = { ...message, fileName, fileSize, mimeType };

      // Send to receiver
      io.to(`user:${receiverId}`).emit('message:receive', msgWithMeta);

      // Confirm to sender with the full persisted message
      if (callback) {
        callback({ success: true, message: msgWithMeta });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      if (callback) {
        callback({ success: false, error: `Failed to send message: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
  });

  // Handle message edit
  socket.on('message:edit', async ({ messageId, content }) => {
    try {
      const message = await prisma.message.findFirst({
        where: { id: messageId, senderId: userId, isDeleted: false }
      });
      if (!message) return;
      await prisma.message.update({
        where: { id: messageId },
        data: { content, isEdited: true, editedAt: new Date() }
      });
      io.to(`user:${message.receiverId}`).to(`user:${userId}`).emit('message:edited', { messageId, content });
    } catch (error) {
      console.error('Error editing message:', error);
    }
  });

  // Handle message delete
  socket.on('message:delete', async ({ messageId }) => {
    try {
      const message = await prisma.message.findFirst({
        where: { id: messageId, senderId: userId }
      });
      if (!message) return;
      await prisma.message.update({
        where: { id: messageId },
        data: { isDeleted: true }
      });
      io.to(`user:${message.receiverId}`).to(`user:${userId}`).emit('message:deleted', { messageId });
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  });

  // Handle group message
  socket.on('group:message:send', async (data, callback) => {
    try {
      const { groupId, type, content, duration, replyToId } = data;

      // Verify membership
      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId, userId }
        }
      });

      if (!membership) {
        if (callback) {
          callback({ success: false, error: 'Not a member of this group' });
        }
        return;
      }

      const message = await prisma.groupMessage.create({
        data: {
          groupId,
          senderId: userId,
          type: type ? type.toUpperCase() : 'TEXT',
          content,
          duration,
          replyToId
        },
        include: {
          reactions: true
        }
      });

      // Broadcast to group
      io.to(`group:${groupId}`).emit('group:message:receive', {
        ...message,
        sender: { id: userId, name: socket.data.userName }
      });

      if (callback) {
        callback({ success: true, message });
      }
    } catch (error) {
      console.error('Error sending group message:', error);
      if (callback) {
        callback({ success: false, error: 'Failed to send group message' });
      }
    }
  });

  // Handle message read
  socket.on('message:read', async ({ messageId }) => {
    try {
      const message = await prisma.message.update({
        where: { id: messageId },
        data: { isRead: true, readAt: new Date() }
      });

      io.to(`user:${message.senderId}`).emit('message:read', { messageId });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  // Handle reactions
  socket.on('message:reaction', async ({ messageId, emoji, action }) => {
    try {
      if (action === 'add') {
        await prisma.messageReaction.create({
          data: { messageId, userId, emoji }
        });
      } else {
        await prisma.messageReaction.deleteMany({
          where: { messageId, userId, emoji }
        });
      }

      const message = await prisma.message.findUnique({
        where: { id: messageId }
      });

      if (message) {
        io.to(`user:${message.senderId}`)
          .to(`user:${message.receiverId}`)
          .emit('message:reaction', { messageId, userId, emoji, action });
      }
    } catch (error) {
      console.error('Error handling reaction:', error);
    }
  });

  // Handle call signaling
  socket.on('call:initiate', async ({ receiverId, callType }) => {
    try {
      // Create 'ONGOING' call log
      const callLog = await prisma.callLog.create({
        data: {
          callerId: userId,
          receiverId,
          callType,
          status: 'ONGOING'
        }
      });

      io.to(`user:${receiverId}`).emit('call:incoming', {
        callerId: userId,
        callType,
        callLogId: callLog.id
      });
    } catch (error) {
      console.error('Error initiating call:', error);
    }
  });

  socket.on('call:accept', async ({ callerId, callLogId }) => {
    io.to(`user:${callerId}`).emit('call:accepted', { receiverId: userId });
  });

  socket.on('call:reject', async ({ callerId, callLogId }) => {
    io.to(`user:${callerId}`).emit('call:rejected', { receiverId: userId });
    try {
      if (callLogId) {
        await prisma.callLog.update({
          where: { id: callLogId },
          data: { status: 'REJECTED', endedAt: new Date() }
        });
      }
    } catch (e) {
      console.error('Error rejecting call log:', e);
    }
  });

  socket.on('call:end', async ({ peerId, callLogId, duration }) => {
    io.to(`user:${peerId}`).emit('call:ended', { userId });
    try {
      if (callLogId) {
        // If duration is very short or 0, it might be a missed call
        const finalStatus = duration && duration > 0 ? 'COMPLETED' : 'MISSED';
        await prisma.callLog.update({
          where: { id: callLogId },
          data: { status: finalStatus, endedAt: new Date(), duration }
        });
      }
    } catch (e) {
      console.error('Error ending call log:', e);
    }
  });

  // Call feature toggling
  socket.on('call:mute:toggle', ({ peerId, isMuted }) => {
    io.to(`user:${peerId}`).emit('call:mute:toggle', { userId, isMuted });
  });

  socket.on('call:screenshare:toggle', ({ peerId, isSharing }) => {
    io.to(`user:${peerId}`).emit('call:screenshare:toggle', { userId, isSharing });
  });

  // Video upgrade invitation
  socket.on('call:video-upgrade:request', ({ peerId }) => {
    io.to(`user:${peerId}`).emit('call:video-upgrade:request', { userId });
  });

  socket.on('call:video-upgrade:accept', ({ peerId }) => {
    io.to(`user:${peerId}`).emit('call:video-upgrade:accepted', { userId });
  });

  socket.on('call:video-upgrade:reject', ({ peerId }) => {
    io.to(`user:${peerId}`).emit('call:video-upgrade:rejected', { userId });
  });

  // WebRTC signaling
  socket.on('webrtc:offer', ({ peerId, offer }) => {
    io.to(`user:${peerId}`).emit('webrtc:offer', { userId, offer });
  });

  socket.on('webrtc:answer', ({ peerId, answer }) => {
    io.to(`user:${peerId}`).emit('webrtc:answer', { userId, answer });
  });

  socket.on('webrtc:ice-candidate', ({ peerId, candidate }) => {
    io.to(`user:${peerId}`).emit('webrtc:ice-candidate', { userId, candidate });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${userId}`);
    updateOnlineStatus('OFFLINE');
  });
});

// Start server - listen() MUST be called synchronously for CloudLinux Passenger
// Passenger intercepts the listen() call to bind to its own socket
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});

// Connect to database after listen (non-blocking)
prisma.$connect()
  .then(() => console.log('Connected to PostgreSQL database'))
  .catch((error) => {
    console.error('Failed to connect to database:', error);
    // Don't exit - let Passenger handle the error
  });

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully`);
  await prisma.$disconnect();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { io };
