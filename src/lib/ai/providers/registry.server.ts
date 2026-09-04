import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { GATEWAY_BASE_URL } from "../config.server";
import type { ProviderAdapter, ProviderConfigRow, ProviderPricing, TaskType } from "./types";

/**
 * Static, code-level definition of every supported provider. Everything that
 * can change at runtime (enabled, priority, models, caps) lives in the
 * `ai_provider_config` table and is merged on top of these defaults, so a new
 * provider only needs an entry here plus a server-side key.
 *
 * Credentials are read from server environment variables only — never shipped
 * to the browser.
 */
type ProviderDefinition = {
  id: string;
  label: string;
  envKey: string;
  baseURL: string | ((env: Record<string, string | undefined>) => string | null);
  /** Extra headers beyond the bearer Authorization header. */
  headers?: (key: string) => Record<string, string>;
  authHeader?: (key: string) => Record<string, string>;
  supportsTools: boolean;
  supportsAttachments: boolean;
  defaultTasks: TaskType[];
  defaultModels: Partial<Record<TaskType, string>> & { general: string };
  defaultPriority: number;
  pricing: ProviderPricing;
};

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "lovable",
    label: "Priyanshu Cloud AI",
    envKey: "LOVABLE_API_KEY",
    baseURL: GATEWAY_BASE_URL,
    authHeader: (key) => ({ "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }),
    supportsTools: true,
    supportsAttachments: true,
    defaultTasks: [
      "general",
      "coding",
      "math",
      "reasoning",
      "multimodal",
      "vision",
      "document",
      "video",
      "translation",
    ],
    defaultModels: {
      general: "google/gemini-3.7-flash",
      coding: "google/gemini-3.7-flash",
      math: "google/gemini-3.1-pro-preview",
      reasoning: "google/gemini-3.1-pro-preview",
      multimodal: "google/gemini-3.7-flash",
      vision: "google/gemini-3.7-flash",
      document: "google/gemini-3.7-flash",
      video: "google/gemini-3.7-flash",
      translation: "google/gemini-3.7-flash",
    },
    defaultPriority: 5,
    pricing: { input: 0.3, output: 2.5 },
  },
  {
    id: "gemini",
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    supportsTools: true,
    supportsAttachments: true,
    defaultTasks: [
      "general",
      "coding",
      "math",
      "reasoning",
      "multimodal",
      "vision",
      "document",
      "video",
      "translation",
    ],
    defaultModels: {
      general: "gemini-2.5-flash",
      coding: "gemini-2.5-flash",
      math: "gemini-2.5-pro",
      reasoning: "gemini-2.5-pro",
      multimodal: "gemini-2.5-flash",
      vision: "gemini-2.5-flash",
      document: "gemini-2.5-flash",
      video: "gemini-2.5-flash",
      translation: "gemini-2.5-flash",
    },
    defaultPriority: 10,
    pricing: { input: 0.3, output: 2.5 },
  },
  {
    id: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
    supportsTools: true,
    supportsAttachments: false,
    defaultTasks: ["general", "coding", "math", "reasoning", "translation"],
    defaultModels: {
      general: "llama-3.3-70b-versatile",
      coding: "llama-3.3-70b-versatile",
      math: "llama-3.3-70b-versatile",
      reasoning: "llama-3.3-70b-versatile",
      translation: "llama-3.3-70b-versatile",
    },
    defaultPriority: 20,
    pricing: { input: 0.59, output: 0.79 },
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    baseURL: "https://api.mistral.ai/v1",
    supportsTools: true,
    supportsAttachments: false,
    defaultTasks: ["general", "coding", "document", "reasoning", "translation"],
    defaultModels: {
      general: "mistral-small-latest",
      coding: "codestral-latest",
      document: "mistral-small-latest",
      reasoning: "mistral-large-latest",
      translation: "mistral-small-latest",
    },
    defaultPriority: 30,
    pricing: { input: 0.2, output: 0.6 },
  },
  {
    id: "cerebras",
    label: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    baseURL: "https://api.cerebras.ai/v1",
    supportsTools: true,
    supportsAttachments: false,
    defaultTasks: ["general", "coding", "math"],
    defaultModels: { general: "llama-3.3-70b", coding: "llama-3.3-70b", math: "llama-3.3-70b" },
    defaultPriority: 40,
    pricing: { input: 0.6, output: 0.6 },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    headers: () => ({ "X-Title": "Priyanshu 2.o" }),
    supportsTools: true,
    supportsAttachments: true,
    defaultTasks: ["general", "coding", "math", "reasoning", "translation", "multimodal", "vision"],
    defaultModels: {
      general: "meta-llama/llama-3.3-70b-instruct:free",
      coding: "meta-llama/llama-3.3-70b-instruct:free",
      reasoning: "deepseek/deepseek-r1:free",
      math: "deepseek/deepseek-r1:free",
    },
    defaultPriority: 50,
    pricing: { input: 0, output: 0 },
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    envKey: "CLOUDFLARE_API_TOKEN",
    baseURL: (env) => {
      const account = env["CLOUDFLARE_ACCOUNT_ID"];
      return account ? `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1` : null;
    },
    supportsTools: false,
    supportsAttachments: false,
    defaultTasks: ["general", "coding"],
    defaultModels: {
      general: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      coding: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    },
    defaultPriority: 60,
    pricing: { input: 0.29, output: 2.25 },
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    envKey: "HF_TOKEN",
    baseURL: "https://router.huggingface.co/v1",
    supportsTools: false,
    supportsAttachments: false,
    defaultTasks: ["general", "coding", "reasoning"],
    defaultModels: {
      general: "meta-llama/Llama-3.3-70B-Instruct",
      coding: "meta-llama/Llama-3.3-70B-Instruct",
      reasoning: "meta-llama/Llama-3.3-70B-Instruct",
    },
    defaultPriority: 70,
    pricing: { input: 0.3, output: 0.6 },
  },
  {
    id: "cohere",
    label: "Cohere",
    envKey: "COHERE_API_KEY",
    baseURL: "https://api.cohere.ai/compatibility/v1",
    supportsTools: true,
    supportsAttachments: false,
    defaultTasks: ["general", "translation", "document"],
    defaultModels: {
      general: "command-r-plus-08-2024",
      translation: "command-r-plus-08-2024",
      document: "command-r-plus-08-2024",
    },
    defaultPriority: 80,
    pricing: { input: 2.5, output: 10 },
  },
];

