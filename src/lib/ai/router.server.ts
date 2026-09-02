import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { buildAdapters } from "./providers/registry.server";
import type { ProviderAdapter, ProviderConfigRow, TaskType } from "./providers/types";

/**
 * Central AI router. Decides which configured providers may serve a request,
 * in which order, and tracks temporary unavailability (rate limits, outages,
 * exhausted quotas) so an unhealthy provider is skipped instead of hammered.
 *
 * All state here is per-server-instance and intentionally conservative: the
 * database remains the source of truth for configuration and usage.
 */

export type RouteRequest = {
  task: TaskType;
  needsTools: boolean;
  needsAttachments: boolean;
};

export type RoutePlan = {
  candidates: ProviderAdapter[];
  /** Human-readable reason when no candidate is available. */
  unavailableReason: string | null;
  settings: AiSettings;
};

export type AiSettings = {
  MAX_DAILY_REQUESTS: number;
  MAX_MONTHLY_REQUESTS: number;
  MAX_DAILY_COST: number;
  MAX_MONTHLY_COST: number;
  MAX_USER_REQUESTS_PER_MINUTE: number;
  MAX_USER_REQUESTS_PER_DAY: number;
  PAID_BILLING_ENABLED: boolean;
};

const DEFAULT_SETTINGS: AiSettings = {
  MAX_DAILY_REQUESTS: 20_000,
  MAX_MONTHLY_REQUESTS: 400_000,
  MAX_DAILY_COST: 5,
  MAX_MONTHLY_COST: 50,
  MAX_USER_REQUESTS_PER_MINUTE: 12,
  MAX_USER_REQUESTS_PER_DAY: 400,
  PAID_BILLING_ENABLED: false,
};

// ---------- circuit breaker ----------

type BreakerState = { until: number; failures: number; reason: string };
const breakers = new Map<string, BreakerState>();

const COOLDOWNS = {
  transient: 30_000, // 5xx / network
  rateLimited: 90_000, // 429 without Retry-After
  quota: 15 * 60_000, // explicit quota exhaustion
  auth: 6 * 60 * 60_000, // 401/403 — key is wrong, no point retrying soon
};

export type FailureKind = "transient" | "rateLimited" | "quota" | "auth" | "bad-request";

export function classifyFailure(error: unknown): { kind: FailureKind; status: number; retryAfterMs: number | null } {
  const e = (error ?? {}) as {
    statusCode?: number;
    status?: number;
    message?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    data?: { error?: { code?: string; message?: string } };
  };
  const status = Number(e.statusCode ?? e.status ?? 0);
  const message = `${e.message ?? ""} ${e.responseBody ?? ""}`.toLowerCase();
  const retryHeader = e.responseHeaders?.["retry-after"];
  const retryAfterMs = retryHeader ? Number(retryHeader) * 1000 || null : null;

  if (status === 401 || status === 403) return { kind: "auth", status, retryAfterMs };
  if (status === 402 || /quota|insufficient_quota|billing|credits/.test(message)) {
    return { kind: "quota", status, retryAfterMs };
  }
  if (status === 429) return { kind: "rateLimited", status, retryAfterMs };
  if (status === 400 || status === 404 || status === 422) return { kind: "bad-request", status, retryAfterMs };
  return { kind: "transient", status, retryAfterMs };
}

export function markProviderFailure(providerId: string, kind: FailureKind, retryAfterMs: number | null, reason: string) {
  const current = breakers.get(providerId);
  const failures = (current?.failures ?? 0) + 1;
  let cooldown = COOLDOWNS[kind === "bad-request" ? "transient" : kind];
  if (retryAfterMs) cooldown = Math.max(cooldown, retryAfterMs);
  // Exponential backoff on repeated failures, capped at 30 minutes.
  cooldown = Math.min(cooldown * 2 ** Math.min(failures - 1, 5), 30 * 60_000);
  breakers.set(providerId, { until: Date.now() + cooldown, failures, reason });
}

export function markProviderSuccess(providerId: string) {
  breakers.delete(providerId);
}

export function isProviderCoolingDown(providerId: string): BreakerState | null {
  const state = breakers.get(providerId);
  if (!state) return null;
  if (state.until <= Date.now()) {
    breakers.delete(providerId);
    return null;
  }
  return state;
}

