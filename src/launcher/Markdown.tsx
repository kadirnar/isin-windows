import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";
import { native } from "../native";

marked.setOptions({ gfm: true, breaks: true });

/** Renders model output as sanitized Markdown; links open in the default browser. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false }) as string), [text]);
  return (
    <div
      className={`markdown ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const link = (e.target as HTMLElement).closest("a");
        if (link?.href) {
          e.preventDefault();
          void native.open(link.href);
        }
      }}
    />
  );
}
