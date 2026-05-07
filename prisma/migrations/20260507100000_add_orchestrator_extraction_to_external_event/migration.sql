-- Pass 1 (extraction) output for the two-pass Miniti orchestrator. Distinct
-- from `orchestratorOutput` which now stores Pass 2 tool calls only.
ALTER TABLE "ExternalEvent" ADD COLUMN "orchestratorExtraction" JSONB;
