// Quick AI, AI commands and AI Chat, all streaming from OpenRouter.
import { useCallback, useEffect, useRef, useState } from "react";
import { QUICK_AI_SYSTEM, resolveKey, streamChat } from "../../core/openrouter";
import { chatStore, newId, settingsStore, useStoreValue, type Chat, type ChatMessage } from "../stores";
import { native } from "../../native";
import { Markdown } from "../Markdown";
import type { Action, Section } from "../types";
import { ActionPanel, Footer, ListScreen, matches, SearchBar, useNav } from "../ui";

function useStream() {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const start = useCallback(async (model: string, messages: ChatMessage[]) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setText("");
    setError(null);
    setRunning(true);
    const settings = settingsStore.get();
    try {
      return await streamChat({
        apiKey: resolveKey(settings.openRouterKey),
        model,
        messages,
        temperature: settings.aiTemperature,
        signal: controller.signal,
        onText: (_, full) => setText(full),
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
      return null;
    } finally {
      if (abort.current === controller) setRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    abort.current?.abort();
    setRunning(false);
  }, []);
  useEffect(() => () => abort.current?.abort(), []);
  return { text, running, error, start, stop };
}

function NoKey() {
  return (
    <div className="ai-error">
      <p>Işın's AI features use your own <b>OpenRouter</b> API key.</p>
      <p>
        <button className="button primary" onClick={() => void native.openSettings("ai")}>Open Settings → AI</button>{" "}
        <button className="button" onClick={() => void native.open("https://openrouter.ai/settings/keys")}>Get a key</button>
      </p>
    </div>
  );
}

/** One question → one streamed answer. Used by Quick AI (Tab in root search) and the AI commands. */
export function AnswerScreen({ title, icon, prompt, display, model, system, editable = true }: {
  title: string; icon: string; prompt: string; display?: string; model?: string; system?: string; editable?: boolean;
}) {
  const nav = useNav();
  const settings = useStoreValue(settingsStore);
  const [question, setQuestion] = useState(display ?? prompt);
  const [asked, setAsked] = useState(prompt);
  const [panel, setPanel] = useState(false);
  const stream = useStream();
  const usedModel = model ?? settings.quickAIModel;
  const input = useRef<HTMLInputElement>(null);
  const hasKey = !!resolveKey(settings.openRouterKey);

  const messages = (q: string): ChatMessage[] => [{ role: "system", content: system ?? QUICK_AI_SYSTEM }, { role: "user", content: q }];

  useEffect(() => {
    if (hasKey && prompt.trim()) void stream.start(usedModel, messages(prompt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey]);

  const continueInChat = () => {
    const chat: Chat = {
      id: newId(),
      title: (display ?? asked).slice(0, 60),
      model: settings.chatModel,
      messages: [{ role: "user", content: asked }, { role: "assistant", content: stream.text }],
      updated: Date.now(),
    };
    chatStore.set((list) => [chat, ...list]);
    nav.push({ key: "chat-" + chat.id, title: "AI Chat", icon: "💬", render: () => <ChatScreen chatId={chat.id} /> });
  };

  const changed = editable && question.trim() !== (display ?? asked).trim() && question.trim() !== "";
  const actions: Action[] = [
    ...(changed ? [{ id: "ask", title: "Ask", icon: "✨", shortcut: "Enter", run: () => {
      setAsked(question);
      void stream.start(usedModel, messages(question));
    } }] : []),
    { id: "paste", title: "Paste Response", icon: "📋", shortcut: changed ? "Ctrl+Shift+Enter" : "Enter", run: () => native.paste(stream.text) },
    { id: "copy", title: "Copy Response", icon: "📄", shortcut: "Ctrl+Shift+C", run: async () => {
      await native.copy(stream.text);
      nav.toast({ style: "success", title: "Copied to clipboard" }, 1500);
    } },
    { id: "chat", title: "Continue in Chat", icon: "💬", shortcut: "Ctrl+J", run: continueInChat },
    { id: "retry", title: "Regenerate", icon: "🔁", shortcut: "Ctrl+R", run: () => void stream.start(usedModel, messages(asked)) },
    ...(stream.running ? [{ id: "stop", title: "Stop Generating", icon: "⏹️", shortcut: "Ctrl+.", run: stream.stop }] : []),
  ];

  const run = async (action: Action) => {
    setPanel(false);
    try {
      await action.run();
    } catch (e) {
      nav.toast({ style: "failure", title: (e as Error).message }, 4000);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setPanel(true);
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      if (stream.text || changed) void run(actions[0]);
      return;
    }
    const hit = actions.find((a) => a.shortcut && a.shortcut !== "Enter" && matches(e, a.shortcut));
    if (hit) {
      e.preventDefault();
      void run(hit);
    }
  };

  return (
    <div className="screen">
      <SearchBar
        value={question}
        onChange={editable ? setQuestion : () => {}}
        placeholder="Ask AI anything…"
        onKeyDown={onKeyDown}
        inputRef={input}
        canGoBack
        onBack={nav.pop}
        accessory={<span className="model-tag">{usedModel.split("/")[1]}</span>}
      />
      <div className="content answer">
        {!hasKey ? (
          <NoKey />
        ) : stream.error ? (
          <div className="ai-error">{stream.error}</div>
        ) : stream.text ? (
          <Markdown text={stream.text} />
        ) : stream.running ? (
          <div className="thinking">Thinking…</div>
        ) : (
          <div className="empty">Type a question and press Enter.</div>
        )}
        {stream.running && stream.text && <span className="caret" />}
      </div>
      <Footer title={title} icon={icon} primary={stream.text || changed ? actions[0].title : undefined} hasActions onActions={() => setPanel(true)} />
      {panel && <ActionPanel actions={actions} onRun={(a) => void run(a)} onClose={() => { setPanel(false); input.current?.focus(); }} />}
    </div>
  );
}

/** Runs an AI command on the selected text (falls back to the clipboard). */
export async function runAICommand(command: { id: string; title: string; icon: string; prompt: string }, nav: ReturnType<typeof useNav>) {
  nav.toast({ style: "loading", title: "Reading selected text…" });
  let input = await native.selectedText().catch(() => null);
  let source = "selection";
  if (!input) {
    input = await native.readClipboard();
    source = "clipboard";
  }
  nav.toast(null);
  if (!input?.trim()) {
    nav.toast({ style: "failure", title: "Select some text first", message: "or copy it to the clipboard" }, 3500);
    return;
  }
  const prompt = command.prompt.replace("{selection}", input);
  const settings = settingsStore.get();
  nav.push({
    key: "ai-" + command.id + Date.now(),
    title: command.title,
    icon: command.icon,
    render: () => (
      <AnswerScreen
        title={`${command.title} · ${source}`}
        icon={command.icon}
        prompt={prompt}
        display={`${command.title}: ${input!.replace(/\s+/g, " ").slice(0, 80)}`}
        model={settings.commandModel}
        system="You are a writing and coding assistant inside a Windows launcher. Follow the instruction exactly."
        editable={false}
      />
    ),
  });
}

// MARK: Chat

export function ChatScreen({ chatId }: { chatId?: string }) {
  const nav = useNav();
  const chats = useStoreValue(chatStore);
  const settings = useStoreValue(settingsStore);
  const [currentId, setCurrentId] = useState<string | undefined>(chatId ?? chats[0]?.id);
  const chat = chats.find((c) => c.id === currentId);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState(false);
  const stream = useStream();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const hasKey = !!resolveKey(settings.openRouterKey);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [chat?.messages.length, stream.text]);

  const send = async () => {
    const text = draft.trim();
    if (!text || stream.running) return;
    setDraft("");
    let id = currentId;
    let history: ChatMessage[] = chat?.messages ?? [];
    const model = chat?.model ?? settings.chatModel;
    if (!chat) {
      id = newId();
      chatStore.set((list) => [{ id: id!, title: text.slice(0, 60), model, messages: [], updated: Date.now() }, ...list]);
      setCurrentId(id);
    }
    history = [...history, { role: "user", content: text }];
    chatStore.set((list) => list.map((c) => (c.id === id ? { ...c, messages: history, updated: Date.now() } : c)));
    const reply = await stream.start(model, [
      { role: "system", content: "You are Işın's AI Chat on Windows. Be helpful and concise; use Markdown." },
      ...history,
    ]);
    if (reply) {
      chatStore.set((list) =>
        list.map((c) => (c.id === id ? { ...c, messages: [...history, { role: "assistant", content: reply }], updated: Date.now() } : c)),
      );
    }
  };

  const lastAnswer = [...(chat?.messages ?? [])].reverse().find((m) => m.role === "assistant")?.content;
  const actions: Action[] = [
    { id: "send", title: "Send Message", icon: "✨", shortcut: "Enter", run: send },
    { id: "new", title: "New Chat", icon: "➕", shortcut: "Ctrl+N", run: () => { stream.stop(); setCurrentId(undefined); } },
    { id: "history", title: "Chat History", icon: "🗂️", shortcut: "Ctrl+H", run: () => nav.push({
      key: "chat-history", title: "Chat History", icon: "🗂️", render: () => <ChatHistory onPick={(id) => { setCurrentId(id); nav.pop(); }} />,
    }) },
    ...(lastAnswer ? [
      { id: "copy", title: "Copy Last Answer", icon: "📄", shortcut: "Ctrl+Shift+C", run: async () => {
        await native.copy(lastAnswer);
        nav.toast({ style: "success", title: "Copied to clipboard" }, 1500);
      } },
      { id: "paste", title: "Paste Last Answer", icon: "📋", shortcut: "Ctrl+Shift+V", run: () => native.paste(lastAnswer) },
    ] : []),
    ...(stream.running ? [{ id: "stop", title: "Stop Generating", icon: "⏹️", shortcut: "Ctrl+.", run: stream.stop }] : []),
    ...(chat ? [{ id: "delete", title: "Delete Chat", icon: "🗑️", shortcut: "Ctrl+Backspace", destructive: true,
      confirm: { title: "Delete this chat?", button: "Delete" },
      run: () => { chatStore.set((list) => list.filter((c) => c.id !== chat.id)); setCurrentId(undefined); } }] : []),
  ];

  const run = async (action: Action) => {
    setPanel(false);
    if (action.confirm && !(await nav.confirm({ ...action.confirm, destructive: action.destructive }))) return;
    await action.run();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setPanel(true);
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      void send();
      return;
    }
    const hit = actions.find((a) => a.shortcut && a.shortcut !== "Enter" && matches(e, a.shortcut));
    if (hit) {
      e.preventDefault();
      void run(hit);
    }
  };

  const messages = chat?.messages ?? [];
  const pendingUser = stream.running && messages[messages.length - 1]?.role === "user";

  return (
    <div className="screen">
      <SearchBar value={draft} onChange={setDraft} placeholder={chat ? "Ask a follow-up…" : "Start a new chat…"}
        onKeyDown={onKeyDown} inputRef={input} canGoBack={nav.depth > 1} onBack={nav.pop}
        accessory={<span className="model-tag">{(chat?.model ?? settings.chatModel).split("/")[1]}</span>} />
      <div className="content chat" ref={scroller}>
        {!hasKey && <NoKey />}
        {hasKey && messages.length === 0 && !stream.running && <div className="empty">Ask anything. Enter sends, Ctrl+N starts over.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === "assistant" ? <Markdown text={m.content} /> : <div className="user-text">{m.content}</div>}
          </div>
        ))}
        {pendingUser && (
          <div className="bubble assistant">{stream.text ? <Markdown text={stream.text} /> : <div className="thinking">Thinking…</div>}</div>
        )}
        {stream.error && <div className="ai-error">{stream.error}</div>}
      </div>
      <Footer title={chat?.title ?? "AI Chat"} icon="💬" primary={draft.trim() ? "Send Message" : undefined} hasActions onActions={() => setPanel(true)} />
      {panel && <ActionPanel actions={actions} onRun={(a) => void run(a)} onClose={() => { setPanel(false); input.current?.focus(); }} />}
    </div>
  );
}

function ChatHistory({ onPick }: { onPick: (id: string) => void }) {
  const chats = useStoreValue(chatStore);
  const sections = useCallback((): Section[] => [{
    items: [...chats].sort((a, b) => b.updated - a.updated).map((chat) => ({
      id: chat.id,
      title: chat.title || "Untitled chat",
      subtitle: `${chat.messages.length} messages`,
      icon: "💬",
      accessories: [new Date(chat.updated).toLocaleDateString()],
      actions: [
        { id: "open", title: "Open Chat", icon: "💬", shortcut: "Enter", run: () => onPick(chat.id) },
        { id: "delete", title: "Delete Chat", icon: "🗑️", shortcut: "Ctrl+Backspace", destructive: true,
          confirm: { title: "Delete this chat?", button: "Delete" },
          run: () => chatStore.set((list) => list.filter((c) => c.id !== chat.id)) },
      ],
    })),
  }], [chats, onPick]);
  return <ListScreen title="Chat History" icon="🗂️" placeholder="Search chats…" sections={sections} filter />;
}
