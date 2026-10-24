ALTER TABLE "users" DROP CONSTRAINT "valid_registration_source";
ALTER TABLE "users" ADD CONSTRAINT "valid_registration_source"
  CHECK ("registration_source" IN ('SELF_REGISTRATION', 'ADMIN_CREATED', 'GOOGLE'));

ALTER TABLE "users" DROP CONSTRAINT "password_required_unless_invited";
ALTER TABLE "users" ADD CONSTRAINT "password_required_unless_invited"
  CHECK ("status" IN ('INVITED', 'DISABLED') OR "password_hash" IS NOT NULL OR "registration_source" = 'GOOGLE');

CREATE TABLE "user_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "verified_email" TEXT NOT NULL,
  "hosted_domain" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_identities_provider_check" CHECK ("provider" = 'GOOGLE'),
  CONSTRAINT "user_identities_subject_check" CHECK (length("subject") > 0),
  CONSTRAINT "user_identities_email_lowercase" CHECK ("verified_email" = lower("verified_email")),
  CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "user_identities_provider_subject_key" ON "user_identities"("provider", "subject");
CREATE UNIQUE INDEX "user_identities_user_id_provider_key" ON "user_identities"("user_id", "provider");
