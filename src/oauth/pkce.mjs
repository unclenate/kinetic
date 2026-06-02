// src/oauth/pkce.mjs
// PKCE (RFC 7636) + state helpers for the authorization-code flow.
//
// The verifier is a high-entropy URL-safe string; the challenge is
// base64url(SHA-256(verifier)). The server keeps the verifier server-side
// (keyed by state) between /start and /callback, and sends only the challenge
// to the provider.

import { createHash, randomBytes } from "node:crypto";

function base64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A 43-char (32-byte) URL-safe code verifier. */
export function createVerifier() {
  return base64url(randomBytes(32));
}

/** base64url(SHA-256(verifier)) — the S256 code challenge. */
export function challengeFromVerifier(verifier) {
  return base64url(createHash("sha256").update(String(verifier)).digest());
}

/** Opaque CSRF/state token correlating /start with /callback. */
export function createState() {
  return base64url(randomBytes(16));
}
