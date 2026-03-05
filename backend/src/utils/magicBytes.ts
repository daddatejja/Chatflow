import fs from "fs";

// Magic byte signatures for common file types
const MAGIC_SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  // Images
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  {
    mime: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header; WEBP at offset 8
  { mime: "image/bmp", bytes: [0x42, 0x4d] },

  // Audio
  { mime: "audio/mpeg", bytes: [0xff, 0xfb] }, // MP3 frame sync
  { mime: "audio/mpeg", bytes: [0xff, 0xf3] },
  { mime: "audio/mpeg", bytes: [0xff, 0xf2] },
  { mime: "audio/mpeg", bytes: [0x49, 0x44, 0x33] }, // ID3 tag
  { mime: "audio/wav", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
  { mime: "audio/ogg", bytes: [0x4f, 0x67, 0x67, 0x53] },
  { mime: "audio/aac", bytes: [0xff, 0xf1] },
  { mime: "audio/aac", bytes: [0xff, 0xf9] },

  // Video
  { mime: "video/mp4", bytes: [0x00, 0x00, 0x00], offset: 0 }, // ftyp box (various offsets)
  { mime: "video/webm", bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML header (Matroska/WebM)
  { mime: "video/ogg", bytes: [0x4f, 0x67, 0x67, 0x53] },

  // Documents
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK (also covers docx/xlsx)
];

/**
 * Validates a file's actual content against its declared MIME type
 * by reading the magic bytes (file signature) from the file header.
 *
 * @returns true if the file's magic bytes are consistent with known signatures,
 *          or if the file type has no known signature (allow unknown).
 *          Returns false if magic bytes contradict the declared MIME type.
 */
export function validateMagicBytes(
  filePath: string,
  declaredMime: string,
): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    // Find matching signatures for the declared MIME type
    const category = declaredMime.split("/")[0]; // image, audio, video, application, text
    const signaturesForCategory = MAGIC_SIGNATURES.filter((sig) =>
      sig.mime.startsWith(category + "/"),
    );

    // If no signatures exist for this category (e.g., text/csv), allow it
    if (signaturesForCategory.length === 0) {
      return true;
    }

    // Check if the file's bytes match ANY known signature in the same category
    for (const sig of signaturesForCategory) {
      const offset = sig.offset ?? 0;
      let matches = true;
      for (let i = 0; i < sig.bytes.length; i++) {
        if (buffer[offset + i] !== sig.bytes[i]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }

    // If we have signatures for this category but none matched, reject
    return false;
  } catch {
    // If we can't read the file, reject as a safety measure
    return false;
  }
}
