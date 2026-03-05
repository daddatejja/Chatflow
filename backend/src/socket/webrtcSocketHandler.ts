import { Socket, Server } from "socket.io";
import {
  validateSocketData,
  webrtcOfferSchema,
  webrtcAnswerSchema,
  webrtcIceCandidateSchema,
} from "../utils/socketValidation";

export function registerWebRTCHandlers(
  socket: Socket,
  io: Server,
  userId: string,
) {
  socket.on("webrtc:offer", (rawData) => {
    const parsed = validateSocketData(webrtcOfferSchema, rawData);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.peerId}`).emit("webrtc:offer", {
      userId,
      offer: parsed.data.offer,
    });
  });

  socket.on("webrtc:answer", (rawData) => {
    const parsed = validateSocketData(webrtcAnswerSchema, rawData);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.peerId}`).emit("webrtc:answer", {
      userId,
      answer: parsed.data.answer,
    });
  });

  socket.on("webrtc:ice-candidate", (rawData) => {
    const parsed = validateSocketData(webrtcIceCandidateSchema, rawData);
    if (!parsed.success) return;
    io.to(`user:${parsed.data.peerId}`).emit("webrtc:ice-candidate", {
      userId,
      candidate: parsed.data.candidate,
    });
  });
}