class OpenAICompatibleAdapter implements ProviderAdapter {
  private readonly definition: ProviderDefinition;
  private readonly key: string | undefined;
  private readonly url: string | null;
  private readonly row: ProviderConfigRow | undefined;

  constructor(definition: ProviderDefinition, row?: ProviderConfigRow) {
    this.definition = definition;
    this.row = row;
    const env = process.env;
    this.key = env[definition.envKey];
    this.url =
      typeof definition.baseURL === "function" ? definition.baseURL(env) : definition.baseURL;
  }

  get id() {
    return this.definition.id;
  }
  get label() {
    return this.row?.label ?? this.definition.label;
  }
  get configured() {
    return Boolean(this.key && this.url);
  }
  get supportsTools() {
    return this.definition.supportsTools;
  }
  get supportsAttachments() {
    return this.definition.supportsAttachments;
  }
  get pricing() {
    return this.definition.pricing;
  }
  get priority() {
    return this.row?.priority ?? this.definition.defaultPriority;
  }
  get enabled() {
    return this.row ? this.row.enabled : true;
  }
  get paid() {
    return this.row?.paid ?? false;
  }
  get dailyRequestCap() {
    return this.row?.daily_request_cap ?? null;
  }
  get monthlyRequestCap() {
    return this.row?.monthly_request_cap ?? null;
  }

  supportsTask(task: TaskType): boolean {
    const tasks = this.row?.tasks?.length ? this.row.tasks : this.definition.defaultTasks;
    return tasks.includes(task);
  }

  modelFor(task: TaskType): string {
    return (
      this.row?.models?.[task] ??
      this.definition.defaultModels[task] ??
      this.row?.models?.["general"] ??
      this.definition.defaultModels.general
    );
  }

  languageModel(task: TaskType) {
    if (!this.configured) {
      throw new Error(
        `Provider "${this.id}" is not configured. Set ${this.definition.envKey} on the server.`,
      );
    }
    const provider = createOpenAICompatible({
      name: `priyanshu-${this.id}`,
      baseURL: this.url!,
      headers: this.definition.authHeader
        ? { ...this.definition.authHeader(this.key!), ...(this.definition.headers?.(this.key!) ?? {}) }
        : {
            Authorization: `Bearer ${this.key}`,
            ...(this.definition.headers?.(this.key!) ?? {}),
          },
    });
    return provider(this.modelFor(task));
  }

  async healthCheck(): Promise<boolean> {
    if (!this.configured) return false;
    try {
      const response = await fetch(`${this.url}/models`, {
        headers: this.definition.authHeader
          ? this.definition.authHeader(this.key!)
          : { Authorization: `Bearer ${this.key}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/** Builds adapters for every provider that has credentials configured. */
export function buildAdapters(rows: ProviderConfigRow[] = []): ProviderAdapter[] {
  const byId = new Map(rows.map((row) => [row.provider, row]));
  return PROVIDER_DEFINITIONS.map(
    (definition) => new OpenAICompatibleAdapter(definition, byId.get(definition.id)),
  );
}

/** Names of providers with a key present — used by the admin view. */
export function configuredProviderIds(): string[] {
  return buildAdapters()
    .filter((adapter) => adapter.configured)
    .map((adapter) => adapter.id);
}
