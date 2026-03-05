import express, { Response } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import passport from "./services/passport";
import routes from "./routes";
import callRoutes from "./routes/call";
import uploadRoutes from "./routes/uploadRoutes";
import { prisma } from "./lib/prisma";
import { authenticateSocket } from "./middleware/socketAuth";
import { authenticate, AuthenticatedRequest } from "./middleware/auth";
import { registerMessageHandlers } from "./socket/messageSocketHandler";
import { registerGroupHandlers } from "./socket/groupSocketHandler";
import { registerCallHandlers } from "./socket/callSocketHandler";
import { registerWebRTCHandlers } from "./socket/webrtcSocketHandler";
import { registerPresenceHandlers } from "./socket/presenceSocketHandler";

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Parse allowed origins from env (comma-separated)
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  // Enable polling fallback for cPanel/shared hosting compatibility
  transports: ["websocket", "polling"],
  allowEIO3: true,
});
app.set("io", io);

const PORT = process.env.PORT || 3000;

// Handle preflight OPTIONS requests FIRST (critical for cPanel/Apache proxy)
app.options("*", (_req, res) => {
  const origin = _req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.status(204).end();
});

// CORS middleware (MUST come before helmet)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

// Security middleware (after CORS so it doesn't interfere with CORS headers)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(passport.initialize());

// Ensure uploads directory exists (use absolute path for production)
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Static files for uploads
app.use("/uploads", express.static(uploadsDir));

// File/voice/video upload endpoints
app.use("/api/messages/upload", uploadRoutes);

// Register main API routes
app.use("/api", routes);

// Socket.IO authentication middleware
io.use(authenticateSocket);

// Socket.IO connection handling
io.on("connection", (socket) => {
  const userId = socket.data.userId;
  console.log(`User connected: ${userId}`);

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Register all socket handler modules
  registerPresenceHandlers(socket, io, userId);
  registerMessageHandlers(socket, io, userId);
  registerGroupHandlers(socket, io, userId);
  registerCallHandlers(socket, io, userId);
  registerWebRTCHandlers(socket, io, userId);
});

// Start server - listen() MUST be called synchronously for CloudLinux Passenger
// Passenger intercepts the listen() call to bind to its own socket
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});

// Connect to database after listen (non-blocking)
prisma
  .$connect()
  .then(() => console.log("Connected to PostgreSQL database"))
  .catch((error) => {
    console.error("Failed to connect to database:", error);
    // Don't exit - let Passenger handle the error
  });

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully`);
  await prisma.$disconnect();
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export { io };
