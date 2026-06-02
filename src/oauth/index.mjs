// src/oauth/index.mjs
// OAuth authorization-code + PKCE coordinator (ADR-0004). Provider-agnostic:
// Google and Microsoft both flow through the same three functions.
//
//   startAuthorization(provider)        -> { url, state, codeVerifier }
//   exchangeCode(provider, {...})       -> normalized token set
//   refreshAccessToken(provider, rt)    -> normalized token set
//
// "Normalized token set" is the shape the token store persists:
//   { access_token, refresh_token, expires_at (ISO), scopes: string[] }
//
// This module is pure flow logic over `fetch` — no storage, no server. The
// server (M7 wiring) keeps state->codeVerifier between /start and /callback and
// hands results to the Supabase token store.

import { getProvider, redirectUri } from "./providers.mjs";
import { buildAuthUrl } from "./providers.mjs";
import { createVerifier, challengeFromVerifier, createState } from "./pkce.mjs";

/**
 * Begin an authorization. The caller must persist { state -> codeVerifier }
 * (e.g. a short-TTL server-side map) and redirect the user to `url`.
 */
export function startAuthorization(provider) {
  getProvider(provider); // validate name early
  const codeVerifier = createVerifier();
  const state = createState();
  const url = buildAuthUrl(provider, { state, codeChallenge: challengeFromVerifier(codeVerifier) });
  return { url, state, codeVerifier };
}

/** Exchange an authorization code (+ the matching PKCE verifier) for tokens. */
export async function exchangeCode(provider, { code, codeVerifier }) {
  const p = getProvider(provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(provider),
    client_id: p.clientId() || "",
    client_secret: p.clientSecret() || "",
    code_verifier: codeVerifier,
  });
  const json = await postForm(p.tokenUrl(), body, provider);
  return normalize(json, null);
}

/** Refresh an access token. Keeps the existing refresh token if none returned. */
export async function refreshAccessToken(provider, refreshToken) {
  const p = getProvider(provider);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: p.clientId() || "",
    client_secret: p.clientSecret() || "",
  });
  const json = await postForm(p.tokenUrl(), body, provider);
  return normalize(json, refreshToken);
}

async function postForm(url, body, provider) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  let json;
  const raw = await res.text();
  try { json = JSON.parse(raw); } catch { json = { _raw: raw }; }
  if (!res.ok || json.error) {
    const detail = json.error_description || json.error || raw.slice(0, 200);
    throw new Error(`oauth ${provider} token endpoint ${res.status}: ${detail}`);
  }
  return json;
}

function normalize(json, fallbackRefresh) {
  const expiresInSec = Number(json.expires_in) || 3600;
  return {
    access_token: json.access_token,
    // Google omits refresh_token on refresh; Microsoft may rotate it. Keep the
    // old one when the response doesn't carry a new one.
    refresh_token: json.refresh_token || fallbackRefresh || null,
    expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    scopes: String(json.scope || "").split(/\s+/).filter(Boolean),
  };
}
