export const AVATAR_BUCKET = "userImages";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIN_DIMENSION = 128;
export const AVATAR_MAX_DIMENSION = 4096;

export type AvatarImageInfo = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
};

function pngDimensions(buffer: Buffer): AvatarImageInfo | null {
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) return null;

  return {
    contentType: "image/png",
    extension: "png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function jpegDimensions(buffer: Buffer): AvatarImageInfo | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (marker === 0xda) break;
    if (offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame && segmentLength >= 7) {
      return {
        contentType: "image/jpeg",
        extension: "jpg",
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(buffer: Buffer): AvatarImageInfo | null {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) return null;

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      contentType: "image/webp",
      extension: "webp",
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (chunk === "VP8 " && buffer.length >= 30 && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return {
      contentType: "image/webp",
      extension: "webp",
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return {
      contentType: "image/webp",
      extension: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

export function inspectAvatarImage(buffer: Buffer): AvatarImageInfo | null {
  return pngDimensions(buffer) ?? jpegDimensions(buffer) ?? webpDimensions(buffer);
}

export function validateAvatarImage(buffer: Buffer): AvatarImageInfo {
  if (buffer.length > AVATAR_MAX_BYTES) {
    throw new Error("file_too_large");
  }

  const info = inspectAvatarImage(buffer);
  if (!info) throw new Error("invalid_image");

  if (
    info.width < AVATAR_MIN_DIMENSION ||
    info.height < AVATAR_MIN_DIMENSION ||
    info.width > AVATAR_MAX_DIMENSION ||
    info.height > AVATAR_MAX_DIMENSION
  ) {
    throw new Error("invalid_dimensions");
  }
  return info;
}

export function managedAvatarPath(
  publicUrl: string | null | undefined,
  authUuid: string,
  supabaseUrl: string,
): string | null {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    if (url.origin !== new URL(supabaseUrl).origin) return null;
    const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    return path.startsWith(`${authUuid}/`) ? path : null;
  } catch {
    return null;
  }
}
