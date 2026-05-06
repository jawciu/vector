-- Add orchestrator I/O JSON columns to ExternalEvent for debugging.
-- Persisted by lib/integrations/miniti.js#processMinitiEvent at the end
-- of an orchestrator run. Surfaced via the "Show debug" toggle in
-- app/components/StuckEventsList.js.
--   orchestratorInput  — the JSON context sent to Claude
--                        (output of buildOrchestratorContext)
--   orchestratorOutput — the array of tool calls Claude returned
--                        ([{ tool, input, id }, ...])
-- Both nullable: pre-existing rows + ambiguous events that never reach
-- the orchestrator won't have them.
ALTER TABLE "ExternalEvent" ADD COLUMN "orchestratorInput" JSONB;
ALTER TABLE "ExternalEvent" ADD COLUMN "orchestratorOutput" JSONB;
