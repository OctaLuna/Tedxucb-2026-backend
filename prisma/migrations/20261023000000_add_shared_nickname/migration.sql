-- Nullable para preservar cuentas existentes y permitir onboarding gradual.
ALTER TABLE "users" ADD COLUMN "nickname" TEXT;
ALTER TABLE "users" ADD COLUMN "nickname_key" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "nickname_pair_consistent"
  CHECK (("nickname" IS NULL) = ("nickname_key" IS NULL));
CREATE UNIQUE INDEX "users_nickname_key_key" ON "users"("nickname_key");
