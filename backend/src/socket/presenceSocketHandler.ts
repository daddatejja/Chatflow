import { Socket, Server } from "socket.io";
import { prisma } from "../lib/prisma";
import { validateSocketData, typingSchema } from "../utils/socketValidation";

// Track active socket connections per user for multi-tab support
const userSocketCounts = new Map<string, number>();

export function registerPresenceHandlers(
  socket: Socket,
  io: Server,
  userId: string,
) {
  // Increment socket count for this user
  const currentCount = userSocketCounts.get(userId) || 0;
  userSocketCounts.set(userId, currentCount + 1);

  // Update user online status and broadcast to friends
  const updateOnlineStatus = async (status: string) => {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { status: status as any, lastSeen: new Date() },
      });

      const friends = await prisma.friend.findMany({
        where: {
          OR: [
            { senderId: userId, status: "ACCEPTED" },
            { receiverId: userId, status: "ACCEPTED" },
          ],
        },
      });

      friends.forEach((friend) => {
        const friendId =
          friend.senderId === userId ? friend.receiverId : friend.senderId;
        io.to(`user:${friendId}`).emit("user:status", { userId, status });
      });
    } catch (error) {
      console.error("Error updating online status:", error);
    }
  };

  // Set user ONLINE on first connection
  if (currentCount === 0) {
    updateOnlineStatus("ONLINE");
  }

  // Handle typing indicators
  socket.on("typing:start", (rawData) => {
    const parsed = validateSocketData(typingSchema, rawData);
    if (!parsed.success) return;
    const { receiverId, groupId } = parsed.data;
    if (groupId) {
      socket.to(`group:${groupId}`).emit("typing:start", { userId, groupId });
    } else if (receiverId) {
      socket.to(`user:${receiverId}`).emit("typing:start", { userId });
    }
  });

  socket.on("typing:stop", (rawData) => {
    const parsed = validateSocketData(typingSchema, rawData);
    if (!parsed.success) return;
    const { receiverId, groupId } = parsed.data;
    if (groupId) {
      socket.to(`group:${groupId}`).emit("typing:stop", { userId, groupId });
    } else if (receiverId) {
      socket.to(`user:${receiverId}`).emit("typing:stop", { userId });
    }
  });

  // Handle disconnect — only set OFFLINE when last tab/socket disconnects
  socket.on("disconnect", () => {
    const remaining = (userSocketCounts.get(userId) || 1) - 1;
    userSocketCounts.set(userId, remaining);

    if (remaining <= 0) {
      userSocketCounts.delete(userId);
      console.log(`User disconnected (all tabs): ${userId}`);
      updateOnlineStatus("OFFLINE");
    } else {
      console.log(`User tab closed: ${userId} (${remaining} tabs remaining)`);
    }
  });
}
