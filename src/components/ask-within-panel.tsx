"use client";

import { useMemo, useState } from "react";
import type { DemoState } from "@/data/demo-state";
import { answerWorkspaceQuestion } from "@/lib/dashboard/ask-within";

const suggestions = [
  "What needs attention?",
  "Which rules are active?",
  "How is company spend tracking?",
] as const;

export function AskWithinPanel({ state }: { state: DemoState }) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const answer = useMemo(
    () => submittedQuestion ? answerWorkspaceQuestion(state, submittedQuestion) : "Ask about company spend, active rules or purchases that need attention.",
    [state, submittedQuestion],
  );

  function ask(value: string) {
    const next = value.trim();
    if (!next) return;
    setQuestion(next);
    setSubmittedQuestion(next);
  }

  return (
    <section aria-labelledby="ask-within-title" className="mt-16 border-y border-border py-8">
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <div>
          <p className="text-[9px] uppercase tracking-[0.12em] text-accent">Read-only workspace view</p>
          <h3 id="ask-within-title" className="mt-3 text-[18px] font-normal tracking-[-0.03em] text-ink">Ask Within</h3>
          <p className="mt-3 max-w-[190px] text-[10px] leading-5 text-muted">Get a concise answer from the company information already in this workspace.</p>
        </div>
        <div>
          <form onSubmit={(event) => { event.preventDefault(); ask(question); }} className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 transition-colors focus-within:border-border-strong">
            <input
              aria-label="Ask Within a question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about spend, rules or approvals"
              className="h-12 min-w-0 flex-1 bg-transparent text-[11px] text-ink outline-none placeholder:text-faint"
            />
            <button type="submit" disabled={!question.trim()} className="text-[10px] font-medium text-accent transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30">Ask</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="text-[9px] text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{suggestion}</button>)}
          </div>
          <div aria-live="polite" className="mt-7 min-h-12 border-l border-accent/35 pl-5">
            {submittedQuestion && <p className="text-[9px] text-faint">{submittedQuestion}</p>}
            <p className={`${submittedQuestion ? "mt-2" : ""} max-w-2xl text-[12px] leading-6 text-ink`}>{answer}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
