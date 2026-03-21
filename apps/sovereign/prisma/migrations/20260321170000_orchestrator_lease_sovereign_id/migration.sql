-- Rename canonical orchestrator lease id to sovereign (worker + lease.ts default).
UPDATE "OrchestratorLease" SET id = 'sovereign-primary-orchestrator' WHERE id = 'sentinelsquad-primary-orchestrator';
