import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, MoreHorizontal, Pencil, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BrandMark, BrandWordmark } from "@/components/Brand";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { chatStore } from "@/lib/chat/store";
import { useBusyConversationKey } from "@/lib/chat/useConversation";
import { cn } from "@/lib/utils";

export type Conversation = {
  id: string;
  title: string;
  last_message_at: string;
};

export function useConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversations", user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, title, last_message_at")
        .eq("archived", false)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateConversation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: user!.id, title: "New chat" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });
}

export function ConversationSidebar({
  activeId,
  onOpenSettings,
  onNavigate,
}: {
  activeId: string | null;
  onOpenSettings: () => void;
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: conversations, isLoading } = useConversations();
  const createConversation = useCreateConversation();
  const busyKey = useBusyConversationKey();
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const startLongPress = (conversation: Conversation) => {
    cancelLongPress();
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setPendingDelete(conversation);
    }, 550);
  };

  const busyIds = useMemo(() => new Set(busyKey.split(",").filter(Boolean)), [busyKey]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations ?? [];
    return (conversations ?? []).filter((conversation) =>
      conversation.title.toLowerCase().includes(term),
    );
  }, [conversations, query]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });

  const rename = async (id: string) => {
    const title = renameValue.trim().slice(0, 80);
    setRenamingId(null);
    if (!title) return;
    const { error } = await supabase.from("conversations").update({ title }).eq("id", id);
    if (error) toast.error("Could not rename that conversation.");
    void invalidate();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete that conversation.");
      return;
    }
    chatStore.forget(id);
    void invalidate();
    if (activeId === id) void navigate({ to: "/" });
  };

  return (
    <div className="flex h-full flex-col gap-3 bg-sidebar p-3">
      <div className="flex items-center gap-2 px-1 pt-1">
        <BrandMark className="size-7" />
        <BrandWordmark />
      </div>

      <Button
        className="justify-start gap-2"
        disabled={createConversation.isPending}
        onClick={async () => {
          try {
            const id = await createConversation.mutateAsync();
            onNavigate?.();
            void navigate({ to: "/c/$conversationId", params: { conversationId: id } });
          } catch {
            toast.error("Could not start a new chat.");
          }
        }}
      >
        <Plus className="size-4" /> New chat
      </Button>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search chats"
          aria-label="Search conversations"
          className="pl-9"
        />
      </div>

      <nav className="-mr-1 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Loading chats…</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {query ? "No chats match that search." : "No conversations yet."}
          </p>
        ) : (
          filtered.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
                activeId === conversation.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
              )}
            >
              {renamingId === conversation.id ? (
                <div className="flex w-full items-center gap-1 p-1">
                  <Input
                    value={renameValue}
                    autoFocus
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void rename(conversation.id);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    className="h-8"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Save chat name"
                    onClick={() => void rename(conversation.id)}
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel renaming chat"
                    onClick={() => setRenamingId(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Link
                    to="/c/$conversationId"
                    params={{ conversationId: conversation.id }}
                    onPointerDown={() => startLongPress(conversation)}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setPendingDelete(conversation);
                    }}
                    onClick={(event) => {
                      cancelLongPress();
                      if (longPressFired.current) {
                        event.preventDefault();
                        longPressFired.current = false;
                        return;
                      }
                      onNavigate?.();
                    }}
                    className="min-w-0 flex-1 truncate px-3 py-2 text-sm"
                  >
                    {conversation.title}
                  </Link>
                  {busyIds.has(conversation.id) ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Options for ${conversation.title}`}
                        className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenameValue(conversation.title);
                          setRenamingId(conversation.id);
                        }}
                      >
                        <Pencil className="size-4" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setPendingDelete(conversation)}
                      >
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          ))
        )}
      </nav>

      <Button variant="ghost" className="justify-start gap-2" onClick={onOpenSettings}>
        <Settings className="size-4" /> Settings
      </Button>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; and all of its messages will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = pendingDelete;
                setPendingDelete(null);
                if (target) void remove(target.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
