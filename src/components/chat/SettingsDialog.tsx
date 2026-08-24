import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES, MODEL_PREFERENCES, VOICES, normalizeLanguage, normalizeVoice } from "@/lib/voice-options";
import { speechText, synthesize } from "@/lib/voice";

function MemorySection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: memories } = useQuery({
    queryKey: ["memories", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memories")
        .select("id, content, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("memories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories", user?.id] }),
  });

  const [draft, setDraft] = useState("");
  const add = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase
        .from("memories")
        .insert({ user_id: user!.id, content, source: "manual" });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["memories", user?.id] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add something the assistant should remember"
        />
        <Button disabled={!draft.trim()} onClick={() => add.mutate(draft.trim())}>
          Add
        </Button>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {(memories ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved memories yet.</p>
        ) : (
          (memories ?? []).map((memory) => (
            <div
              key={memory.id}
              className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2.5 text-sm"
            >
              <span className="flex-1">{memory.content}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete memory"
                onClick={() => remove.mutate(memory.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { preferences, update } = usePreferences();
  const [displayName, setDisplayName] = useState("");
  const [instructions, setInstructions] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user) && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
  }, [profile?.display_name]);

  useEffect(() => {
    setInstructions(preferences.custom_instructions ?? "");
  }, [preferences.custom_instructions]);

  const saveProfile = async () => {
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", user!.id);
    if (error) toast.error("Could not save your profile.");
    else {
      toast.success("Profile updated.");
      void queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    }
  };

  const previewVoice = async () => {
    try {
      const blob = await synthesize(
        speechText(
          normalizeLanguage(preferences.language) === "hi"
            ? "नमस्ते, मैं प्रियांशु 2.o हूँ। मैं आपकी किस प्रकार सहायता कर सकता हूँ?"
            : "Hello, this is Priyanshu 2.o. How can I help you today?",
        ),
        normalizeVoice(preferences.voice_name, preferences.language),
        preferences.speech_rate,
      );
      await new Audio(URL.createObjectURL(blob)).play();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voice preview failed.");
    }
  };

  const deleteAllChats = async () => {
    const { error } = await supabase.from("conversations").delete().neq("id", crypto.randomUUID());
    if (error) toast.error("Could not delete your chats.");
    else {
      toast.success("All conversations deleted.");
      void queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Personalise how Priyanshu 2.o works for you.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="account">
          <TabsList className="flex w-full flex-wrap">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="data">Privacy &amp; data</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="display-name">Display name</Label>
              <div className="flex gap-2">
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                />
                <Button onClick={() => void saveProfile()}>Save</Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Notifications</p>
                <p className="text-xs text-muted-foreground">Alert me when a background reply finishes</p>
              </div>
              <Switch
                checked={preferences.notifications}
                onCheckedChange={(checked) => update({ notifications: checked })}
              />
            </div>
            <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </TabsContent>

          <TabsContent value="chat" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Response style</Label>
              <Select
                value={preferences.model_preference}
                onValueChange={(value) => update({ model_preference: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_PREFERENCES.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label} — {option.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Custom instructions</Label>
              <Textarea
                id="instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                onBlur={() => update({ custom_instructions: instructions.trim() || null })}
                placeholder="Tell the assistant how you like answers written"
                className="min-h-24"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Send with Enter</p>
                <p className="text-xs text-muted-foreground">Shift + Enter adds a new line</p>
              </div>
              <Switch
                checked={preferences.send_on_enter}
                onCheckedChange={(checked) => update({ send_on_enter: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Web research</p>
                <p className="text-xs text-muted-foreground">Let the assistant look things up online</p>
              </div>
              <Switch
                checked={preferences.web_search_enabled}
                onCheckedChange={(checked) => update({ web_search_enabled: checked })}
              />
            </div>
          </TabsContent>

          <TabsContent value="voice" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Assistant voice</Label>
              <Select
                value={normalizeVoice(preferences.voice_name, preferences.language)}
                onValueChange={(value) => update({ voice_name: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICES.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" onClick={() => void previewVoice()}>
                Preview voice
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Speaking speed — {preferences.speech_rate.toFixed(2)}x</Label>
              <Slider
                value={[preferences.speech_rate]}
                min={0.5}
                max={1.5}
                step={0.05}
                onValueChange={([value]) => update({ speech_rate: value ?? 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Spoken language</Label>
              <Select
                value={normalizeLanguage(preferences.language)}
                onValueChange={(value) =>
                  update({ language: value, voice_name: value === "hi" ? "coral" : "alloy" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Speak replies automatically</p>
                <p className="text-xs text-muted-foreground">Read every new answer out loud</p>
              </div>
              <Switch
                checked={preferences.auto_speak}
                onCheckedChange={(checked) => update({ auto_speak: checked })}
              />
            </div>
          </TabsContent>

          <TabsContent value="memory" className="space-y-4 pt-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Memory</p>
                <p className="text-xs text-muted-foreground">
                  Remember useful details between conversations
                </p>
              </div>
              <Switch
                checked={preferences.memory_enabled}
                onCheckedChange={(checked) => update({ memory_enabled: checked })}
              />
            </div>
            <MemorySection />
          </TabsContent>

          <TabsContent value="data" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Your conversations, files, and memories are private to your account and are never shared
              with other users. Provider credentials stay on the server and are never sent to your
              browser.
            </p>
            <Button variant="destructive" className="w-full" onClick={() => void deleteAllChats()}>
              <Trash2 className="size-4" /> Delete all conversations
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
