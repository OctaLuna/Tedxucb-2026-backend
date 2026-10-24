CREATE TABLE "external_email_proofs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subject" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "verified_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_email_proofs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_email_proofs_email_lowercase" CHECK ("email" = lower("email")),
  CONSTRAINT "external_email_proofs_expiry" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "external_email_proofs_subject_email_key" ON "external_email_proofs"("subject", "email");
CREATE UNIQUE INDEX "external_email_proofs_token_hash_key" ON "external_email_proofs"("token_hash");

CREATE TABLE "identity_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_invitations_email_lowercase" CHECK ("email" = lower("email")),
  CONSTRAINT "identity_invitations_expiry" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "identity_invitations_token_hash_key" ON "identity_invitations"("token_hash");
CREATE INDEX "identity_invitations_email_idx" ON "identity_invitations"("email");
