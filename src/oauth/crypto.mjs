// src/oauth/crypto.mjs
// AES-256-GCM encryption for OAuth tokens at rest (ADR-0004).
//
// Tokens are encrypted before they ever reach Supabase; the DB sees ciphertext
// only. The key comes from KINETIC_TOKEN_ENCRYPTION_KEY (32 bytes, base64).
//
// On-the-wire format (a single base64 string):
//   [ iv (12 bytes) | authTag (16 bytes) | ciphertext (n bytes) ]
// GCM's auth tag makes tampering detectable — decrypt throws on any change.
//
// The key is read lazily (per call), not at import time, so the process can
// load .env.local before the first encrypt/decrypt.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function loadKey() {
  const b64 = globalThis.process.env.KINETIC_TOKEN_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "token crypto: KINETIC_TOKEN_ENCRYPTION_KEY is not set. Generate one with " +
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`token crypto: KINETIC_TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

/**
 * Encrypt a token string. Returns a base64 blob safe to store as text.
 * @param {string} plaintext
 * @returns {string}
 */
export function encryptToken(plaintext) {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypt a base64 blob produced by encryptToken. Throws if the key is wrong
 * or the ciphertext was tampered with (GCM authentication failure).
 * @param {string} blob
 * @returns {string}
 */
export function decryptToken(blob) {
  const key = loadKey();
  const buf = Buffer.from(String(blob), "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("token crypto: ciphertext blob is too short to be valid");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (e) {
    // Normalize Node's "Unsupported state or unable to authenticate data".
    throw new Error("token crypto: unable to authenticate ciphertext (wrong key or tampered)");
  }
}
