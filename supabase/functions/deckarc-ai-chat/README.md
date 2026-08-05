# deckarc-ai-chat

Reasoning endpoint for DECKARC AI (see `src/lib/aiBrain.ts` and `src/lib/aiTools.ts`
on the client side). This function only talks to the LLM and decides which tool
to call — it never touches platform data itself. Tool execution happens back on
the client inside the signed-in user's own Supabase session, so every data
fetch is still bound by the platform's existing row-level security.

## Access control

Only requests from an authenticated user whose `user_profiles.role` is
`DECKARC_ADMIN` are accepted (this is the platform's "DECKARC" role). Everyone
else gets a 403. The check happens server-side against the caller's own JWT —
the client never gets to assert its own role.

## Required secrets

Set these as Supabase Edge Function secrets (Dashboard → Project Settings →
Edge Functions → Secrets, or `supabase secrets set`):

- `GEMINI_API_KEY` — **required**. Get one from https://aistudio.google.com/apikey.
  Until this is set, the function returns a clear "not configured yet" error
  instead of failing silently or fabricating a response.
- `GEMINI_MODEL` — optional, defaults to `gemini-2.0-flash`.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are already provided automatically to
every Edge Function by the Supabase runtime — no need to set those.

## Deploying

```
supabase functions deploy deckarc-ai-chat
supabase secrets set GEMINI_API_KEY=your-key-here
```

## Swapping in OpenAI later

The spec calls for Gemini or GPT interchangeably. To add OpenAI as an
alternative provider, replace the single `fetch(...generativelanguage...)`
call in `index.ts` with a small provider switch (e.g. based on an
`AI_PROVIDER` secret) that calls OpenAI's `chat.completions` with `tools`
instead — the request/response contract this function exposes to the client
(`{ done, text | functionCall, history }`) does not need to change.
