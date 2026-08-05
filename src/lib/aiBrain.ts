import { supabase } from './supabase';
import { executeAITool, AIToolContext } from './aiTools';

// DECKARC AI conversation orchestrator.
//
// This replaces the old regex/keyword capability dispatcher with a real
// LLM-driven reasoning loop: every user message goes to the deckarc-ai-chat
// edge function, which asks the LLM to either answer directly or call a tool.
// When it calls a tool, we execute that tool here (client-side, inside the
// user's authenticated session — see aiTools.ts) and send the result back so
// the model can keep reasoning, until it produces a final answer.
//
// `history` is the raw Gemini `contents` array. The caller (DeckarcAIPage) is
// responsible for holding onto it and passing it back in on the next message —
// that's what gives the assistant multi-turn memory (e.g. resolving "it" to
// whatever was discussed a turn earlier).

export interface AIMessagePart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface AIConversationTurn {
  role: 'user' | 'model';
  parts: AIMessagePart[];
}

export type AIAgentContext = AIToolContext;

export interface AIAgentResult {
  reply: string;
  history: AIConversationTurn[];
}

interface ChatFunctionResponse {
  done: boolean;
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  history?: AIConversationTurn[];
  error?: string;
}

const MAX_TOOL_HOPS = 4;

async function extractEdgeFunctionErrorMessage(error: unknown): Promise<string> {
  const withContext = error as { context?: Response; message?: string } | null;
  if (withContext?.context && typeof withContext.context.json === 'function') {
    try {
      const body = await withContext.context.json();
      if (body?.error) return body.error as string;
    } catch {
      // response body wasn't JSON — fall through to generic message
    }
  }
  return withContext?.message || "DECKARC AI is temporarily unavailable. Please try again.";
}

async function callAIChatFunction(contents: AIConversationTurn[]): Promise<ChatFunctionResponse> {
  const { data, error } = await supabase.functions.invoke('deckarc-ai-chat', {
    body: { contents },
  });

  if (error) {
    throw new Error(await extractEdgeFunctionErrorMessage(error));
  }
  if (!data) {
    throw new Error('DECKARC AI returned an empty response. Please try again.');
  }
  if (data.error) {
    throw new Error(data.error as string);
  }
  return data as ChatFunctionResponse;
}

/**
 * Send a user message to DECKARC AI and resolve it to a final reply,
 * executing any tool calls the model requests along the way.
 */
export async function sendAIMessage(
  priorHistory: AIConversationTurn[],
  userText: string,
  context: AIAgentContext,
): Promise<AIAgentResult> {
  const trimmed = userText.trim();
  if (!trimmed) {
    return {
      reply: "I'm listening. Ask me about your projects, tasks, or today's Project Pulse.",
      history: priorHistory,
    };
  }

  let contents: AIConversationTurn[] = [...priorHistory, { role: 'user', parts: [{ text: trimmed }] }];

  for (let hop = 0; hop <= MAX_TOOL_HOPS; hop++) {
    let response: ChatFunctionResponse;
    try {
      response = await callAIChatFunction(contents);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'DECKARC AI is temporarily unavailable.';
      return { reply: message, history: priorHistory };
    }

    contents = response.history ?? contents;

    if (response.done) {
      return { reply: response.text || "I don't have an answer for that right now.", history: contents };
    }

    if (response.functionCall) {
      const toolResult = await executeAITool(response.functionCall.name, response.functionCall.args, context);
      contents = [
        ...contents,
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: response.functionCall.name,
                response: { result: toolResult },
              },
            },
          ],
        },
      ];
      continue;
    }

    return { reply: "I wasn't able to process that request.", history: contents };
  }

  return {
    reply: "I'm having trouble completing that request right now. Could you try rephrasing it?",
    history: contents,
  };
}
