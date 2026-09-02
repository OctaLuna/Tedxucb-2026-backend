-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "total_points" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "activity_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "color" TEXT,
    "suggested_points" INTEGER,

    CONSTRAINT "activity_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Sin campo de cupo: las actividades no limitan asistentes (confirmado
-- 2026-09-02 con el responsable del proyecto).
CREATE TABLE "activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "points_value" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "checkin_opens_at" TIMESTAMPTZ NOT NULL,
    "checkin_closes_at" TIMESTAMPTZ NOT NULL,
    "allow_multiple_checkins" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valid_window" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "valid_checkin_window" CHECK ("checkin_closes_at" > "checkin_opens_at"),
    CONSTRAINT "valid_status" CHECK ("status" IN ('DRAFT','PUBLISHED','CLOSED','CANCELLED')),
    CONSTRAINT "points_value_positive" CHECK ("points_value" > 0)
);

-- CreateTable
CREATE TABLE "activity_staff" (
    "activity_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by" UUID,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_staff_pkey" PRIMARY KEY ("activity_id","user_id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    -- Copia de activities.allow_multiple_checkins al insertar, no una
    -- referencia en vivo -- un índice único parcial no puede consultar otra
    -- tabla en su predicado (ver data-model.md §3 de 003).
    "multiple_allowed" BOOLEAN NOT NULL DEFAULT false,
    "validated_by" UUID,
    "note" TEXT,
    "device_hash" TEXT,
    "ip_address" INET,
    "checked_in_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valid_method" CHECK ("method" IN ('STAFF_SCAN','MANUAL')),
    CONSTRAINT "valid_attendance_status" CHECK ("status" IN ('APPROVED','REJECTED')),
    CONSTRAINT "manual_requires_note"
      CHECK ("method" <> 'MANUAL' OR ("note" IS NOT NULL AND length(trim("note")) > 0))
);

-- CreateTable
-- Artículo IV: libro mayor de solo inserción. UPDATE/DELETE prohibidos por
-- el trigger forbid_ledger_mutation más abajo.
CREATE TABLE "point_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "activity_id" UUID,
    "attendance_id" UUID,
    "reverses_id" UUID,
    "reason" TEXT,
    "created_by" UUID,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "non_zero" CHECK ("points" <> 0),
    CONSTRAINT "valid_type" CHECK ("type" IN ('ACTIVITY','BONUS','PENALTY','ADJUSTMENT','REVERSAL')),
    CONSTRAINT "reversal_has_target" CHECK ("type" <> 'REVERSAL' OR "reverses_id" IS NOT NULL),
    CONSTRAINT "manual_types_need_reason"
      CHECK ("type" NOT IN ('BONUS','PENALTY','ADJUSTMENT','REVERSAL')
             OR ("reason" IS NOT NULL AND length(trim("reason")) > 0))
);

-- AlterTable
ALTER TABLE "student_profiles"
  ADD CONSTRAINT "total_points_non_negative" CHECK ("total_points" >= 0);

-- CreateIndex
CREATE UNIQUE INDEX "activity_categories_name_key" ON "activity_categories"("name");

-- CreateIndex
CREATE INDEX "activities_status_starts_at_idx" ON "activities"("status", "starts_at" DESC);

-- CreateIndex
-- RF-315: una asistencia viva por alumno y actividad, salvo que la
-- actividad admita registros múltiples.
CREATE UNIQUE INDEX "one_attendance_per_activity"
  ON "attendances" ("activity_id", "student_id")
  WHERE "status" <> 'REJECTED' AND NOT "multiple_allowed";

-- CreateIndex
CREATE INDEX "attendances_student_id_checked_in_at_idx" ON "attendances"("student_id", "checked_in_at" DESC);

-- CreateIndex
-- RF-322 (deuda técnica, sin umbral fijo): sostiene la consulta manual del
-- admin sobre patrones de dispositivo.
CREATE INDEX "attendances_device_hash_checked_in_at_idx" ON "attendances"("device_hash", "checked_in_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_attendance_id_key" ON "point_transactions"("attendance_id");

-- CreateIndex
-- Impide revertir dos veces el mismo movimiento -- RF-326.
CREATE UNIQUE INDEX "point_transactions_reverses_id_key" ON "point_transactions"("reverses_id");

-- CreateIndex
-- RF-317: un reintento con la misma clave choca acá, no produce un segundo
-- abono. Formato: checkin:{activityId}:{studentId}.
CREATE UNIQUE INDEX "point_transactions_idempotency_key_key" ON "point_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "point_transactions_student_id_created_at_idx" ON "point_transactions"("student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "point_transactions_activity_id_idx" ON "point_transactions"("activity_id");

-- CreateIndex
CREATE INDEX "student_profiles_total_points_idx" ON "student_profiles"("total_points" DESC);

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "activity_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_staff" ADD CONSTRAINT "activity_staff_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_staff" ADD CONSTRAINT "activity_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_staff" ADD CONSTRAINT "activity_staff_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "point_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Artículo IV: el ledger es de solo inserción. Ningún UPDATE/DELETE, ni
-- siquiera uno "bien intencionado" desde una consola de administración.
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'point_transactions es de solo inserción (Artículo IV)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_point_transactions
  BEFORE UPDATE OR DELETE ON point_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- Defensa en profundidad -- ver nota: HOY es efectivamente decorativa. El
-- rol "ted" es dueño de las tablas (las crea vía prisma migrate), y en
-- Postgres el dueño de una tabla se salta cualquier GRANT/REVOKE sobre esa
-- misma tabla. La protección real mientras exista un único rol de Postgres
-- para migrar y para correr la app es el trigger de arriba. Separar un
-- segundo rol de aplicación sin ownership queda documentado como deuda
-- técnica en docs/progress.md, fuera de alcance de 003-a.
REVOKE UPDATE, DELETE ON point_transactions FROM ted;
