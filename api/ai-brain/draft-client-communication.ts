// Backs GeminiDraftClient (src/lib/aiBrain/domains/customerSuccess/draftClient.ts).
// Same Gemini REST pattern as interpret-field-update.ts. Server-side only —
// the API key never reaches the browser. NOT exercised against a live
// model from this sandbox; the caller already degrades to
// DeterministicDraftClient on any non-200/malformed response. The model
// only ever sees a candidate's verified fact anchors (never raw project/
// decision/delay rows), so it cannot fabricate a claim beyond what's
// already verified — matching this SOP's groundedness verification, which
// independently checks every anchor's value appears verbatim in the draft.
//
// This route was missing until now: GeminiDraftClient's default endpoint
// has pointed here since Phase 5, but the route itself was never built,
// so this client always silently fell back to the deterministic template
// even when GEMINI_API_KEY was set.

export const config = { runtime: 'edge' };

const MODEL = 'gemini-3.5-flash-lite';

interface AnchorInput {
  label: string;
  value: string;
}
interface RequestBody {
  occasion: 'decision_reminder' | 'delay_update';
  anchors: AnchorInput[];
}

const SYSTEM_PROMPT = `You draft a short, warm client-facing project update email for a construction company. You are given an "occasion" (either a pending decision that needs the homeowner's input, or a schedule delay update) and a list of already-verified fact anchors (label/value pairs) — never any other project data, so do not invent details beyond what's given. Keep it brief, friendly, and professional — one short paragraph.

Respond with ONLY a JSON object: {"subject": "...", "body": "..."}. The body MUST include every anchor value verbatim somewhere in the text. No markdown, no extra text.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'Server is missing GEMINI_API_KEY.' }, 500);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const anchorsText = (body.anchors || []).map((a) => `${a.label}: ${a.value}`).join('; ');
  const userText = `Occasion: ${body.occasion}\nVerified fact anchors: ${anchorsText || 'none'}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 300, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) return json({ error: 'Gemini request failed.' }, 502);

    const data = await resp.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    return json({ subject: parsed.subject, body: parsed.body });
  } catch (e) {
    return json({ error: 'Upstream error contacting Gemini.', detail: String(e).slice(0, 300) }, 502);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