export function breakerSnapshot(): Record<string, { untilIso: string; failures: number; reason: string }> {
  const out: Record<string, { untilIso: string; failures: number; reason: string }> = {};
  for (const [id, state] of breakers) {
    if (state.until > Date.now()) {
      out[id] = { untilIso: new Date(state.until).toISOString(), failures: state.failures, reason: state.reason };
    }
  }
  return out;
}

// ---------- config + usage caches ----------

type Cached<T> = { value: T; expires: number };
let configCache: Cached<ProviderConfigRow[]> | null = null;
let settingsCache: Cached<AiSettings> | null = null;
let usageCache: Cached<UsageSnapshot> | null = null;

const CONFIG_TTL = 30_000;
const USAGE_TTL = 20_000;

export async function loadProviderConfig(force = false): Promise<ProviderConfigRow[]> {
  if (!force && configCache && configCache.expires > Date.now()) return configCache.value;
  const { data } = await supabaseAdmin.from("ai_provider_config").select("*");
  const rows = (data ?? []) as unknown as ProviderConfigRow[];
  configCache = { value: rows, expires: Date.now() + CONFIG_TTL };
  return rows;
}

export async function loadSettings(force = false): Promise<AiSettings> {
  if (!force && settingsCache && settingsCache.expires > Date.now()) return settingsCache.value;
  const { data } = await supabaseAdmin.from("ai_settings").select("key, value");
  const settings: AiSettings = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    const key = row.key as keyof AiSettings;
    if (!(key in settings)) continue;
    const value = row.value as unknown;
    if (key === "PAID_BILLING_ENABLED") settings[key] = value === true || value === "true";
    else if (typeof value === "number") (settings as Record<string, unknown>)[key] = value;
    else if (typeof value === "string" && !Number.isNaN(Number(value))) {
      (settings as Record<string, unknown>)[key] = Number(value);
    }
  }
  settingsCache = { value: settings, expires: Date.now() + CONFIG_TTL };
  return settings;
}

export function invalidateRouterCaches() {
  configCache = null;
  settingsCache = null;
  usageCache = null;
}

type UsageSnapshot = {
  dayRequests: number;
  monthRequests: number;
  dayCost: number;
  monthCost: number;
  byProviderDay: Record<string, number>;
  byProviderMonth: Record<string, number>;
};

async function loadUsageSnapshot(): Promise<UsageSnapshot> {
  if (usageCache && usageCache.expires > Date.now()) return usageCache.value;
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data } = await supabaseAdmin
    .from("usage_events")
    .select("provider, estimated_cost, created_at")
    .eq("kind", "chat")
    .gte("created_at", monthStart)
    .limit(50_000);

  const snapshot: UsageSnapshot = {
    dayRequests: 0,
    monthRequests: 0,
    dayCost: 0,
    monthCost: 0,
    byProviderDay: {},
    byProviderMonth: {},
  };
  for (const row of data ?? []) {
    const provider = row.provider ?? "unknown";
    const cost = Number(row.estimated_cost ?? 0);
    snapshot.monthRequests += 1;
    snapshot.monthCost += cost;
    snapshot.byProviderMonth[provider] = (snapshot.byProviderMonth[provider] ?? 0) + 1;
    if (row.created_at >= dayStart) {
      snapshot.dayRequests += 1;
      snapshot.dayCost += cost;
      snapshot.byProviderDay[provider] = (snapshot.byProviderDay[provider] ?? 0) + 1;
    }
  }
  usageCache = { value: snapshot, expires: Date.now() + USAGE_TTL };
  return snapshot;
}

// ---------- per-user rate limiting ----------

const userMinuteWindow = new Map<string, number[]>();

export async function checkUserRateLimit(userId: string, settings: AiSettings): Promise<string | null> {
  const now = Date.now();
  const stamps = (userMinuteWindow.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (stamps.length >= settings.MAX_USER_REQUESTS_PER_MINUTE) {
    return "You are sending messages very quickly. Please wait a moment and try again.";
  }
  stamps.push(now);
  userMinuteWindow.set(userId, stamps);

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "chat")
    .gte("created_at", dayStart.toISOString());
  if ((count ?? 0) >= settings.MAX_USER_REQUESTS_PER_DAY) {
    return "You have reached today's message limit. Please come back tomorrow.";
  }
  return null;
}

// ---------- planning ----------

const CAPACITY_MESSAGE =
  "Priyanshu 2.o is at full capacity right now. Please try again in a few minutes.";

