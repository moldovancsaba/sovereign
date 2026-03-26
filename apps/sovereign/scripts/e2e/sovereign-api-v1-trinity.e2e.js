#!/usr/bin/env node
/* eslint-disable no-console */

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json, text };
}

async function stageHealth(baseUrl, headers) {
  const { res, json, text } = await requestJson(`${baseUrl}/api/v1/health`, {
    method: "GET",
    headers
  });
  assert(res.status === 200, `health status expected 200, got ${res.status}: ${text}`);
  assert(json && json.ok === true, "health response must include ok=true");
}

async function stageModels(baseUrl, headers) {
  const { res, json, text } = await requestJson(`${baseUrl}/api/v1/models`, {
    method: "GET",
    headers
  });
  assert(res.status === 200, `models status expected 200, got ${res.status}: ${text}`);
  assert(json && json.object === "list", "models response must include object=list");
  assert(Array.isArray(json.data), "models response must include data array");
}

async function stageChatValidation(baseUrl, headers) {
  const invalidBody = await requestJson(`${baseUrl}/api/v1/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "direct" })
  });
  assert(
    invalidBody.res.status === 400,
    `chat invalid body expected 400, got ${invalidBody.res.status}: ${invalidBody.text}`
  );
  assert(
    invalidBody.json?.error?.type === "invalid_request_error",
    "chat invalid body must return invalid_request_error"
  );

  const invalidMode = await requestJson(`${baseUrl}/api/v1/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "wrong-mode",
      messages: [{ role: "user", content: "hello" }]
    })
  });
  assert(
    invalidMode.res.status === 400,
    `chat invalid mode expected 400, got ${invalidMode.res.status}: ${invalidMode.text}`
  );
  assert(
    invalidMode.json?.error?.code === "invalid_mode",
    "chat invalid mode must return invalid_mode code"
  );
}

async function stageReadEndpoints(baseUrl, headers) {
  const runs = await requestJson(`${baseUrl}/api/v1/trinity/runs?limit=1&page=1`, {
    method: "GET",
    headers
  });
  assert(
    runs.res.status === 200,
    `trinity runs expected 200, got ${runs.res.status}: ${runs.text}`
  );
  assert(runs.json?.object === "list", "trinity runs response must include object=list");

  const rankings = await requestJson(`${baseUrl}/api/v1/rankings/roles`, {
    method: "GET",
    headers
  });
  assert(
    rankings.res.status === 200,
    `rankings expected 200, got ${rankings.res.status}: ${rankings.text}`
  );
  assert(rankings.json?.object === "list", "rankings response must include object=list");
}

async function stageGroupApis(baseUrl, headers) {
  const suffix = Date.now();
  const g1 = `e2e-group-${suffix}-1`;
  const g2 = `e2e-group-${suffix}-2`;

  const create1 = await requestJson(`${baseUrl}/api/v1/agent-groups`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      key: g1,
      displayName: `E2E Group ${suffix} A`,
      description: "e2e coverage group A"
    })
  });
  assert(create1.res.status === 201, `group create1 expected 201, got ${create1.res.status}: ${create1.text}`);

  const create2 = await requestJson(`${baseUrl}/api/v1/agent-groups`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      key: g2,
      displayName: `E2E Group ${suffix} B`,
      description: "e2e coverage group B"
    })
  });
  assert(create2.res.status === 201, `group create2 expected 201, got ${create2.res.status}: ${create2.text}`);

  const list = await requestJson(`${baseUrl}/api/v1/agent-groups`, {
    method: "GET",
    headers
  });
  assert(list.res.status === 200, `group list expected 200, got ${list.res.status}: ${list.text}`);
  assert(Array.isArray(list.json), "group list response must be array");
  assert(
    list.json.some((row) => row.key === g1) && list.json.some((row) => row.key === g2),
    "group list must include created groups"
  );

  const addNested = await requestJson(`${baseUrl}/api/v1/agent-groups/${g1}/members`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      memberType: "GROUP",
      memberGroupKey: g2,
      role: "support"
    })
  });
  assert(
    addNested.res.status === 201,
    `group nested add expected 201, got ${addNested.res.status}: ${addNested.text}`
  );

  const addCycle = await requestJson(`${baseUrl}/api/v1/agent-groups/${g2}/members`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      memberType: "GROUP",
      memberGroupKey: g1,
      role: "cycle-check"
    })
  });
  assert(
    addCycle.res.status === 409,
    `group cycle block expected 409, got ${addCycle.res.status}: ${addCycle.text}`
  );
  assert(
    addCycle.json?.error?.code === "group_cycle_blocked",
    "group cycle block must return group_cycle_blocked code"
  );

  const members = await requestJson(`${baseUrl}/api/v1/agent-groups/${g1}/members`, {
    method: "GET",
    headers
  });
  assert(members.res.status === 200, `group members expected 200, got ${members.res.status}: ${members.text}`);
  assert(Array.isArray(members.json), "group members response must be array");
  assert(
    members.json.some((row) => row.member_type === "GROUP"),
    "group members should include nested group member"
  );

  return {
    groupAKey: g1,
    groupBKey: g2
  };
}

