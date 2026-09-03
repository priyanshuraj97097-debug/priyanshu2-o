import { GATEWAY_BASE_URL, TITLE_MODEL, gatewayHeaders } from "./config.server";

const STOPWORDS = new Set([
  "a", "an", "the", "please", "can", "you", "could", "would", "me", "i", "to", "of", "for", "and", "is", "in", "on", "my", "hi", "hello", "hey",
]);

/** Deterministic title derived from the message itself — used when the model output is unusable. */
export function fallbackTitle(message: string): string {
  const cleaned = message.replace(/[`*_#>\[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned
    .split(" ")
    .filter((word) => word && !STOPWORDS.has(word.toLowerCase()))
    .slice(0, 6);
  const title = words.join(" ");
  if (title.length >= 4) return title.length > 60 ? `${title.slice(0, 57)}…` : title;
  return cleaned.length >= 4 ? cleaned.slice(0, 40) : "New conversation";
}

function isMeaningful(title: string): boolean {
  const letters = title.replace(/[^\p{L}\p{N}]/gu, "");
  if (letters.length < 4) return false;
  if (/^(untitled|new chat|conversation|title)$/i.test(title.trim())) return false;
  return true;
}

export async function generateTitle(firstMessage: string): Promise<string> {
  const fallback = fallbackTitle(firstMessage);
  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: gatewayHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: TITLE_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Write a short, professional 3-6 word title summarising this conversation request. Use the same language as the request. Plain text only — no quotes, no emoji, no trailing punctuation. Never answer the request; only title it.",
          },
          { role: "user", content: firstMessage.slice(0, 600) },
        ],
        max_tokens: 24,
      }),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const title = data.choices?.[0]?.message?.content
      ?.trim()
      .split("\n")[0]
      ?.replace(/^["'“”]+|["'“”.]+$/g, "")
      .trim();
    if (!title || !isMeaningful(title)) return fallback;
    return title.length > 70 ? `${title.slice(0, 67)}…` : title;
  } catch {
    return fallback;
  }
}
