import { useSyncExternalStore } from "react";

import { chatStore } from "./store";
import { EMPTY_STATE, type ConversationState } from "./types";

export function useConversation(conversationId: string | null): ConversationState {
  return useSyncExternalStore(
    (listener) => (conversationId ? chatStore.subscribe(conversationId, listener) : () => {}),
    () => (conversationId ? chatStore.getState(conversationId) : EMPTY_STATE),
    () => EMPTY_STATE,
  );
}

export function useBusyConversations(): string[] {
  return useSyncExternalStore(
    (listener) => chatStore.subscribeGlobal(listener),
    () => chatStore.activeConversationIds().join(",") as unknown as string[],
    () => [] as string[],
  ) as unknown as string[];
}