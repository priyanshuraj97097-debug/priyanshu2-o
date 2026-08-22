/** Two supported assistant languages and their matching voice models. */
export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी / Hindi" },
];

export const VOICES = [
  { id: "alloy", label: "Aria — English voice", language: "en" },
  { id: "coral", label: "Ira — Hindi voice", language: "hi" },
];

export function normalizeLanguage(value: string | null | undefined): string {
  return value === "hi" ? "hi" : "en";
}

export function normalizeVoice(value: string | null | undefined, language?: string | null): string {
  if (VOICES.some((voice) => voice.id === value)) return value as string;
  return normalizeLanguage(language) === "hi" ? "coral" : "alloy";
}

export const MODEL_PREFERENCES = [
  { id: "balanced", label: "Balanced", hint: "Best mix of speed and depth for everyday work" },
  { id: "fast", label: "Fast", hint: "Quickest replies for short questions" },
  { id: "deep", label: "Deep reasoning", hint: "Slower, stronger reasoning for hard problems" },
];
