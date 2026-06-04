// src/providers/router.mjs
// Privacy-aware routing decision (Phase B). Pure + synchronous: given the
// pre-LLM signals (source + domainHint + any per-request override) it returns
// which provider runs and whether the capture is sensitive. Availability
// (fail-closed) and persistence-encryption are enforced by the caller, not here.

import { residencyOf } from "./registry.mjs";

const _env = () => globalThis.process.env;
const localProvider = () => _env().KINETIC_LOCAL_PROVIDER || "ollama";
const cloudProvider = () => _env().KINETIC_CLOUD_PROVIDER || "claude";
const localSources = () =>
  (_env().KINETIC_LOCAL_SOURCES || "").split(",").map((s) => s.trim()).filter(Boolean);

/** True when the capture's source is pinned to local routing. */
export function isSourcePinned(source) {
  return !!source && localSources().includes(source);
}

/**
 * Sensitive = not a positive `business` signal. A pinned source, a non-business
 * domain hint, an `unknown` hint, or a missing hint are all sensitive (privacy
 * as the default).
 */
export function isSensitive(domainHint, source) {
  if (isSourcePinned(source)) return true;
  return domainHint !== "business";
}

/**
 * Build the routing override for a request. A per-request provider override is
 * the USER's explicit choice and must carry its OWN `acknowledge_cloud` — it does
 * NOT inherit the operator's forced-provider acknowledgment (otherwise the
 * cloud-ack gate could be bypassed). When the body has no provider override, the
 * operator's forced override (which carries its ack) is used, or `{}` to let
 * routing decide. A `model` hint from the body is always honored.
 * @param {{ provider?: string, acknowledge_cloud?: boolean }} forced
 * @param {{ provider?: string, model?: string, acknowledge_cloud?: boolean }} body
 * @returns {{ provider?: string, model?: string, acknowledge_cloud?: boolean }}
 */
export function buildOverride(forced = {}, body = {}) {
  if (body.provider) {
    const o = { provider: body.provider };
    if (body.model) o.model = body.model;
    if (body.acknowledge_cloud) o.acknowledge_cloud = true;
    return o;
  }
  const o = { ...forced };
  if (body.model) o.model = body.model;
  return o;
}

/**
 * @param {{ source?: string, domainHint?: string, override?: { provider?: string, model?: string, acknowledge_cloud?: boolean } }} input
 * @returns {{ provider: string, model: string|null, residency: "local"|"cloud", sensitive: boolean, requiresCloudAck: boolean }}
 */
export function resolve({ source, domainHint, override = {} } = {}) {
  const sensitive = isSensitive(domainHint, source);

  let provider;
  if (override.provider) provider = override.provider;
  else if (isSourcePinned(source)) provider = localProvider();
  else if (sensitive) provider = localProvider();
  else provider = cloudProvider();

  const residency = residencyOf(provider);
  const requiresCloudAck = sensitive && residency === "cloud" && !override.acknowledge_cloud;
  return { provider, model: override.model || null, residency, sensitive, requiresCloudAck };
}
