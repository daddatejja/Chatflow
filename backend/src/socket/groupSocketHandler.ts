import { Socket, Server } from "socket.io";
import { prisma } from "../lib/prisma";
import { MessageType } from "@prisma/client";
import {
  validateSocketData,
  sanitizeContent,
  groupMessageSendSchema,
  groupMessageEditSchema,
  groupMessageDeleteSchema,
  groupMessageReactionSchema,
  groupJoinSchema,
  groupLeaveSchema,
} from "../utils/socketValidation";

export function registerGroupHandlers(
  socket: Socket,
  io: Server,
  userId: string,
) {
  // Join group rooms
  socket.on("group:join", async (rawData) => {
    const parsed = validateSocketData(groupJoinSchema, rawData);
    if (!parsed.success) return;
    const { groupId } = parsed.data;

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (membership) {
      socket.join(`group:${groupId}`);
      console.log(`User ${userId} joined group ${groupId}`);
    }
  });

  socket.on("group:leave", (rawData) => {
    const parsed = validateSocketData(groupLeaveSchema, rawData);
    if (!parsed.success) return;
    socket.leave(`group:${parsed.data.groupId}`);
    console.log(`User ${userId} left group ${parsed.data.groupId}`);
  });

  // Handle group message
  socket.on("group:message:send", async (data, callback) => {
    try {
      const parsed = validateSocketData(groupMessageSendSchema, data);
      if (!parsed.success) {
        if (callback) callback({ success: false, error: parsed.error });
        return;
      }
      const { groupId, type, content, duration, replyToId } = parsed.data;

      // Verify membership
      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId, userId },
        },
      });

      if (!membership) {
        if (callback) {
          callback({ success: false, error: "Not a member of this group" });
        }
        return;
      }

      // Sanitize text content
      const safeContent =
        type?.toLowerCase() === "text" || !type
          ? sanitizeContent(content)
          : content;

      const message = await prisma.groupMessage.create({
        data: {
          groupId,
          senderId: userId,
          type: (type ? type.toUpperCase() : "TEXT") as MessageType,
          content: safeContent,
          duration,
          replyToId: replyToId ?? undefined,
        },
        include: {
          reactions: true,
        },
      });

      // Broadcast to group
      io.to(`group:${groupId}`).emit("group:message:receive", {
        ...message,
        sender: { id: userId, name: socket.data.userName },
      });

      // Send push notification to all group members except sender
      import("../services/pushService").then(
        async ({ sendPushNotification }) => {
          try {
            const groupMembers = await prisma.groupMember.findMany({
              where: { groupId, userId: { not: userId } },
            });
            const group = await prisma.group.findUnique({
              where: { id: groupId },
            });

            if (group && groupMembers.length > 0) {
              const promises = groupMembers.map((member) =>
                sendPushNotification(member.userId, {
                  title: `${group.name}`,
                  body:
                    type === "TEXT"
                      ? `${socket.data.userName}: ${safeContent}`
                      : `${socket.data.userName} sent a ${type.toLowerCase()}`,
                  data: { url: `/` },
                }),
              );
              await Promise.all(promises);
            }
          } catch (err) {
            console.error("Push notification error in group:", err);
          }
        },
      );

      if (callback) {
        callback({ success: true, message });
      }
    } catch (error) {
      console.error("Error sending group message:", error);
      if (callback) {
        callback({ success: false, error: "Failed to send group message" });
      }
    }
  });

  // Handle group message edit
  socket.on("group:message:edit", async (data, callback) => {
    try {
      const parsed = validateSocketData(groupMessageEditSchema, data);
      if (!parsed.success) {
        if (callback) callback({ success: false, error: parsed.error });
        return;
      }
      const { groupId, messageId, content } = parsed.data;

      // Verify ownership
      const message = await prisma.groupMessage.findUnique({
        where: { id: messageId },
      });

      if (
        !message ||
        message.senderId !== userId ||
        message.groupId !== groupId
      ) {
        if (callback)
          callback({ success: false, error: "Unauthorized or not found" });
        return;
      }

      const safeContent = sanitizeContent(content);

      await prisma.groupMessage.update({
        where: { id: messageId },
        data: { content: safeContent, isEdited: true },
      });

      io.to(`group:${groupId}`).emit("group:message:edit", {
        messageId,
        groupId,
        content: safeContent,
      });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error("Error editing group message:", error);
      if (callback)
        callback({ success: false, error: "Failed to edit message" });
    }
  });

  // Handle group message delete
  socket.on("group:message:delete", async (data, callback) => {
    try {
      const parsed = validateSocketData(groupMessageDeleteSchema, data);
      if (!parsed.success) {
        if (callback) callback({ success: false, error: parsed.error });
        return;
      }
      const { groupId, messageId } = parsed.data;

      const message = await prisma.groupMessage.findUnique({
        where: { id: messageId },
      });

      if (
        !message ||
        message.senderId !== userId ||
        message.groupId !== groupId
      ) {
        if (callback)
          callback({ success: false, error: "Unauthorized or not found" });
        return;
      }

      await prisma.groupMessage.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          content: "This message was deleted",
          type: "TEXT" as MessageType,
        },
      });

      // Clean up uploaded file if message has a file path
      if (
        message.content &&
        message.content.startsWith("/uploads/") &&
        ["IMAGE", "VOICE", "VIDEO", "FILE"].includes(message.type)
      ) {
        try {
          const fs = await import("fs");
          const pathMod = await import("path");
          const filePath = pathMod.join(process.cwd(), message.content);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileErr) {
          console.error("Error cleaning up group file:", fileErr);
        }
      }

      io.to(`group:${groupId}`).emit("group:message:delete", {
        messageId,
        groupId,
      });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error("Error deleting group message:", error);
      if (callback)
        callback({ success: false, error: "Failed to delete message" });
    }
  });

  // Handle group message reaction
  socket.on("group:message:reaction", async (data, callback) => {
    try {
      const parsed = validateSocketData(groupMessageReactionSchema, data);
      if (!parsed.success) {
        if (callback) callback({ success: false, error: parsed.error });
        return;
      }
      const { groupId, messageId, emoji, action } = parsed.data;

      // Verify membership
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });

      if (!membership) {
        if (callback) callback({ success: false, error: "Not a group member" });
        return;
      }

      if (action === "add") {
        await prisma.groupMessageReaction.create({
          data: {
            emoji,
            userId,
            messageId,
          },
        });
      } else {
        await prisma.groupMessageReaction.deleteMany({
          where: {
            emoji,
            userId,
            messageId,
          },
        });
      }

      io.to(`group:${groupId}`).emit("group:message:reaction", {
        messageId,
        groupId,
        userId,
        emoji,
        action,
      });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error("Error handling group reaction:", error);
      if (callback)
        callback({ success: false, error: "Failed to update reaction" });
    }
  });
}
