import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BrandMark, BrandWordmark } from "@/components/Brand";
import { AuthGate } from "@/components/chat/AuthGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminDashboard, updateAiSetting, updateProviderConfig, type DashboardData } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Priyanshu 2.o — AI Usage Dashboard" },
      { name: "description", content: "Internal provider usage, cost and reliability dashboard for Priyanshu 2.o." },
      { property: "og:title", content: "Priyanshu 2.o — AI Usage Dashboard" },
      { property: "og:description", content: "Internal provider usage, cost and reliability dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AuthGate>
      <AdminPage />
    </AuthGate>
  ),
});

const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;
const num = (value: number) => value.toLocaleString();

function AdminPage() {
  const fetchDashboard = useServerFn(getAdminDashboard);
  const query = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => fetchDashboard(), retry: false });

  if (query.isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="app-aurora flex h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldAlert className="size-10 text-destructive" />
        <h1 className="font-display text-2xl font-semibold">Admin access required</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This dashboard is only available to the application owner.
        </p>
        <Button asChild variant="secondary">
          <Link to="/">
            <ArrowLeft className="size-4" /> Back to chat
          </Link>
        </Button>
      </div>
    );
  }

  return <Dashboard data={query.data} />;
}

function Dashboard({ data }: { data: DashboardData }) {
  const queryClient = useQueryClient();
  const updateProvider = useServerFn(updateProviderConfig);
  const updateSetting = useServerFn(updateAiSetting);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });

  const providerMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateProvider>[0]) => updateProvider(input),
    onSuccess: () => {
      toast.success("Provider updated");
      void refresh();
    },
    onError: () => toast.error("Could not update provider"),
  });
  const settingMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateSetting>[0]) => updateSetting(input),
    onSuccess: () => {
      toast.success("Limit updated");
      void refresh();
    },
    onError: () => toast.error("Could not update limit"),
  });

  const t = data.totals;
  const successRate = t.requests ? Math.round((t.success / t.requests) * 100) : 0;

  return (
    <div className="app-aurora min-h-[100dvh] overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label="Back to chat">
          <Link to="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <BrandMark className="size-7" />
        <BrandWordmark className="text-sm" />
        <span className="ml-2 text-sm text-muted-foreground">AI usage dashboard · last 30 days</span>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <h1 className="sr-only">Priyanshu 2.o provider usage dashboard</h1>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total requests" value={num(t.requests)} hint={`${successRate}% successful`} />
          <Stat label="Failed" value={num(t.failed)} hint={`${num(t.rateLimited)} rate-limited`} />
          <Stat label="Avg latency" value={`${num(t.avgLatencyMs)} ms`} hint={`${num(t.fallbacks)} fallbacks`} />
          <Stat label="Estimated cost" value={money(t.cost)} hint={`${num(t.totalTokens)} tokens`} />
          <Stat label="Today" value={num(t.todayRequests)} hint={money(t.todayCost)} />
          <Stat label="This month" value={num(t.monthRequests)} hint={money(t.monthCost)} />
          <Stat label="Input tokens" value={num(t.inputTokens)} />
          <Stat label="Output tokens" value={num(t.outputTokens)} />
        </section>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base">Providers</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>429s</TableHead>
                  <TableHead>Avg ms</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.providers.map((provider) => {
                  const stat = data.byProvider.find((p) => p.provider === provider.provider);
                  return (
                    <TableRow key={provider.provider}>
                      <TableCell className="font-medium">{provider.label}</TableCell>
                      <TableCell>
                        {!provider.configured ? (
                          <Badge variant="outline">No key</Badge>
                        ) : provider.coolingDown ? (
                          <Badge variant="destructive" title={provider.coolingDown.reason}>
                            Cooling down
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Ready</Badge>
                        )}
                        {provider.paid ? <Badge className="ml-1" variant="outline">Paid</Badge> : null}
                      </TableCell>
                      <TableCell>
                        <PriorityInput
                          value={provider.priority}
                          onCommit={(priority) =>
                            providerMutation.mutate({ data: { provider: provider.provider, priority } })
                          }
                        />
                      </TableCell>
                      <TableCell>{num(stat?.requests ?? 0)}</TableCell>
                      <TableCell>{num(stat?.failed ?? 0)}</TableCell>
                      <TableCell>{num(stat?.rateLimited ?? 0)}</TableCell>
                      <TableCell>{num(stat?.avgLatencyMs ?? 0)}</TableCell>
                      <TableCell>{money(stat?.cost ?? 0)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={provider.enabled}
                          aria-label={`Enable ${provider.label}`}
                          onCheckedChange={(enabled) =>
                            providerMutation.mutate({ data: { provider: provider.provider, enabled } })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base">Requests by model</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byModel.length ? (
                    data.byModel.slice(0, 12).map((row) => (
                      <TableRow key={`${row.provider}:${row.model}`}>
                        <TableCell className="max-w-[16rem] truncate" title={row.model}>
                          {row.model}
                        </TableCell>
                        <TableCell>{num(row.requests)}</TableCell>
                        <TableCell>{num(row.tokens)}</TableCell>
                        <TableCell>{money(row.cost)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base">Daily usage</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.daily.length ? (
                    data.daily
                      .slice(-14)
                      .reverse()
                      .map((row) => (
                        <TableRow key={row.day}>
                          <TableCell>{row.day}</TableCell>
                          <TableCell>{num(row.requests)}</TableCell>
                          <TableCell>{num(row.failed)}</TableCell>
                          <TableCell>{money(row.cost)}</TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {data.byTask.length ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {data.byTask.map((task) => (
                    <Badge key={task.task} variant="outline">
                      {task.task}: {num(task.requests)}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base">Limits & cost control</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["MAX_DAILY_REQUESTS", "Max requests per day"],
                ["MAX_MONTHLY_REQUESTS", "Max requests per month"],
                ["MAX_DAILY_COST", "Max cost per day (USD)"],
                ["MAX_MONTHLY_COST", "Max cost per month (USD)"],
                ["MAX_USER_REQUESTS_PER_MINUTE", "Per-user requests per minute"],
                ["MAX_USER_REQUESTS_PER_DAY", "Per-user requests per day"],
              ] as const
            ).map(([key, label]) => (
              <LimitInput
                key={key}
                label={label}
                value={Number(data.settings[key] ?? 0)}
                onCommit={(value) => settingMutation.mutate({ data: { key, value } })}
              />
            ))}
            <div className="flex items-center justify-between rounded-xl border border-border/60 p-3 sm:col-span-2 lg:col-span-3">
              <div>
                <p className="text-sm font-medium">Allow paid providers</p>
                <p className="text-xs text-muted-foreground">
                  When off, providers marked as paid are never used even if free ones are exhausted.
                </p>
              </div>
              <Switch
                checked={Boolean(data.settings["PAID_BILLING_ENABLED"])}
                aria-label="Allow paid providers"
                onCheckedChange={(value) =>
                  settingMutation.mutate({ data: { key: "PAID_BILLING_ENABLED", value } })
                }
              />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="glass-panel">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function PriorityInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <Input
      type="number"
      value={draft}
      aria-label="Priority"
      className="h-8 w-20"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = Number(draft);
        if (Number.isFinite(next) && next !== value) onCommit(next);
      }}
    />
  );
}

function LimitInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
      />
    </label>
  );
}
