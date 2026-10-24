-- Opaque per-space code for payment provider webhook URLs.
ALTER TABLE "SpacePaymentConfig" ADD COLUMN "webhookPublicCode" TEXT;
UPDATE "SpacePaymentConfig" SET "webhookPublicCode" = replace(gen_random_uuid()::text, '-', '') || substr(md5(random()::text), 1, 8) WHERE "webhookPublicCode" IS NULL;
ALTER TABLE "SpacePaymentConfig" ALTER COLUMN "webhookPublicCode" SET NOT NULL;
CREATE UNIQUE INDEX "SpacePaymentConfig_webhookPublicCode_key" ON "SpacePaymentConfig"("webhookPublicCode");
