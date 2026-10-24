CREATE TABLE "AgentOperationReceipt" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "policyVersion" BIGINT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentOperationReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentOperationReceipt_policy_version" CHECK ("policyVersion" > 0),
    CONSTRAINT "AgentOperationReceipt_hash" CHECK ("requestHash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "AgentOperationReceipt_spaceId_actorId_actionKey_key" ON "AgentOperationReceipt"("spaceId", "actorId", "actionKey");
CREATE INDEX "AgentOperationReceipt_spaceId_createdAt_idx" ON "AgentOperationReceipt"("spaceId", "createdAt");
ALTER TABLE "AgentOperationReceipt" ADD CONSTRAINT "AgentOperationReceipt_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