export async function planRoute(request: RouteRequest): Promise<RoutePlan> {
  const [rows, settings, usage] = await Promise.all([
    loadProviderConfig(),
    loadSettings(),
    loadUsageSnapshot(),
  ]);

  if (usage.dayRequests >= settings.MAX_DAILY_REQUESTS || usage.monthRequests >= settings.MAX_MONTHLY_REQUESTS) {
    return { candidates: [], unavailableReason: CAPACITY_MESSAGE, settings };
  }
  if (usage.dayCost >= settings.MAX_DAILY_COST || usage.monthCost >= settings.MAX_MONTHLY_COST) {
    return { candidates: [], unavailableReason: CAPACITY_MESSAGE, settings };
  }

  const adapters = buildAdapters(rows)
    .filter((adapter) => adapter.configured && adapter.enabled)
    .filter((adapter) => adapter.supportsTask(request.task))
    .filter((adapter) => !request.needsTools || adapter.supportsTools)
    .filter((adapter) => !request.needsAttachments || adapter.supportsAttachments)
    .filter((adapter) => !adapter.paid || settings.PAID_BILLING_ENABLED)
    .filter((adapter) => !isProviderCoolingDown(adapter.id))
    .filter((adapter) => {
      const day = usage.byProviderDay[adapter.id] ?? 0;
      const month = usage.byProviderMonth[adapter.id] ?? 0;
      if (adapter.dailyRequestCap != null && day >= adapter.dailyRequestCap) return false;
      if (adapter.monthlyRequestCap != null && month >= adapter.monthlyRequestCap) return false;
      return true;
    })
    .sort((a, b) => a.priority - b.priority);

  const ordered = applyTaskPreference(adapters, request.task);
  return {
    candidates: ordered,
    unavailableReason: ordered.length ? null : CAPACITY_MESSAGE,
    settings,
  };
}

/**
 * Task-specific preferences on top of the global priority table. Gemini-class
 * providers lead multimodal/reasoning work; Groq/Cerebras lead low-latency
 * plain-text and coding work.
 */
function applyTaskPreference(adapters: ProviderAdapter[], task: TaskType): ProviderAdapter[] {
  const boost: Record<string, number> = {};
  if (task === "general" || task === "coding" || task === "translation") {
    boost["groq"] = -100;
    boost["cerebras"] = -90;
    boost["mistral"] = -50;
  }
  if (task === "coding") boost["mistral"] = -80;
  if (task === "reasoning" || task === "math") {
    boost["lovable"] = -100;
    boost["gemini"] = -100;
    boost["mistral"] = -20;
  }
  if (task === "multimodal" || task === "vision" || task === "document" || task === "video") {
    boost["lovable"] = -100;
    boost["gemini"] = -100;
  }
  return adapters
    .slice()
    .sort((a, b) => a.priority + (boost[a.id] ?? 0) - (b.priority + (boost[b.id] ?? 0)));
}

export function estimateCost(adapter: ProviderAdapter, inputTokens: number, outputTokens: number): number {
  return (inputTokens * adapter.pricing.input + outputTokens * adapter.pricing.output) / 1_000_000;
}

export type UsageRecord = {
  userId: string;
  conversationId: string;
  provider: string;
  model: string;
  taskType: TaskType;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: "success" | "error" | "rate_limited" | "aborted";
  errorCode?: string | null;
  estimatedCost: number;
  fallbackUsed: boolean;
};

/** Fire-and-forget usage log; never throws into the request path. */
export function recordUsage(record: UsageRecord): void {
  void supabaseAdmin
    .from("usage_events")
    .insert({
      user_id: record.userId,
      conversation_id: record.conversationId,
      kind: "chat",
      provider: record.provider,
      model: record.model,
      task_type: record.taskType,
      input_tokens: Math.round(record.inputTokens),
      output_tokens: Math.round(record.outputTokens),
      total_tokens: Math.round(record.inputTokens + record.outputTokens),
      latency_ms: Math.round(record.latencyMs),
      status: record.status,
      error_code: record.errorCode ?? null,
      estimated_cost: Number(record.estimatedCost.toFixed(6)),
      fallback_used: record.fallbackUsed,
    })
    .then(({ error }) => {
      if (error) console.error("[usage] insert failed", error.message);
      usageCache = null;
    });
}
