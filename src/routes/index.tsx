import { createFileRoute } from "@tanstack/react-router";

import { AuthGate } from "@/components/chat/AuthGate";
import { ChatScreen } from "@/components/chat/ChatScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Priyanshu 2.o — Multimodal AI Assistant" },
      {
        name: "description",
        content:
          "Priyanshu 2.o is a multimodal AI assistant for conversation, coding, mathematics, research, image generation, file analysis, and live voice.",
      },
      { property: "og:title", content: "Priyanshu 2.o — Multimodal AI Assistant" },
      {
        property: "og:description",
        content:
          "Chat, code, solve maths, analyse files, generate images, and talk live with one adaptive AI assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AuthGate>
      <ChatScreen conversationId={null} />
    </AuthGate>
  );
}
