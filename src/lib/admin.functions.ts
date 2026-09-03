import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only server functions for the provider usage dashboard. Every handler
 * verifies the caller's admin role through the caller's own (RLS-scoped)
 * client before touching privileged data. No credentials are ever returned.
 */

type AuthedContext = { supabase: any; userId: string };

async function assertAdmin(context: AuthedContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export type ProviderStat = {
  provider: string;
  requests: number;
  success: number;
  failed: number;
  rateLimited: number;
  avgLatencyMs: number;
  tokens: number;
  cost: number;
  fallbacks: number;
};

export type DashboardData = {
  range: { from: string; to: string };
  totals: {
    requests: number;
    success: number;
    failed: number;
    rateLimited: number;
    avgLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    fallbacks: number;
    todayRequests: number;
    todayCost: number;
    monthRequests: number;
    monthCost: number;
  };
  byProvider: ProviderStat[];
  byModel: { model: string; provider: string; requests: number; tokens: number; cost: number }[];
  byTask: { task: string; requests: number }[];
  daily: { day: string; requests: number; failed: number; cost: number }[];
  providers: {
    provider: string;
    label: string;
    enabled: boolean;
    priority: number;
    configured: boolean;
    paid: boolean;
    tasks: string[];
    models: Record<string, string>;
    dailyRequestCap: number | null;
    monthlyRequestCap: number | null;
    coolingDown: { untilIso: string; failures: number; reason: string } | null;
  }[];
  settings: Record<string, unknown>;
};

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    await assertAdmin(context as AuthedContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { breakerSnapshot, loadProviderConfig, loadSettings } = await import("@/lib/ai/router.server");
    const { buildAdapters } = await import("@/lib/ai/providers/registry.server");

    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [{ data: events }, rows, settings] = await Promise.all([
      supabaseAdmin
        .from("usage_events")
        .select(
          "provider, model, task_type, input_tokens, output_tokens, total_tokens, latency_ms, status, estimated_cost, fallback_used, created_at",
        )
        .eq("kind", "chat")
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: false })
        .limit(50_000),
      loadProviderConfig(true),
      loadSettings(true),
    ]);

    const totals: DashboardData["totals"] = {
      requests: 0,
      success: 0,
      failed: 0,
      rateLimited: 0,
      avgLatencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
      fallbacks: 0,
      todayRequests: 0,
      todayCost: 0,
      monthRequests: 0,
      monthCost: 0,
    };
    const providerMap = new Map<string, ProviderStat & { latencySum: number; latencyCount: number }>();
    const modelMap = new Map<string, { model: string; provider: string; requests: number; tokens: number; cost: number }>();
    const taskMap = new Map<string, number>();
    const dayMap = new Map<string, { day: string; requests: number; failed: number; cost: number }>();
    let latencySum = 0;
    let latencyCount = 0;

    for (const event of events ?? []) {
      const provider = event.provider ?? "unknown";
      const model = event.model ?? "unknown";
      const cost = Number(event.estimated_cost ?? 0);
      const tokens = Number(event.total_tokens ?? 0);
      const isSuccess = event.status === "success";
      const isRate = event.status === "rate_limited";
      const isFailed = event.status === "error" || isRate;

      totals.requests += 1;
      if (isSuccess) totals.success += 1;
      if (isFailed) totals.failed += 1;
      if (isRate) totals.rateLimited += 1;
      totals.inputTokens += Number(event.input_tokens ?? 0);
      totals.outputTokens += Number(event.output_tokens ?? 0);
      totals.totalTokens += tokens;
      totals.cost += cost;
      if (event.fallback_used) totals.fallbacks += 1;
      if (event.created_at >= dayStart) {
        totals.todayRequests += 1;
        totals.todayCost += cost;
      }
      if (event.created_at >= monthStart) {
        totals.monthRequests += 1;
        totals.monthCost += cost;
      }
      if (event.latency_ms != null && isSuccess) {
        latencySum += event.latency_ms;
        latencyCount += 1;
      }

      const p = providerMap.get(provider) ?? {
        provider,
        requests: 0,
        success: 0,
        failed: 0,
        rateLimited: 0,
        avgLatencyMs: 0,
        tokens: 0,
        cost: 0,
        fallbacks: 0,
        latencySum: 0,
        latencyCount: 0,
      };
      p.requests += 1;
      if (isSuccess) p.success += 1;
      if (isFailed) p.failed += 1;
      if (isRate) p.rateLimited += 1;
      p.tokens += tokens;
      p.cost += cost;
      if (event.fallback_used) p.fallbacks += 1;
      if (event.latency_ms != null && isSuccess) {
        p.latencySum += event.latency_ms;
        p.latencyCount += 1;
      }
      providerMap.set(provider, p);

      const key = `${provider}:${model}`;
      const m = modelMap.get(key) ?? { model, provider, requests: 0, tokens: 0, cost: 0 };
      m.requests += 1;
      m.tokens += tokens;
      m.cost += cost;
      modelMap.set(key, m);

      const task = event.task_type ?? "unknown";
      taskMap.set(task, (taskMap.get(task) ?? 0) + 1);

      const day = event.created_at.slice(0, 10);
      const d = dayMap.get(day) ?? { day, requests: 0, failed: 0, cost: 0 };
      d.requests += 1;
      if (isFailed) d.failed += 1;
      d.cost += cost;
      dayMap.set(day, d);
    }
    totals.avgLatencyMs = latencyCount ? Math.round(latencySum / latencyCount) : 0;

    const breakers = breakerSnapshot();
    const adapters = buildAdapters(rows);

    return {
      range: { from: from.toISOString(), to: now.toISOString() },
      totals,
      byProvider: [...providerMap.values()]
        .map(({ latencySum: ls, latencyCount: lc, ...rest }) => ({
          ...rest,
          avgLatencyMs: lc ? Math.round(ls / lc) : 0,
        }))
        .sort((a, b) => b.requests - a.requests),
      byModel: [...modelMap.values()].sort((a, b) => b.requests - a.requests),
      byTask: [...taskMap.entries()].map(([task, requests]) => ({ task, requests })).sort((a, b) => b.requests - a.requests),
      daily: [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
      providers: adapters
        .map((adapter) => ({
          provider: adapter.id,
          label: adapter.label,
          enabled: adapter.enabled,
          priority: adapter.priority,
          configured: adapter.configured,
          paid: adapter.paid,
          tasks: (rows.find((r) => r.provider === adapter.id)?.tasks ?? []) as string[],
          models: (rows.find((r) => r.provider === adapter.id)?.models ?? {}) as Record<string, string>,
          dailyRequestCap: adapter.dailyRequestCap,
          monthlyRequestCap: adapter.monthlyRequestCap,
          coolingDown: breakers[adapter.id] ?? null,
        }))
        .sort((a, b) => a.priority - b.priority),
      settings: settings as unknown as Record<string, unknown>,
    };
  });

