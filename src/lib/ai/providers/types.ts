import type { LanguageModel } from "ai";

/** Coarse task classes the router understands. */
export type TaskType =
  | "general"
  | "coding"
  | "math"
  | "reasoning"
  | "multimodal"
  | "vision"
  | "document"
  | "video"
  | "translation";

export const TASK_TYPES: TaskType[] = [
  "general",
  "coding",
  "math",
  "reasoning",
  "multimodal",
  "vision",
  "document",
  "video",
  "translation",
];

export type ProviderPricing = {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
};

/**
 * Common interface every provider adapter implements. The chat layer never
 * talks to a vendor SDK directly — it only ever sees this shape.
 */
export interface ProviderAdapter {
  readonly id: string;
  readonly label: string;
  /** True when the required server-side credentials are present. */
  readonly configured: boolean;
  readonly supportsTools: boolean;
  readonly supportsAttachments: boolean;
  readonly pricing: ProviderPricing;
  /** Router priority — lower runs first. */
  readonly priority: number;
  readonly enabled: boolean;
  readonly paid: boolean;
  readonly dailyRequestCap: number | null;
  readonly monthlyRequestCap: number | null;
  supportsTask(task: TaskType): boolean;
  modelFor(task: TaskType): string;
  /** AI SDK language model used for both generate() and stream(). */
  languageModel(task: TaskType): LanguageModel;
  healthCheck(): Promise<boolean>;
}

export type ProviderConfigRow = {
  provider: string;
  label: string;
  enabled: boolean;
  priority: number;
  tasks: string[] | null;
  models: Record<string, string> | null;
  daily_request_cap: number | null;
  monthly_request_cap: number | null;
  paid: boolean;
};
