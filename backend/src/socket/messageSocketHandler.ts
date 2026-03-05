import { Socket, Server } from "socket.io";
import { prisma } from "../lib/prisma";
import { MessageType } from "@prisma/client";
import fs from "fs";
import path from "path";
import {
  validateSocketData,
  sanitizeContent,
  messageSendSchema,
  messageEditSchema,
  messageDeleteSchema,
  messageReadSchema,
  messageReactionSchema,
} from "../utils/socketValidation";

export function registerMessageHandlers(
  socket: Socket,
  io: Server,
  userId: string,
) {
  // Handle direct message
  socket.on("message:send", async (data, callback) => {
    try {
      const parsed = validateSocketData(messageSendSchema, data);
      if (!parsed.success) {
        if (callback) callback({ success: false, error: parsed.error });
        return;
      }
      const {
        receiverId,
        type,
        content,
        duration,
        replyToId,
        fileName,
        fileSize,
        mimeType,
      } = parsed.data;

      // Verify receiver exists
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
      });
      if (!receiver) {
        if (callback) callback({ success: false, error: "Receiver not found" });
        return;
      }

      // Check if sender is blocked by the receiver
      const blocked = await prisma.blockedUser.findFirst({
        where: { blockerId: receiverId, blockedId: userId },
      });
      if (blocked) {
        if (callback)
          callback({
            success: false,
            error: "Cannot send message to this user",
          });
        return;
      }

      // Sanitize text content
      const safeContent =
        type?.toLowerCase() === "text" || !type
          ? sanitizeContent(content)
          : content;

      const message = await prisma.message.create({
        data: {
          senderId: userId,
          receiverId,
          type: (type ? type.toUpperCase() : "TEXT") as MessageType,
          content: safeContent,
          duration,
          replyToId: replyToId ?? undefined,
          isRead: false,
        },
        include: {
          reactions: true,
          threadReplies: true,
        },
      });

      const msgWithMeta = { ...message, fileName, fileSize, mimeType };

      io.to(`user:${receiverId}`).emit("message:receive", msgWithMeta);

      // Also send push notification
      import("../services/pushService").then(({ sendPushNotification }) => {
        sendPushNotification(receiverId, {
          title: `New Message`,
          body: type === "TEXT" ? content : `Sent a ${type.toLowerCase()}`,
          data: { url: `/` },
        }).catch((err) => console.error("Push notification error:", err));
      });

      if (callback) {
        callback({ success: true, message: msgWithMeta });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      if (callback) {
        callback({
          success: false,
          error: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  });

  // Handle message edit
  socket.on("message:edit", async (rawData, callback) => {
    try {
      const parsed = validateSocketData(messageEditSchema, rawData);
      if (!parsed.success) {
        if (callback) callback({ success: false, error: parsed.error });
        return;
      }
      const { messageId, content } = parsed.data;

      const message = await prisma.message.findFirst({
        where: { id: messageId, senderId: userId, isDeleted: false },
      });
      if (!message) {
        if (callback)
          callback({
            success: false,
            error: "Message not found or unauthorized",
          });
        return;
      }

      const safeContent = sanitizeContent(content);
      await prisma.message.update({
        where: { id: messageId },
        data: { content: safeContent, isEdited: true, editedAt: new Date() },
      });
      io.to(`user:${message.receiverId}`)
        .to(`user:${userId}`)
        .emit("message:edited", { messageId, content: safeContent });

      if (callback) callback({ success: true, content: safeContent });
    } catch (error) {
      console.error("Error editing message:", error);
      if (callback)
        callback({ success: false, error: "Internal server error" });
    }
  });

  // Handle message delete
  socket.on("message:delete", async (rawData, callback) => {
    try {
      const parsed = validateSocketData(messageDeleteSchema, rawData);
      if (!parsed.success) {
        if (callback) callback({ success: false, error: parsed.error });
        return;
      }
      const { messageId } = parsed.data;

      const message = await prisma.message.findFirst({
        where: { id: messageId, senderId: userId },
      });
      if (!message) {
        if (callback)
          callback({
            success: false,
            error: "Message not found or unauthorized",
          });
        return;
      }
      await prisma.message.update({
        where: { id: messageId },
        data: { isDeleted: true },
      });

      // Clean up uploaded file if message has a file path
      if (
        message.content &&
        message.content.startsWith("/uploads/") &&
        ["IMAGE", "VOICE", "VIDEO", "FILE"].includes(message.type)
      ) {
        try {
          const filePath = path.join(process.cwd(), message.content);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileErr) {
          console.error("Error cleaning up file:", fileErr);
        }
      }

      io.to(`user:${message.receiverId}`)
        .to(`user:${userId}`)
        .emit("message:deleted", { messageId });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error("Error deleting message:", error);
      if (callback)
        callback({ success: false, error: "Internal server error" });
    }
  });

  // Handle message read — only the receiver can mark a message as read
  socket.on("message:read", async (rawData) => {
    try {
      const parsed = validateSocketData(messageReadSchema, rawData);
      if (!parsed.success) return;
      const { messageId } = parsed.data;

      const message = await prisma.message.findFirst({
        where: { id: messageId, receiverId: userId },
      });
      if (!message) return;

      await prisma.message.update({
        where: { id: messageId },
        data: { isRead: true, readAt: new Date() },
      });

      io.to(`user:${message.senderId}`).emit("message:read", { messageId });
    } catch (error) {
      console.error("Error marking message as read:", error);
    }
  });

  // Handle reactions
  socket.on("message:reaction", async (rawData, callback) => {
    try {
      const parsed = validateSocketData(messageReactionSchema, rawData);
      if (!parsed.success) {
        if (callback) callback({ success: false, error: parsed.error });
        return;
      }
      const { messageId, emoji, action } = parsed.data;

      if (action === "add") {
        await prisma.messageReaction.create({
          data: { messageId, userId, emoji },
        });
      } else {
        await prisma.messageReaction.deleteMany({
          where: { messageId, userId, emoji },
        });
      }

      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (message) {
        io.to(`user:${message.senderId}`)
          .to(`user:${message.receiverId}`)
          .emit("message:reaction", { messageId, userId, emoji, action });
      }

      if (callback) callback({ success: true });
    } catch (error) {
      console.error("Error handling reaction:", error);
      if (callback)
        callback({ success: false, error: "Internal server error" });
    }
  });
}
