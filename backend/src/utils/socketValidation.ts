import { z } from "zod";

// ==================== Sanitization ====================

/**
 * Strip dangerous HTML/script tags from user-supplied content.
 * Keeps the text but removes any HTML constructs that could lead to XSS.
 */
export function sanitizeContent(input: string): string {
  return (
    input
      // Remove script tags and their content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      // Remove event handler attributes
      .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // Remove javascript: protocol URLs
      .replace(/javascript\s*:/gi, "")
      // Remove remaining HTML tags (keep content inside them)
      .replace(/<\/?[^>]+(>|$)/g, "")
      .trim()
  );
}

// ==================== Direct Message Schemas ====================

export const messageSendSchema = z.object({
  receiverId: z.string().uuid("Invalid receiver ID"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(10000, "Content too long"),
  type: z.string().optional().default("text"),
  duration: z.number().int().positive().optional(),
  replyToId: z.string().uuid().optional().nullable(),
  fileName: z.string().max(500).optional(),
  fileSize: z.number().int().positive().optional(),
  mimeType: z.string().max(200).optional(),
});

export const messageEditSchema = z.object({
  messageId: z.string().uuid("Invalid message ID"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(10000, "Content too long"),
});

export const messageDeleteSchema = z.object({
  messageId: z.string().uuid("Invalid message ID"),
});

export const messageReadSchema = z.object({
  messageId: z.string().uuid("Invalid message ID"),
});

export const messageReactionSchema = z.object({
  messageId: z.string().uuid("Invalid message ID"),
  emoji: z.string().min(1).max(20),
  action: z.enum(["add", "remove"]),
});

// ==================== Group Message Schemas ====================

export const groupMessageSendSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(10000, "Content too long"),
  type: z.string().optional().default("text"),
  duration: z.number().int().positive().optional(),
  replyToId: z.string().uuid().optional().nullable(),
});

export const groupMessageEditSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
  messageId: z.string().uuid("Invalid message ID"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(10000, "Content too long"),
});

export const groupMessageDeleteSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
  messageId: z.string().uuid("Invalid message ID"),
});

export const groupMessageReactionSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
  messageId: z.string().uuid("Invalid message ID"),
  emoji: z.string().min(1).max(20),
  action: z.enum(["add", "remove"]),
});

export const groupJoinSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
});

export const groupLeaveSchema = z.object({
  groupId: z.string().uuid("Invalid group ID"),
});

// ==================== Typing Schemas ====================

export const typingSchema = z
  .object({
    receiverId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
  })
  .refine(
    (data) => data.receiverId || data.groupId,
    "Either receiverId or groupId is required",
  );

// ==================== Call Schemas ====================

export const callInitiateSchema = z.object({
  receiverId: z.string().uuid("Invalid receiver ID"),
  callType: z.enum(["audio", "video"]),
});

export const callAcceptSchema = z.object({
  callerId: z.string().uuid("Invalid caller ID"),
  callLogId: z.string().uuid().optional(),
});

export const callRejectSchema = z.object({
  callerId: z.string().uuid("Invalid caller ID"),
  callLogId: z.string().uuid().optional(),
});

export const callEndSchema = z.object({
  peerId: z.string().uuid("Invalid peer ID"),
  callLogId: z.string().uuid().optional(),
  duration: z.number().int().min(0).optional(),
});

export const callToggleSchema = z.object({
  peerId: z.string().uuid("Invalid peer ID"),
  isMuted: z.boolean().optional(),
  isSharing: z.boolean().optional(),
});

export const callPeerSchema = z.object({
  peerId: z.string().uuid("Invalid peer ID"),
});

// ==================== WebRTC Schemas ====================

export const webrtcOfferSchema = z.object({
  peerId: z.string().uuid("Invalid peer ID"),
  offer: z.object({
    type: z.string(),
    sdp: z.string().optional(),
  }),
});

export const webrtcAnswerSchema = z.object({
  peerId: z.string().uuid("Invalid peer ID"),
  answer: z.object({
    type: z.string(),
    sdp: z.string().optional(),
  }),
});

export const webrtcIceCandidateSchema = z.object({
  peerId: z.string().uuid("Invalid peer ID"),
  candidate: z.object({
    candidate: z.string().optional(),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
  }),
});

// ==================== Helper ====================

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = { success: false; error: string };

/**
 * Validate socket event data against a Zod schema.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateSocketData<T>(
  schema: z.ZodType<T, any, any>,
  data: unknown,
): ValidationSuccess<T> | ValidationFailure {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as T };
  }
  const errorMsg = result.error.issues
    .map((i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { success: false, error: errorMsg };
}
