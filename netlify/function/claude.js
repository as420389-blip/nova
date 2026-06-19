// netlify/functions/claude.js
//
// Despite the filename (kept for compatibility with nova.html, which calls
// /.netlify/functions/claude), this proxy currently talks to GROQ.
//
// WHY A PROXY AT ALL: this function runs on Netlify's server, not in the
// browser, so your API key stays secret. nova.html never sees it.
//
// ─────────────────────────────────────────────────────────────────────────
// CURRENT SETUP — GROQ (what you have today)
// ─────────────────────────────────────────────────────────────────────────
// 1. Netlify site dashboard → Site settings → Environment variables
// 2. Add: GROQ_API_KEY = gsk_...   (from https://console.groq.com/keys)
// 3. Deploy. Done — no other steps needed.
//
// ─────────────────────────────────────────────────────────────────────────
// FUTURE SETUP — ANTHROPIC (when/if you get a key later)
// ─────────────────────────────────────────────────────────────────────────
// 1. Add a second env var: ANTHROPIC_API_KEY = sk-ant-...
// 2. Add one more env var: AI_PROVIDER = anthropic
//    (omit this var, or set it to "groq", to keep using Groq)
// 3. Redeploy. No code changes needed — this file already supports both.
// ─────────────────────────────────────────────────────────────────────────

const GROQ_MODEL = "llama-3.3-70b-versatile";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

async function callGroq(apiKey, system, message) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1500,
      temperature: 0.7,
      messages: [
        { role: "system", content: system || "" },
        { role: "user", content: message },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Groq API error " + res.status + ": " + errText);
  }
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

async function callAnthropic(apiKey, system, message) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      system: system || "",
      messages: [{ role: "user", content: message }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Anthropic API error " + res.status + ": " + errText);
  }
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("");
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Provider switch — defaults to groq. Set AI_PROVIDER=anthropic to flip.
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();

  try {
    const { system, message } = JSON.parse(event.body || "{}");
    if (!message) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing 'message' in request body" }) };
    }

    let text;

    if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        return {
          statusCode: 500, headers,
          body: JSON.stringify({ error: "AI_PROVIDER is set to 'anthropic' but ANTHROPIC_API_KEY is missing. Add it in Netlify env vars, or remove AI_PROVIDER to fall back to Groq." }),
        };
      }
      text = await callAnthropic(key, system, message);
    } else {
      const key = process.env.GROQ_API_KEY;
      if (!key) {
        return {
          statusCode: 500, headers,
          body: JSON.stringify({ error: "GROQ_API_KEY not set. Add it in Netlify → Site settings → Environment variables (get a key at console.groq.com/keys), then redeploy." }),
        };
      }
      text = await callGroq(key, system, message);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text, provider }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
