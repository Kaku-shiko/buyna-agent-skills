import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Sparkles, ExternalLink } from "lucide-react";
import type { OfficialAiGuideCopy } from "@/content/official-site";
import { useOfficialLanguage } from "@/hooks/use-official-language";

type Recommendation = {
  id: string;
  title: string;
  reason: string;
  type: string;
  price: number | null;
  currency: string | null;
  target_url: string | null;
  merchant_name: string | null;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  recommendations?: Recommendation[];
};

function welcomeMessage(copy: OfficialAiGuideCopy): Msg {
  return {
    role: "assistant",
    content: copy.welcome,
  };
}

function newSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

export function AIShoppingGuide() {
  const { content } = useOfficialLanguage();
  const copy = content.aiGuide;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => [welcomeMessage(copy)]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(newSessionId());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0]?.role === "assistant" ? [welcomeMessage(copy)] : prev,
    );
  }, [copy]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const history = nextMessages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const resp = await fetch("/api/ai-shopping-guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          message: text,
          history,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        answer: string;
        recommendations?: Recommendation[];
        session_id?: string;
      };
      if (data.session_id) sessionIdRef.current = data.session_id;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || copy.noReply,
          recommendations: data.recommendations ?? [],
        },
      ]);
    } catch (err) {
      console.error(err);
      setError(copy.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={copy.openAriaLabel}
          className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full btn-primary shadow-lg transition-transform hover:-translate-y-0.5"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed inset-x-2 bottom-2 z-50 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[380px]">
          <div className="glass flex h-[70vh] max-h-[600px] flex-col overflow-hidden rounded-2xl border border-border shadow-2xl sm:h-[560px]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg btn-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{copy.title}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {copy.subtitle}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={copy.closeAriaLabel}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div className="max-w-[85%] space-y-2">
                    <div
                      className={
                        m.role === "user"
                          ? "rounded-2xl rounded-br-sm btn-primary px-3 py-2 text-sm"
                          : "rounded-2xl rounded-bl-sm border border-border bg-background/60 px-3 py-2 text-sm text-foreground"
                      }
                    >
                      {m.content}
                    </div>
                    {m.recommendations && m.recommendations.length > 0 && (
                      <div className="space-y-2">
                        {m.recommendations.slice(0, 3).map((r) => (
                          <a
                            key={r.id}
                            href={r.target_url ?? "#"}
                            target={r.target_url?.startsWith("http") ? "_blank" : undefined}
                            rel="noreferrer"
                            className="block rounded-xl border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/60 hover:bg-background/80"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-semibold text-foreground">{r.title}</div>
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                                {r.type}
                              </span>
                            </div>
                            {r.reason && (
                              <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                            )}
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {r.price != null
                                  ? `${r.currency ?? ""} ${r.price.toLocaleString()}`
                                  : (r.merchant_name ?? "")}
                              </span>
                              {r.target_url && (
                                <span className="inline-flex items-center gap-1 text-primary">
                                  {copy.viewLabel} <ExternalLink className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                    {copy.thinking}
                  </div>
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="border-t border-border p-2"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder={copy.placeholder}
                  className="min-h-[40px] max-h-32 flex-1 resize-none rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg btn-primary disabled:opacity-50"
                  aria-label={copy.sendAriaLabel}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
