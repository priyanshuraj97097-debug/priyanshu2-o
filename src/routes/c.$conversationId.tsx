import { createFileRoute } from "@tanstack/react-router";

import { AuthGate } from "@/components/chat/AuthGate";
import { ChatScreen } from "@/components/chat/ChatScreen";

export const Route = createFileRoute("/c/$conversationId")({
  head: () => ({
    meta: [
      { title: "Conversation — Priyanshu 2.o" },
      {
        name: "description",
        content:
          "Continue your private Priyanshu 2.o conversation with text, images, documents, and voice.",
      },
      { property: "og:title", content: "Conversation — Priyanshu 2.o" },
      {
        property: "og:description",
        content: "Continue your private Priyanshu 2.o conversation across text, files, and voice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  return (
    <AuthGate>
      <ChatScreen key={conversationId} conversationId={conversationId} />
    </AuthGate>
  );
}
