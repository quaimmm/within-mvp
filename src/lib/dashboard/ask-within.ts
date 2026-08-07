import type { DemoState } from "../../data/demo-state.ts";
import { createCompanyContext } from "../intelligence/company-context.ts";
import { answerWorkspaceQuestion as answerCompanyQuestion } from "../intelligence/ask-within.ts";

export function answerWorkspaceQuestion(state: DemoState, question: string): string {
  return answerCompanyQuestion(createCompanyContext(state), question);
}
