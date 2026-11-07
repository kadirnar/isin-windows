// Snippets and Quicklinks: search, create, edit, delete; placeholders expand when pasting / opening.
import { useCallback } from "react";
import { argumentNames, expandPlaceholders } from "../../core/placeholders";
import { newId, quicklinkStore, snippetStore, useStoreValue, type Quicklink, type Snippet } from "../stores";
import { native } from "../../native";
import type { Nav, Section } from "../types";
import { FormScreen, ListScreen, Metadata, useNav } from "../ui";

export async function pasteSnippet(snippet: Snippet, nav: Nav, args?: Record<string, string>) {
  const needed = argumentNames(snippet.text);
  if (needed.length && !args) {
    nav.push({
      key: "args-" + snippet.id,
      title: snippet.name,
      render: () => (
        <FormScreen
          title={snippet.name}
          icon="✂️"
          submitTitle="Paste Snippet"
          fields={needed.map((n) => ({ id: n.name, label: n.name, placeholder: n.default }))}
          initial={Object.fromEntries(needed.map((n) => [n.name, n.default ?? ""]))}
          onSubmit={(values) => pasteSnippet(snippet, nav, values)}
        />
      ),
    });
    return;
  }
  const clipboard = (await native.readClipboard()) ?? "";
  const { text, cursorBack } = expandPlaceholders(snippet.text, { clipboard, arguments: args });
  await native.paste(text, cursorBack);
  nav.popToRoot();
}

export function SnippetForm({ snippet }: { snippet?: Snippet }) {
  const nav = useNav();
  return (
    <FormScreen
      title={snippet ? "Edit Snippet" : "Create Snippet"}
      icon="✂️"
      submitTitle="Save Snippet"
      initial={snippet ? { name: snippet.name, text: snippet.text, keyword: snippet.keyword } : {}}
      fields={[
        { id: "name", label: "Name", placeholder: "Email signature", required: true },
        {
          id: "text", label: "Snippet", kind: "textarea", required: true,
          placeholder: "Hi {argument name=\"name\"},\n\n…\n\nToday is {date format=\"d MMMM yyyy\"}",
          info: "Placeholders: {clipboard} {date} {time} {datetime} {day} {uuid} {cursor} {argument name=\"x\"}, modifiers like {clipboard | uppercase}",
        },
        { id: "keyword", label: "Keyword", placeholder: ";sig", info: "Typing the keyword in the launcher finds the snippet." },
      ]}
      onSubmit={(values) => {
        const entry: Snippet = {
          id: snippet?.id ?? newId(),
          name: values.name.trim(),
          text: values.text,
          keyword: (values.keyword ?? "").trim(),
          created: snippet?.created ?? Date.now(),
        };
        snippetStore.set((list) => (snippet ? list.map((s) => (s.id === snippet.id ? entry : s)) : [entry, ...list]));
        nav.toast({ style: "success", title: snippet ? "Snippet saved" : "Snippet created" }, 2000);
        nav.pop();
      }}
    />
  );
}

export function SnippetsScreen() {
  const nav = useNav();
  const snippets = useStoreValue(snippetStore);
  const sections = useCallback(
    (): Section[] => [
      {
        items: snippets.map((snippet) => ({
          id: snippet.id,
          title: snippet.name,
          icon: "✂️",
          keywords: [snippet.keyword, snippet.text.slice(0, 500)],
          accessories: snippet.keyword ? [snippet.keyword] : undefined,
          detail: (
            <div className="detail">
              <pre className="detail-text">{snippet.text}</pre>
              <Metadata rows={[["Name", snippet.name], ["Keyword", snippet.keyword || "—"], ["Created", new Date(snippet.created).toLocaleString()]]} />
            </div>
          ),
          actions: [
            { id: "paste", title: "Paste Snippet", icon: "📋", shortcut: "Enter", run: () => pasteSnippet(snippet, nav) },
            {
              id: "copy", title: "Copy to Clipboard", icon: "📄", shortcut: "Ctrl+Enter",
              run: async () => {
                const clipboard = (await native.readClipboard()) ?? "";
                await native.copy(expandPlaceholders(snippet.text, { clipboard }).text);
                await nav.closeMainWindow();
              },
            },
            { id: "edit", title: "Edit Snippet", icon: "✏️", shortcut: "Ctrl+E",
              run: () => nav.push({ key: "edit-snippet", title: "Edit Snippet", render: () => <SnippetForm snippet={snippet} /> }) },
            { id: "new", title: "Create Snippet", icon: "➕", shortcut: "Ctrl+N",
              run: () => nav.push({ key: "new-snippet", title: "Create Snippet", render: () => <SnippetForm /> }) },
            {
              id: "delete", title: "Delete Snippet", icon: "🗑️", shortcut: "Ctrl+Backspace", destructive: true,
              confirm: { title: `Delete “${snippet.name}”?`, button: "Delete" },
              run: () => snippetStore.set((list) => list.filter((s) => s.id !== snippet.id)),
            },
          ],
        })),
      },
    ],
    [snippets, nav],
  );
  return (
    <ListScreen
      title="Search Snippets"
      icon="✂️"
      placeholder="Search snippets…"
      sections={sections}
      filter
      detail
      emptyActions={[{ id: "new", title: "Create Snippet", icon: "➕", run: () => nav.push({ key: "new-snippet", title: "Create Snippet", render: () => <SnippetForm /> }) }]}
      empty={<div className="empty">No snippets yet. Press Enter to create one.</div>}
    />
  );
}

