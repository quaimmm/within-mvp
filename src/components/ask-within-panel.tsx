"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoState } from "@/data/demo-state";
import { createCompanyContext } from "@/lib/intelligence/company-context";
import { ASK_WITHIN_HISTORY_KEY, askWithinQuestion } from "@/lib/intelligence/ask-within";

const suggestions = [
  "Summarise this month's spending.",
  "Which department spends the most?",
  "What needs Finance's attention?",
  "Where can we automate more?",
  "What's our largest expense?",
  "Which merchants receive the most spend?",
  "How much company credit is available?",
  "How much employee credit is outstanding?",
  "Which approvals are currently pending?",
  "Which rules are active?",
  "Which policy has the highest limit?",
  "Which rules trigger the most approvals?",
  "How many purchases were auto-approved?",
  "How many required manager approval?",
  "How many required treasury approval?",
  "What percentage of spend is compliant?",
  "Why did the British Airways purchase require approval?",
  "Which employees are close to their limits?",
  "Which team has the most unused allowance?",
  "Do we have recurring spending patterns?",
  "How much did Sales spend on travel?",
  "What is our available treasury balance?",
] as const;

type AskedQuestion = { id: string; text: string };

function restoreQuestions(): AskedQuestion[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ASK_WITHIN_HISTORY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AskedQuestion => Boolean(item && typeof item === "object" && typeof (item as AskedQuestion).id === "string" && typeof (item as AskedQuestion).text === "string")).slice(-6);
  } catch {
    return [];
  }
}

function storeQuestions(questions: AskedQuestion[]) {
  try {
    sessionStorage.setItem(ASK_WITHIN_HISTORY_KEY, JSON.stringify(questions));
  } catch {
    // History is a convenience; answers continue to work if storage is unavailable.
  }
}

function clearStoredQuestions() {
  try {
    sessionStorage.removeItem(ASK_WITHIN_HISTORY_KEY);
  } catch {
    // The in-memory conversation can still be cleared.
  }
}

export function AskWithinPanel({ state }: { state: DemoState }) {
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState<AskedQuestion[]>([]);
  const [suggestionOffset, setSuggestionOffset] = useState(0);
  const [thinking, setThinking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceRef = useRef(0);
  const context = useMemo(() => createCompanyContext(state), [state]);
  const conversation = useMemo(
    () => questions.reduce<{
      items: Array<AskedQuestion & { answer: ReturnType<typeof askWithinQuestion> }>;
      previousIntent?: string;
    }>((result, item) => {
      const answer = askWithinQuestion(context, item.text, result.previousIntent);
      return {
        items: [...result.items, { ...item, answer }],
        previousIntent: answer.intent,
      };
    }, { items: [] }).items,
    [context, questions],
  );
  const visibleSuggestions = Array.from({ length: 4 }, (_, index) => suggestions[(suggestionOffset + index) % suggestions.length]);

  useEffect(() => {
    Promise.resolve().then(() => setQuestions(restoreQuestions()));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  function ask(value: string) {
    const next = value.trim();
    if (!next || thinking) return;
    setThinking(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setQuestions((current) => {
        const item = { id: `ask-${Date.now()}-${sequenceRef.current++}`, text: next };
        const updated = [...current, item].slice(-6);
        storeQuestions(updated);
        return updated;
      });
      setQuestion("");
      setThinking(false);
    }, 280);
  }

  function clearConversation() {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearStoredQuestions();
    setQuestions([]);
    setQuestion("");
    setThinking(false);
  }

  return (
    <section aria-labelledby="ask-within-title" className="mt-16 border-y border-border py-8">
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <div>
          <p className="text-[9px] uppercase tracking-[0.12em] text-accent">Read-only company intelligence</p>
          <h3 id="ask-within-title" className="mt-3 text-[18px] font-normal tracking-[-0.03em] text-ink">Ask Within</h3>
          <p className="mt-3 max-w-[190px] text-[10px] leading-5 text-muted">Ask about company spend, rules, approvals, teams, merchants or credit.</p>
          {questions.length > 0 && <button type="button" onClick={clearConversation} className="mt-5 text-[9px] text-faint transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">New question</button>}
        </div>
        <div>
          <form onSubmit={(event) => { event.preventDefault(); ask(question); }} className="flex items-end gap-3 rounded-xl border border-border bg-white px-4 py-2 transition-colors focus-within:border-border-strong">
            <textarea
              aria-label="Ask Within a question"
              value={question}
              rows={1}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask(question);
                }
              }}
              placeholder="Ask about company spend, rules or risk"
              className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-3 text-[11px] leading-5 text-ink outline-none placeholder:text-faint"
            />
            <button type="submit" disabled={!question.trim() || thinking} className="mb-2 text-[10px] font-medium text-accent transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30">{thinking ? "Thinking…" : "Ask"}</button>
          </form>

          <div className="mt-3 flex items-center gap-x-5 gap-y-2">
            <div className="flex flex-1 flex-wrap gap-x-5 gap-y-2">
              {visibleSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="text-[9px] text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{suggestion}</button>)}
            </div>
            <button type="button" aria-label="Show different suggested questions" onClick={() => setSuggestionOffset((current) => (current + 4) % suggestions.length)} className="shrink-0 text-[9px] text-faint transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Shuffle</button>
          </div>

          <div aria-live="polite" className="mt-7 max-h-[440px] min-h-16 overflow-y-auto border-l border-accent/35 pl-5">
            {conversation.length === 0 && !thinking && <div><p className="text-[12px] leading-6 text-ink">Ask a finance question about the information already in this workspace.</p><p className="mt-1 text-[9px] text-faint">Answers are deterministic, read-only and grounded in current Within data.</p></div>}
            <div className="divide-y divide-border">
              {conversation.map(({ id, text, answer }) => (
                <article key={id} className="py-5 first:pt-0">
                  <p className="text-[9px] text-faint">{text}</p>
                  <div className="mt-4 space-y-4">
                    {answer.sections.map((section) => (
                      <div key={`${id}-${section.label}`} className="grid gap-2 sm:grid-cols-[88px_1fr]">
                        <p className={`text-[8px] uppercase tracking-[0.12em] ${section.label === "Attention" ? "text-[#9a5b42]" : section.label === "Opportunity" ? "text-success" : "text-accent"}`}>{section.label}</p>
                        <p className="max-w-2xl text-[11px] leading-5 text-ink">{section.text}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {thinking && <div role="status" className="flex items-center gap-3 py-5 text-[9px] text-muted"><span className="size-3 animate-spin rounded-full border border-accent/20 border-t-accent"/>Reviewing workspace data…</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
