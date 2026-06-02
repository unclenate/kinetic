// src/oauth/providers.mjs
// Per-provider OAuth 2.0 configuration (Google + Microsoft) and authorization
// URL construction. Scopes follow ADR-0004. Client id/secret and the base URL
// are read lazily from the environment so .env.local can load first.

const _env = () => globalThis.process.env;

function baseUrl() {
  return (_env().KINETIC_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
}

/** The redirect URI to register with the provider and send on every request. */
export function redirectUri(provider) {
  return `${baseUrl()}/oauth/${provider}/callback`;
}

const PROVIDERS = {
  google: {
    authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    clientId: () => _env().GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: () => _env().GOOGLE_OAUTH_CLIENT_SECRET,
    scopes: [
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.activity.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    // access_type=offline + prompt=consent → Google returns a refresh token.
    extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  microsoft: {
    authUrl: () => `https://login.microsoftonline.com/${_env().MICROSOFT_OAUTH_TENANT_ID || "common"}/oauth2/v2.0/authorize`,
    tokenUrl: () => `https://login.microsoftonline.com/${_env().MICROSOFT_OAUTH_TENANT_ID || "common"}/oauth2/v2.0/token`,
    clientId: () => _env().MICROSOFT_OAUTH_CLIENT_ID,
    clientSecret: () => _env().MICROSOFT_OAUTH_CLIENT_SECRET,
    scopes: [
      "openid", "email", "profile", "offline_access",
      "User.Read", "Calendars.Read", "Files.Read.All", "Mail.Read",
    ],
    extraAuthParams: {},
  },
};

/** Look up a provider config; throws on unknown names. */
export function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`oauth: unknown provider "${name}" (expected google | microsoft)`);
  return p;
}

/** True when both client id and secret are configured for a provider. */
export function isConfigured(name) {
  const p = PROVIDERS[name];
  return !!(p && p.clientId() && p.clientSecret());
}

/**
 * Build the provider authorization URL.
 * @param {"google"|"microsoft"} provider
 * @param {{ state: string, codeChallenge: string }} opts
 * @returns {string}
 */
export function buildAuthUrl(provider, { state, codeChallenge }) {
  const p = getProvider(provider);
  const params = new URLSearchParams({
    client_id: p.clientId() || "",
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: p.scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...p.extraAuthParams,
  });
  return `${p.authUrl()}?${params}`;
}
