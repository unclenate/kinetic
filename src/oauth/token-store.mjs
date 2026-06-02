// src/oauth/token-store.mjs
// Persists OAuth tokens to Supabase, encrypted at rest (ADR-0004), and hands
// out fresh access tokens with lazy refresh-on-use.
//
//   saveToken(provider, normalized)  -> upserts encrypted tokens
//   loadToken(provider)              -> a valid access token string, refreshing
//                                       if it is within REFRESH_SKEW of expiry
//
// `normalized` is the shape from src/oauth/index.mjs:
//   { access_token, refresh_token, expires_at (ISO), scopes: string[] }
//
// For v0.5 there is a single seeded demo user (full Supabase Auth is post-v0.5,
// per ADR-0004). The user id is fixed/overridable via KINETIC_DEMO_USER_ID.

import { encryptToken, decryptToken } from "./crypto.mjs";
import { refreshAccessToken } from "./index.mjs";
import * as supabase from "../db/supabase.mjs";

const REFRESH_SKEW_MS = 60_000; // refresh if the token expires within 60s

function demoUserId() {
  return globalThis.process.env.KINETIC_DEMO_USER_ID || "00000000-0000-0000-0000-000000000001";
}

/** True if a stored token row exists for the provider (no decrypt, no refresh). */
export async function hasToken(provider) {
  try {
    const row = await supabase.selectOne(
      "oauth_tokens",
      `provider=eq.${encodeURIComponent(provider)}&user_id=eq.${encodeURIComponent(demoUserId())}`
    );
    return !!row;
  } catch {
    return false;
  }
}

/** Encrypt and upsert a normalized token set for a provider. */
export async function saveToken(provider, normalized) {
  const row = {
    user_id: demoUserId(),
    provider,
    access_token_enc: encryptToken(normalized.access_token),
    refresh_token_enc: normalized.refresh_token ? encryptToken(normalized.refresh_token) : null,
    expires_at: normalized.expires_at || null,
    scopes: normalized.scopes || [],
    updated_at: new Date().toISOString(),
  };
  return supabase.upsert("oauth_tokens", row, "user_id,provider");
}

/**
 * Return a valid access token for `provider`, refreshing on the fly if needed.
 * Throws a "reconnect" error when there is no stored token or refresh fails.
 */
export async function loadToken(provider) {
  const row = await supabase.selectOne(
    "oauth_tokens",
    `provider=eq.${encodeURIComponent(provider)}&user_id=eq.${encodeURIComponent(demoUserId())}`
  );
  if (!row) {
    throw new Error(`oauth: ${provider} is not connected — start at /oauth/${provider}/start`);
  }

  const accessToken = decryptToken(row.access_token_enc);
  const refreshToken = row.refresh_token_enc ? decryptToken(row.refresh_token_enc) : null;

  const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : 0;
  const nearExpiry = !expiresAtMs || expiresAtMs - Date.now() < REFRESH_SKEW_MS;
  if (!nearExpiry) return accessToken;

  if (!refreshToken) {
    throw new Error(`oauth: ${provider} token expired and no refresh token — reconnect at /oauth/${provider}/start`);
  }
  const refreshed = await refreshAccessToken(provider, refreshToken);
  await saveToken(provider, refreshed); // persist the rotated token set
  return refreshed.access_token;
}