// MARK: Quicklinks

export function quicklinkNeedsQuery(link: Quicklink): boolean {
  return /\{(query|argument)/.test(link.link);
}

export async function openQuicklink(link: Quicklink, nav: Nav, query?: string) {
  if (quicklinkNeedsQuery(link) && query === undefined) {
    nav.push({
      key: "ql-arg-" + link.id,
      title: link.name,
      render: () => (
        <FormScreen
          title={link.name}
          icon={link.icon ?? "🔗"}
          submitTitle="Open"
          fields={[{ id: "query", label: "Query", placeholder: "Search for…", required: true }]}
          onSubmit={(values) => openQuicklink(link, nav, values.query)}
        />
      ),
    });
    return;
  }
  const clipboard = (await native.readClipboard()) ?? "";
  const target = expandPlaceholders(link.link, { query, clipboard, encodeArguments: /^[a-z]+:\/\//i.test(link.link) }).text;
  await native.open(target);
  await nav.closeMainWindow();
}

export function QuicklinkForm({ link }: { link?: Quicklink }) {
  const nav = useNav();
  return (
    <FormScreen
      title={link ? "Edit Quicklink" : "Create Quicklink"}
      icon="🔗"
      submitTitle="Save Quicklink"
      initial={link ? { name: link.name, link: link.link, alias: link.alias, icon: link.icon ?? "" } : {}}
      fields={[
        { id: "name", label: "Name", placeholder: "Search npm", required: true },
        { id: "link", label: "Link", placeholder: "https://www.npmjs.com/search?q={query}", required: true,
          info: "A URL, file, folder or app path. {query} asks for text when opened; {clipboard} and {date} work too." },
        { id: "alias", label: "Alias", placeholder: "npm", info: "Type the alias and a query in the launcher: “npm react”." },
        { id: "icon", label: "Icon", placeholder: "📦 (an emoji)" },
      ]}
      onSubmit={(values) => {
        const entry: Quicklink = {
          id: link?.id ?? newId(),
          name: values.name.trim(),
          link: values.link.trim(),
          alias: (values.alias ?? "").trim(),
          icon: values.icon?.trim() || undefined,
        };
        quicklinkStore.set((list) => (link ? list.map((l) => (l.id === link.id ? entry : l)) : [...list, entry]));
        nav.toast({ style: "success", title: link ? "Quicklink saved" : "Quicklink created" }, 2000);
        nav.pop();
      }}
    />
  );
}

export function QuicklinksScreen() {
  const nav = useNav();
  const links = useStoreValue(quicklinkStore);
  const sections = useCallback(
    (): Section[] => [
      {
        items: links.map((link) => ({
          id: link.id,
          title: link.name,
          subtitle: link.link,
          icon: link.icon ?? "🔗",
          keywords: [link.alias],
          accessories: link.alias ? [link.alias] : undefined,
          actions: [
            { id: "open", title: "Open Quicklink", icon: "↗️", shortcut: "Enter", run: () => openQuicklink(link, nav) },
            { id: "edit", title: "Edit Quicklink", icon: "✏️", shortcut: "Ctrl+E",
              run: () => nav.push({ key: "edit-ql", title: "Edit Quicklink", render: () => <QuicklinkForm link={link} /> }) },
            { id: "new", title: "Create Quicklink", icon: "➕", shortcut: "Ctrl+N",
              run: () => nav.push({ key: "new-ql", title: "Create Quicklink", render: () => <QuicklinkForm /> }) },
            {
              id: "delete", title: "Delete Quicklink", icon: "🗑️", shortcut: "Ctrl+Backspace", destructive: true,
              confirm: { title: `Delete “${link.name}”?`, button: "Delete" },
              run: () => quicklinkStore.set((list) => list.filter((l) => l.id !== link.id)),
            },
          ],
        })),
      },
    ],
    [links, nav],
  );
  return <ListScreen title="Search Quicklinks" icon="🔗" placeholder="Search quicklinks…" sections={sections} filter />;
}
