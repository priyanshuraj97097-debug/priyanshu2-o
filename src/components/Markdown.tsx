import "katex/dist/katex.min.css";

import { Check, Copy } from "lucide-react";
import { memo, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { cn } from "@/lib/utils";

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const rendered = await codeToHtml(code, {
          lang: language || "text",
          theme: "vitesse-dark",
        });
        if (!cancelled) setHtml(rendered);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="group/code relative my-4 overflow-hidden rounded-xl border border-border bg-[oklch(0.14_0.02_270)]">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {html ? (
        <div
          className="overflow-x-auto p-3 text-[13px] leading-relaxed [&_pre]:!bg-transparent"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
          <code className="font-mono">{code}</code>
        </pre>
      )}
    </div>
  );
}

function normalizeMath(input: string): string {
  // Convert \( \) and \[ \] delimiters into $ / $$ so remark-math renders them.
  return input
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_m, body: string) => `\n$$${body}$$\n`)
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_m, body: string) => `$${body}$`);
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div
      className={cn(
        "text-[15px] leading-7 text-foreground",
        "[&_p]:my-3 [&_ul]:my-3 [&_ol]:my-3 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-1 [&_ul]:pl-5 [&_ol]:pl-5",
        "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-xl [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-secondary/60 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:p-2",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const value = String(children ?? "").replace(/\n$/, "");
            const match = /language-(\w+)/.exec(className ?? "");
            if (!match && !value.includes("\n")) {
              return (
                <code
                  className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em]"
                  {...props}
                >
                  {children as ReactNode}
                </code>
              );
            }
            return <CodeBlock code={value} language={match?.[1] ?? ""} />;
          },
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
});