async function stageDirectSuccess(baseUrl, headers) {
  const direct = await requestJson(`${baseUrl}/api/v1/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "direct",
      provider: "mock",
      messages: [{ role: "user", content: "hello from direct test" }]
    })
  });
  assert(
    direct.res.status === 200,
    `direct chat expected 200, got ${direct.res.status}: ${direct.text}`
  );
  assert(direct.json?.choices?.[0]?.message?.content, "direct chat must return assistant content");
  assert(direct.json?.sovereign?.provider === "mock", "direct chat must report mock provider");
}

async function stageTrinitySuccess(baseUrl, headers) {
  const trinity = await requestJson(`${baseUrl}/api/v1/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "trinity",
      provider: "mock",
      team: { strategy: "manual" },
      messages: [{ role: "user", content: "produce an accepted trinity pass" }]
    })
  });
  assert(
    trinity.res.status === 200,
    `trinity chat expected 200, got ${trinity.res.status}: ${trinity.text}`
  );
  assert(trinity.json?.sovereign?.mode === "trinity", "trinity chat must report trinity mode");
  assert(
    trinity.json?.sovereign?.metadata?.trinityStatus === "ACCEPTED",
    "trinity chat must report ACCEPTED status in metadata"
  );
  return trinity.json;
}

async function stageTrinityRunAudit(baseUrl, headers, groupKey) {
  const trinity = await requestJson(`${baseUrl}/api/v1/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "trinity",
      provider: "mock",
      team: {
        strategy: "manual",
        group_key: groupKey
      },
      messages: [{ role: "user", content: "persist this run with group context" }]
    })
  });
  assert(
    trinity.res.status === 200,
    `trinity audit call expected 200, got ${trinity.res.status}: ${trinity.text}`
  );
  const runId = trinity.json?.sovereign?.metadata?.runId;
  assert(runId && typeof runId === "string", "trinity audit call must return metadata.runId");
  assert(
    trinity.json?.sovereign?.metadata?.staffing?.group?.key === groupKey,
    "trinity audit response must include staffing group key"
  );

  const run = await requestJson(`${baseUrl}/api/v1/trinity/runs/${encodeURIComponent(runId)}`, {
    method: "GET",
    headers
  });
  assert(run.res.status === 200, `run read expected 200, got ${run.res.status}: ${run.text}`);
  assert(run.json?.id === runId, "run read id must match returned runId");
  assert(run.json?.status === "ACCEPTED", "run read should have ACCEPTED status in mock flow");
  assert(Array.isArray(run.json?.stage_trace), "run read must include stage_trace");
  assert(
    run.json?.meta?.staffing?.group?.key === groupKey,
    "run read meta should include staffing group key"
  );
}

async function main() {
  const startedAt = Date.now();
  const baseUrl = process.env.SOVEREIGN_E2E_BASE_URL || "http://127.0.0.1:3007";
  const token = process.env.SOVEREIGN_API_TOKEN || "";
  const headers = token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};

  const summary = {
    runId: `sovereign-api-v1-trinity-e2e-${new Date().toISOString()}`,
    baseUrl,
    stages: {}
  };

  await stageHealth(baseUrl, headers);
  summary.stages.health = { passed: true };

  await stageModels(baseUrl, headers);
  summary.stages.models = { passed: true };

  await stageChatValidation(baseUrl, headers);
  summary.stages.chatValidation = { passed: true };

  await stageReadEndpoints(baseUrl, headers);
  summary.stages.readEndpoints = { passed: true };

  await stageDirectSuccess(baseUrl, headers);
  summary.stages.directSuccess = { passed: true };

  const trinitySuccess = await stageTrinitySuccess(baseUrl, headers);
  summary.stages.trinitySuccess = {
    passed: true,
    runId: trinitySuccess?.sovereign?.metadata?.runId || null
  };

  const groups = await stageGroupApis(baseUrl, headers);
  summary.stages.groupApis = { passed: true, groupAKey: groups.groupAKey };

  await stageTrinityRunAudit(baseUrl, headers, groups.groupAKey);
  summary.stages.trinityRunAudit = { passed: true };

  summary.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[sovereign-api-v1-trinity-e2e] failed:", error.message || error);
  process.exitCode = 1;
});
