import assert from "node:assert/strict";
import test from "node:test";
import {
  AVATAR_MAX_BYTES,
  inspectAvatarImage,
  managedAvatarPath,
  validateAvatarImage,
} from "./avatar-image";

function png(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function extendedWebp(width: number, height: number) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

function jpeg(width: number, height: number) {
  const buffer = Buffer.alloc(21);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  buffer[3] = 0xc0;
  buffer.writeUInt16BE(17, 4);
  buffer[6] = 8;
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

test("reads supported image dimensions from file signatures", () => {
  assert.deepEqual(inspectAvatarImage(png(512, 256)), {
    contentType: "image/png",
    extension: "png",
    width: 512,
    height: 256,
  });
  assert.equal(inspectAvatarImage(jpeg(300, 200))?.contentType, "image/jpeg");
  assert.equal(inspectAvatarImage(jpeg(300, 200))?.height, 200);
  assert.equal(inspectAvatarImage(extendedWebp(640, 480))?.width, 640);
  assert.equal(inspectAvatarImage(Buffer.from("%PDF")), null);
});

test("enforces avatar size and dimension limits", () => {
  assert.equal(validateAvatarImage(png(128, 4096)).height, 4096);
  assert.throws(() => validateAvatarImage(png(127, 512)), /invalid_dimensions/);
  assert.throws(() => validateAvatarImage(png(512, 4097)), /invalid_dimensions/);
  assert.throws(() => validateAvatarImage(Buffer.alloc(AVATAR_MAX_BYTES + 1)), /file_too_large/);
});

test("only recognizes this project's authenticated user's managed paths", () => {
  const base = "https://project.supabase.co";
  const uuid = "11111111-1111-1111-1111-111111111111";
  const url = `${base}/storage/v1/object/public/userImages/${uuid}/avatar-1.png`;
  assert.equal(managedAvatarPath(url, uuid, base), `${uuid}/avatar-1.png`);
  assert.equal(managedAvatarPath(url, "another-user", base), null);
  assert.equal(managedAvatarPath(`https://evil.example/storage/v1/object/public/userImages/${uuid}/avatar.png`, uuid, base), null);
  assert.equal(managedAvatarPath(`${base}/storage/v1/object/public/documents/${uuid}/avatar.png`, uuid, base), null);
});
