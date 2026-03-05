import express, { Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { uploadLimiter } from "../middleware/rateLimit";
import { validateMagicBytes } from "../utils/magicBytes";

const router = express.Router();

// Ensure uploads directory exists (use absolute path for production)
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Allowed file types for upload
const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/mp4",
  // Video
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-rar-compressed",
  "text/plain",
  "text/csv",
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

// File/voice/video upload endpoint
router.post(
  "/",
  authenticate,
  uploadLimiter,
  upload.single("file"),
  async (req: express.Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // Validate magic bytes to prevent MIME spoofing
      const filePath = req.file.path;
      if (!validateMagicBytes(filePath, req.file.mimetype)) {
        fs.unlinkSync(filePath); // Remove the suspicious file
        return res
          .status(400)
          .json({ error: "File content does not match its declared type" });
      }

      const { receiverId, type, duration } = req.body;
      const senderId = authReq.user!.id;
      const fileUrl = `/uploads/${req.file.filename}`;

      const message = await prisma.message.create({
        data: {
          senderId,
          receiverId,
          type: (type || "FILE") as any,
          content: fileUrl,
          duration: duration ? parseInt(duration) : undefined,
          isRead: false,
        },
        include: { reactions: true, threadReplies: true },
      });

      const msgWithMeta = {
        ...message,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      };

      const io = req.app.get("io");
      if (io) {
        io.to(`user:${receiverId}`).emit("message:receive", msgWithMeta);
        io.to(`user:${senderId}`).emit("message:receive", msgWithMeta);
      }

      res.status(201).json({ message: msgWithMeta });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

// Group file/voice/video upload endpoint
router.post(
  "/group",
  authenticate,
  uploadLimiter,
  upload.single("file"),
  async (req: express.Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // Validate magic bytes to prevent MIME spoofing
      const filePath = req.file.path;
      if (!validateMagicBytes(filePath, req.file.mimetype)) {
        fs.unlinkSync(filePath);
        return res
          .status(400)
          .json({ error: "File content does not match its declared type" });
      }

      const { groupId, type, duration } = req.body;
      const senderId = authReq.user!.id;
      const fileUrl = `/uploads/${req.file.filename}`;

      const message = await prisma.groupMessage.create({
        data: {
          groupId,
          senderId,
          type: (type || "FILE") as any,
          content: fileUrl,
          duration: duration ? parseInt(duration) : undefined,
        },
        include: {
          reactions: true,
          sender: { select: { id: true, name: true, avatar: true } },
        },
      });

      const msgWithMeta = {
        ...message,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      };

      const io = req.app.get("io");
      if (io) {
        io.to(`group:${groupId}`).emit("group:message", msgWithMeta);
      }

      res.status(201).json({ message: msgWithMeta });
    } catch (error) {
      console.error("Group upload error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

export default router;
