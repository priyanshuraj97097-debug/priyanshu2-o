export type Attachment = {
  path: string;
  name: string;
  mime: string;
  size?: number;
  url?: string;
};

export type ToolEvent =
  | { kind: "image"; url: string; prompt: string }
  | { kind: "sources"; sources: { title: string; url: string }[] };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  events: ToolEvent[];
  createdAt: string;
  error?: string | null;
  streaming?: boolean;
};

export type ConversationState = {
  messages: ChatMessage[];
  loaded: boolean;
  status: "idle" | "loading" | "streaming";
  activeTool: string | null;
  error: string | null;
};

export const EMPTY_STATE: ConversationState = {
  messages: [],
  loaded: false,
  status: "idle",
  activeTool: null,
  error: null,
};