const ProviderUpdateSchema = z.object({
  provider: z.string().min(1).max(40),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  paid: z.boolean().optional(),
  dailyRequestCap: z.number().int().min(0).nullable().optional(),
  monthlyRequestCap: z.number().int().min(0).nullable().optional(),
  models: z.record(z.string(), z.string().min(1).max(120)).optional(),
});

export const updateProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProviderUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as AuthedContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invalidateRouterCaches } = await import("@/lib/ai/router.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.priority !== undefined) patch["priority"] = data.priority;
    if (data.paid !== undefined) patch["paid"] = data.paid;
    if (data.dailyRequestCap !== undefined) patch["daily_request_cap"] = data.dailyRequestCap;
    if (data.monthlyRequestCap !== undefined) patch["monthly_request_cap"] = data.monthlyRequestCap;
    if (data.models !== undefined) patch["models"] = data.models;
    const { error } = await supabaseAdmin
      .from("ai_provider_config")
      .update(patch as never)
      .eq("provider", data.provider);
    if (error) throw new Error("Could not update provider.");
    invalidateRouterCaches();
    return { ok: true };
  });

const SettingSchema = z.object({
  key: z.enum([
    "MAX_DAILY_REQUESTS",
    "MAX_MONTHLY_REQUESTS",
    "MAX_DAILY_COST",
    "MAX_MONTHLY_COST",
    "MAX_USER_REQUESTS_PER_MINUTE",
    "MAX_USER_REQUESTS_PER_DAY",
    "PAID_BILLING_ENABLED",
  ]),
  value: z.union([z.number().min(0), z.boolean()]),
});

export const updateAiSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SettingSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as AuthedContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invalidateRouterCaches } = await import("@/lib/ai/router.server");
    const { error } = await supabaseAdmin
      .from("ai_settings")
      .upsert({ key: data.key, value: data.value as never, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not update setting.");
    invalidateRouterCaches();
    return { ok: true };
  });

export const getIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context as AuthedContext).supabase.rpc("has_role", {
      _user_id: (context as AuthedContext).userId,
      _role: "admin",
    });
    return { isAdmin: Boolean(data) };
  });
