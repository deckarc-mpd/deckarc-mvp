import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SYSTEM_INSTRUCTION, TOOL_DECLARATIONS } from "./knowledge.ts";

// DECKARC AI reasoning endpoint.
//
// This function ONLY reasons and decides which tool to call — it never touches
// platform data directly. Tool execution happens back on the client, inside the
// user's already-authenticated Supabase session, so every query still goes
// through the platform's existing row-level security exactly as it does for the
// rest of the app. This function's only job is: verify the caller is an
// authorized DECKARC admin, then forward the conversation to the LLM.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_ROLE = "DECKARC_ADMIN";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";
const MAX_HISTORY_TURNS = 40;

interface ChatRequestBody {
  contents?: unknown[];
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  [key: string]: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("deckarc-ai-chat: missing SUPABASE_URL/SUPABASE_ANON_KEY env.");
      return json({ error: "DECKARC AI is misconfigured. Please contact an administrator." }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "You must be signed in to use DECKARC AI." }, 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, role, is_active")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.role !== ALLOWED_ROLE || profile.is_active === false) {
      return json(
        { error: "DECKARC AI is only available to authorized DECKARC administrators." },
        403,
      );
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return json(
        {
          error:
            "DECKARC AI is not fully configured yet — an administrator needs to set the GEMINI_API_KEY secret for this project.",
        },
        503,
      );
    }

    const body = (await req.json().catch(() => ({}))) as ChatRequestBody;
    const contents = Array.isArray(body.contents) ? body.contents.slice(-MAX_HISTORY_TURNS) : [];
    if (contents.length === 0) {
      return json({ error: "No conversation content provided." }, 400);
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          tools: [{ function_declarations: TOOL_DECLARATIONS }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("deckarc-ai-chat: Gemini API error", geminiRes.status, errText);
      return json(
        { error: "DECKARC AI's reasoning engine is temporarily unavailable. Please try again shortly." },
        502,
      );
    }

    const geminiData = await geminiRes.json();
    const candidate = geminiData?.candidates?.[0];
    const parts: GeminiPart[] = candidate?.content?.parts ?? [];
    const functionCallPart = parts.find((p) => p.functionCall);
    const modelTurn = { role: "model", parts };
    const nextHistory = [...contents, modelTurn];

    if (functionCallPart?.functionCall) {
      return json({
        done: false,
        functionCall: {
          name: functionCallPart.functionCall.name,
          args: functionCallPart.functionCall.args ?? {},
        },
        history: nextHistory,
      });
    }

    const text = parts.map((p) => p.text).filter(Boolean).join(" ").trim();

    if (candidate?.finishReason === "SAFETY" || !text) {
      return json({
        done: true,
        text: "I'm not able to answer that one. Could you rephrase your question?",
        history: nextHistory,
      });
    }

    return json({ done: true, text, history: nextHistory });
  } catch (err) {
    console.error("deckarc-ai-chat: unhandled error", err);
    return json({ error: "Something went wrong processing your request." }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
