-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "registration_source" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    -- email siempre se guarda ya normalizado en minúsculas (ver
    -- src/common/utils/normalize-email.util.ts); el motor lo exige en vez
    -- de confiar en que cada escritura futura lo recuerde. Sustituye al
    -- diseño original con citext: Prisma excluye por completo los campos
    -- Unsupported de su API tipada, así que citext no era viable aquí.
    CONSTRAINT "email_stored_lowercase" CHECK ("email" = lower("email")),
    CONSTRAINT "valid_status" CHECK ("status" IN ('INVITED','PENDING','ACTIVE','DISABLED','REJECTED')),
    CONSTRAINT "valid_registration_source" CHECK ("registration_source" IN ('SELF_REGISTRATION','ADMIN_CREATED')),
    CONSTRAINT "self_registration_never_invited" CHECK ("registration_source" <> 'SELF_REGISTRATION' OR "status" <> 'INVITED'),
    CONSTRAINT "admin_created_never_pending_or_rejected" CHECK ("registration_source" <> 'ADMIN_CREATED' OR "status" NOT IN ('PENDING','REJECTED')),
    CONSTRAINT "password_required_unless_invited" CHECK ("status" = 'INVITED' OR "password_hash" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role"),
    CONSTRAINT "valid_role" CHECK ("role" IN ('ADMIN','STAFF','ALUMNO'))
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "new_email" TEXT,
    "created_by" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "new_email_stored_lowercase" CHECK ("new_email" IS NULL OR "new_email" = lower("new_email")),
    CONSTRAINT "valid_type" CHECK ("type" IN ('INVITATION','EMAIL_VERIFICATION','PASSWORD_RESET')),
    CONSTRAINT "invitation_has_creator" CHECK ("type" <> 'INVITATION' OR "created_by" IS NOT NULL),
    CONSTRAINT "valid_expiry_window" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '7 days')
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "replaced_by" UUID,
    "revoked_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valid_refresh_expiry" CHECK ("expires_at" > "created_at")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "idx_users_status" ON "users"("status");
CREATE INDEX "idx_users_created_by" ON "users"("created_by");

-- CreateIndex
CREATE INDEX "idx_user_roles_role" ON "user_roles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "one_pending_token_per_user_type" ON "auth_tokens"("user_id", "type") WHERE "consumed_at" IS NULL;
CREATE UNIQUE INDEX "idx_auth_tokens_hash" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_key" ON "refresh_tokens"("replaced_by");
CREATE UNIQUE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens"("token_hash");
CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens"("family_id");
CREATE INDEX "idx_refresh_tokens_user_active" ON "refresh_tokens"("user_id") WHERE "revoked_at" IS NULL;

-- CreateIndex
CREATE INDEX "idx_audit_entity" ON "audit_log"("entity_type", "entity_id", "created_at" DESC);
CREATE INDEX "idx_audit_actor" ON "audit_log"("actor_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RF-119: nunca sin administrador activo. No es una restriccion estatica
-- (depende de contar filas relacionadas en el momento de la operacion), asi
-- que se implementa con triggers -- un SELECT previo en el servicio no basta
-- contra dos peticiones concurrentes.
CREATE OR REPLACE FUNCTION forbid_removing_last_admin() RETURNS TRIGGER AS $$
DECLARE
  remaining_admins INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_admins
  FROM user_roles ur
  JOIN users u ON u.id = ur.user_id
  WHERE ur.role = 'ADMIN'
    AND u.status = 'ACTIVE'
    AND ur.user_id <> OLD.user_id;

  IF remaining_admins = 0 THEN
    RAISE EXCEPTION
      'No se puede retirar el rol de administrador: el sistema quedaria sin ningun administrador activo (RF-119)';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_remove_last_admin_role
  BEFORE DELETE ON user_roles
  FOR EACH ROW WHEN (OLD.role = 'ADMIN')
  EXECUTE FUNCTION forbid_removing_last_admin();

CREATE OR REPLACE FUNCTION forbid_disabling_last_admin() RETURNS TRIGGER AS $$
DECLARE
  remaining_admins INTEGER;
BEGIN
  IF NEW.status = 'DISABLED' AND OLD.status <> 'DISABLED' THEN
    SELECT COUNT(*) INTO remaining_admins
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.role = 'ADMIN' AND u.status = 'ACTIVE' AND u.id <> NEW.id;

    IF remaining_admins = 0
       AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = NEW.id AND role = 'ADMIN') THEN
      RAISE EXCEPTION
        'No se puede deshabilitar: es el unico administrador activo (RF-119)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_disable_last_admin
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION forbid_disabling_last_admin();

-- auth_tokens es de un solo uso: una vez consumido, no se puede volver a
-- marcar como consumido (mismo espiritu que el libro mayor de puntos de 003).
CREATE OR REPLACE FUNCTION forbid_token_reuse() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    RAISE EXCEPTION 'auth_tokens no permite modificar un token ya consumido (un solo uso)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_reconsume_auth_token
  BEFORE UPDATE ON auth_tokens
  FOR EACH ROW EXECUTE FUNCTION forbid_token_reuse();
