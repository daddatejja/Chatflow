import { Socket, Server } from "socket.io";
import { prisma } from "../lib/prisma";
import {
  validateSocketData,
  callInitiateSchema,
  callAcceptSchema,
  callRejectSchema,
  callEndSchema,
  callToggleSchema,
  callPeerSchema,
} from "../utils/socketValidation";

export function registerCallHandlers(
  socket: Socket,
  io: Server,
  userId: string,
) {
  // Handle call signaling
  socket.on("call:initiate", async (rawData) => {
    try {
      const parsed = validateSocketData(callInitiateSchema, rawData);
      if (!parsed.success) return;
      const { receiverId, callType } = parsed.data;

      const callLog = await prisma.callLog.create({
        data: {
          callerId: userId,
          receiverId,
          callType,
          status: "ONGOING",
        },
      });

      io.to(`user:${receiverId}`).emit("call:incoming", {
        callerId: userId,
        callType,
        callLogId: callLog.id,
      });
    } catch (error) {
      console.error("Error initiating call:", error);
    }
  });

  socket.on("call:accept", async (rawData) => {
    const parsed = validateSocketData(callAcceptSchema, rawData);
    if (!parsed.success) return;
    const { callerId, callLogId } = parsed.data;
    io.to(`user:${callerId}`).emit("call:accepted", { receiverId: userId });

    try {
      if (callLogId) {
        await prisma.callLog.update({
          where: { id: callLogId },
          data: { status: "COMPLETED", duration: 0 }, // We assume accepted calls are ongoing/completed; actual end sets duration later
        });
      }
    } catch (e) {
      console.error("Error accepting call log:", e);
    }
  });

  socket.on("call:reject", async (rawData) => {
    const parsed = validateSocketData(callRejectSchema, rawData);
    if (!parsed.success) return;
    const { callerId, callLogId } = parsed.data;
    io.to(`user:${callerId}`).emit("call:rejected", { receiverId: userId });
    try {
      if (callLogId) {
        await prisma.callLog.update({
          where: { id: callLogId },
          data: { status: "REJECTED", endedAt: new Date() },
        });
      }
    } catch (e) {
      console.error("Error rejecting call log:", e);
    }
  });

  socket.on("call:end", async (rawData) => {
    const parsed = validateSocketData(callEndSchema, rawData);
    if (!parsed.success) return;
    const { peerId, callLogId, duration } = parsed.data;
    io.to(`user:${peerId}`).emit("call:ended", { userId });
    try {
      if (callLogId) {
        const finalStatus = duration && duration > 0 ? "COMPLETED" : "MISSED";
        await prisma.callLog.update({
          where: { id: callLogId },
          data: { status: finalStatus, endedAt: new Date(), duration },
        });
      }
    } catch (e) {
      console.error("Error ending call log:", e);
    }
  });

  // Call feature toggling
  socket.on("call:mute:toggle", (rawData) => {
    const parsed = validateSocketData(callToggleSchema, rawData);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.peerId}`).emit("call:mute:toggle", {
      userId,
      isMuted: parsed.data.isMuted,
    });
  });

  socket.on("call:screenshare:toggle", (rawData) => {
    const parsed = validateSocketData(callToggleSchema, rawData);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.peerId}`).emit("call:screenshare:toggle", {
      userId,
      isSharing: parsed.data.isSharing,
    });
  });

  // Video upgrade invitation
  socket.on("call:video-upgrade:request", (rawData) => {
    const parsed = validateSocketData(callPeerSchema, rawData);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.peerId}`).emit("call:video-upgrade:request", {
      userId,
    });
  });

  socket.on("call:video-upgrade:accept", (rawData) => {
    const parsed = validateSocketData(callPeerSchema, rawData);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.peerId}`).emit("call:video-upgrade:accepted", {
      userId,
    });
  });

  socket.on("call:video-upgrade:reject", (rawData) => {
    const parsed = validateSocketData(callPeerSchema, rawData);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.peerId}`).emit("call:video-upgrade:rejected", {
      userId,
    });
  });
}
