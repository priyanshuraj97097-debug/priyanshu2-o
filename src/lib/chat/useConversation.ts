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

/** Comma-joined ids of conversations currently generating (stable snapshot). */
export function useBusyConversationKey(): string {
  return useSyncExternalStore(
    (listener) => chatStore.subscribeGlobal(listener),
    () => chatStore.activeConversationIds().join(","),
    () => "",
  );
}