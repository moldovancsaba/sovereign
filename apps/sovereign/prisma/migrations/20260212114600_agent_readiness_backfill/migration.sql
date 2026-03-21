-- Reclassify queued tasks for NOT_READY agents so they remain visible and actionable.
UPDATE "public"."AgentTask" AS t
SET
  "status" = 'MANUAL_REQUIRED',
  "error" = 'Agent readiness is NOT_READY. Complete the readiness checklist and switch the agent to READY.',
  "finishedAt" = COALESCE(t."finishedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "public"."Agent" AS a
WHERE
  t."agentKey" = a."key"
  AND t."status" = 'QUEUED'
  AND a."readiness" = 'NOT_READY';
