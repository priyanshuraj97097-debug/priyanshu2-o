import type { TaskType } from "./providers/types";

export type Language = "en" | "hi" | "hinglish" | "other";

const DEVANAGARI = /[\u0900-\u097F]/;
const HINGLISH_WORDS =
  /\b(kya|hai|hain|nahi|nahin|kaise|kyun|kyu|mujhe|mera|meri|tum|aap|karo|kar|bata|batao|chahiye|matlab|acha|accha|theek|thik|haan|bhai|yaar|samjha|samjhao|likho|banao)\b/i;

/** Lightweight script/keyword detection — no model call, so it costs nothing. */
export function detectLanguage(text: string): Language {
  if (!text.trim()) return "other";
  if (DEVANAGARI.test(text)) return "hi";
  const words = text.toLowerCase().split(/\s+/);
  const hinglishHits = words.filter((w) => HINGLISH_WORDS.test(w)).length;
  if (hinglishHits >= 2 || (words.length <= 6 && hinglishHits >= 1)) return "hinglish";
  if (/^[\x00-\x7F\s]*$/.test(text)) return "en";
  return "other";
}

const CODE_RE =
  /```|\b(function|const|let|var|class|import|export|def |return|console\.log|npm|bun|pip|python|javascript|typescript|react|node|sql|regex|api|bug|debug|refactor|compile|error:|stack trace|html|css|json)\b/i;
const MATH_RE =
  /\b(solve|integral|integrate|derivative|differentiate|equation|matrix|probability|statistics|mean|median|variance|standard deviation|theorem|prove|calculate|compute|percentage|algebra|calculus|geometry|trigonometry)\b|[=^√∫∑]|\d+\s*[x×*/+\-]\s*\d+|\bx\^?2\b/i;
const REASONING_RE =
  /\b(analy[sz]e|compare|evaluate|strategy|plan|architecture|trade-?offs?|pros and cons|explain in depth|deep dive|research|step by step reasoning|why does|design a)\b/i;
const TRANSLATE_RE = /\b(translate|translation|in hindi|in english|hindi mein|english mein|anuvad)\b/i;

export type ClassifyInput = {
  text: string;
  attachmentMimes: string[];
  wantsReasoning?: boolean;
};

/** Determines the task class the router should optimise for. */
export function classifyTask(input: ClassifyInput): TaskType {
  const mimes = input.attachmentMimes;
  if (mimes.some((m) => m.startsWith("video/"))) return "video";
  if (mimes.some((m) => m.startsWith("image/"))) return "vision";
  if (mimes.length) return "document";
  if (input.wantsReasoning) return "reasoning";

  const text = input.text;
  if (TRANSLATE_RE.test(text)) return "translation";
  if (CODE_RE.test(text)) return "coding";
  if (MATH_RE.test(text)) return "math";
  if (REASONING_RE.test(text) || text.length > 1500) return "reasoning";
  return "general";
}
