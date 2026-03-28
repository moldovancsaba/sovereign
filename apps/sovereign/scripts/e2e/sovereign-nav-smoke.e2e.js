#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Lightweight HTTP smoke: /api/ready, /signin, and key app routes respond.
 * Requires a running app (e.g. `npm run dev`). Does not authenticate.
 *
 * Protected routes may return a redirect to /signin (hosted auth) or 200 with
 * the Sovereign shell (e.g. local session / dev operator).
 *
 *   SOVEREIGN_E2E_BASE_URL=http://localhost:3007 npm run e2e:nav-smoke
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isRedirectToSignin(status, location) {
  return [302, 307, 308].includes(status) && /signin/i.test(location || "");
}

/** Minimal HTML markers for the design-system shell (SSR). */
function looksLikeSovereignShell(html) {
  return /design-system-v1/.test(html) && /ds-shell-header/.test(html);
}

async function main() {
  const baseUrl = (process.env.SOVEREIGN_E2E_BASE_URL || "http://localhost:3007").replace(/\/$/, "");

  let readyRes;
  try {
    readyRes = await fetch(`${baseUrl}/api/ready`, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    const code = err && typeof err === "object" && "cause" in err && err.cause && err.cause.code;
    console.error(
      `[sovereign-nav-smoke] fetch failed (${code || err}). Is the app running on ${baseUrl}?`
    );
    process.exit(1);
  }

  assert(readyRes.status === 200, `/api/ready expected 200, got ${readyRes.status}`);
  const readyJson = await readyRes.json();
  assert(readyJson && readyJson.ok === true, "/api/ready body must include ok: true");

  const signinRes = await fetch(`${baseUrl}/signin`, { signal: AbortSignal.timeout(10_000) });
  assert(signinRes.status === 200, `/signin expected 200, got ${signinRes.status}`);
  const signinText = await signinRes.text();
  assert(
    /sign|auth|github|dev login/i.test(signinText),
    "/signin body should look like a sign-in page"
  );

  const chatRes = await fetch(`${baseUrl}/chat`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000)
  });
  const chatLoc = chatRes.headers.get("location") || "";
  let chatOk = isRedirectToSignin(chatRes.status, chatLoc);
  if (!chatOk && chatRes.status === 200) {
    const chatText = await chatRes.text();
    chatOk =
      looksLikeSovereignShell(chatText) &&
      (/aria-label="Chat status"/.test(chatText) || /No messages yet/.test(chatText));
  }
  assert(
    chatOk,
    `/chat expected redirect to signin or 200 chat shell, got ${chatRes.status} location=${chatLoc}`
  );

  const settingsRes = await fetch(`${baseUrl}/settings`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000)
  });
  const settingsLoc = settingsRes.headers.get("location") || "";
  let settingsOk = isRedirectToSignin(settingsRes.status, settingsLoc);
  if (!settingsOk && settingsRes.status === 200) {
    const settingsText = await settingsRes.text();
    settingsOk =
      looksLikeSovereignShell(settingsText) &&
      /class="ds-page-title">Settings</.test(settingsText);
  }
  assert(
    settingsOk,
    `/settings expected redirect to signin or 200 settings shell, got ${settingsRes.status} location=${settingsLoc}`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checks: ["/api/ready", "/signin", "/chat", "/settings"]
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[sovereign-nav-smoke]", err.message || err);
  process.exit(1);
});
