const ALLOWED_ORIGIN = "https://happypixels.app";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...(extraHeaders || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    if (!env.BREVO_API_KEY || !env.BREVO_LIST_ID) {
      return jsonResponse({ error: "Signup is not configured yet." }, 503);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid request body." }, 400);
    }

    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_PATTERN.test(email)) {
      return jsonResponse({ error: "Please enter a valid email address." }, 400);
    }

    const listId = Number(env.BREVO_LIST_ID);
    if (!Number.isFinite(listId) || listId <= 0) {
      return jsonResponse({ error: "Signup is not configured yet." }, 503);
    }

    try {
      const brevoResponse = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email,
          listIds: [listId],
          updateEnabled: true,
        }),
      });

      if (brevoResponse.ok) {
        return jsonResponse({ ok: true }, 200);
      }

      const brevoBody = await brevoResponse.text();
      if (
        brevoResponse.status === 400 &&
        /already exist|duplicate/i.test(brevoBody)
      ) {
        return jsonResponse({ ok: true }, 200);
      }

      return jsonResponse(
        { error: "We couldn't add your email right now. Please try again." },
        502
      );
    } catch {
      return jsonResponse(
        { error: "We couldn't add your email right now. Please try again." },
        502
      );
    }
  },
};
