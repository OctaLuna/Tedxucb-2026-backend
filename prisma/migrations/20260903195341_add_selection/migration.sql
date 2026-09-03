-- AlterTable
ALTER TABLE "events" ADD COLUMN     "student_capacity" INTEGER;

ALTER TABLE "events"
  ADD CONSTRAINT "student_capacity_positive" CHECK ("student_capacity" IS NULL OR "student_capacity" > 0),
  ADD CONSTRAINT "student_capacity_within_total"
    CHECK ("student_capacity" IS NULL OR "capacity" IS NULL OR "student_capacity" <= "capacity");

-- CreateTable
CREATE TABLE "selection_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "executed_by" UUID NOT NULL,
    "student_capacity_snapshot" INTEGER NOT NULL,
    "executed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverted_by" UUID,
    "reverted_at" TIMESTAMPTZ,
    "revert_reason" TEXT,

    CONSTRAINT "selection_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "snapshot_positive" CHECK ("student_capacity_snapshot" > 0),
    CONSTRAINT "revert_needs_reason"
      CHECK ("reverted_at" IS NULL OR ("revert_reason" IS NOT NULL AND length(trim("revert_reason")) > 0))
);

-- CreateTable
CREATE TABLE "selections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID,
    "source" TEXT NOT NULL,
    "student_id" UUID,
    "audience_type" TEXT NOT NULL DEFAULT 'ESTUDIANTE',
    "full_name" TEXT,
    "email" TEXT,
    "points_at_selection" INTEGER,
    "rank_at_selection" INTEGER,
    "assigned_by" UUID,
    "reason" TEXT,
    "entry_code" TEXT NOT NULL,
    "entry_used_at" TIMESTAMPTZ,
    "entry_validated_by" UUID,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by" UUID,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valid_source" CHECK ("source" IN ('RANKING', 'MANUAL')),
    CONSTRAINT "ranking_has_run" CHECK ("source" <> 'RANKING' OR "run_id" IS NOT NULL),
    CONSTRAINT "ranking_has_snapshot"
      CHECK ("source" <> 'RANKING'
             OR ("student_id" IS NOT NULL AND "points_at_selection" IS NOT NULL AND "rank_at_selection" IS NOT NULL)),
    CONSTRAINT "manual_needs_reason"
      CHECK ("source" <> 'MANUAL'
             OR ("assigned_by" IS NOT NULL AND "reason" IS NOT NULL AND length(trim("reason")) > 0)),
    CONSTRAINT "contact_present"
      CHECK ("student_id" IS NOT NULL OR ("full_name" IS NOT NULL AND "email" IS NOT NULL)),
    CONSTRAINT "revoked_needs_reason"
      CHECK ("revoked_at" IS NULL OR ("revoked_reason" IS NOT NULL AND length(trim("revoked_reason")) > 0))
);

-- CreateIndex
CREATE UNIQUE INDEX "selections_entry_code_key" ON "selections"("entry_code");

-- CreateIndex
CREATE INDEX "selections_run_id_idx" ON "selections"("run_id");

-- CreateIndex
CREATE INDEX "selections_student_id_idx" ON "selections"("student_id");

-- RF-408: no se puede ejecutar la selección dos veces sobre el mismo
-- evento sin revertir la anterior -- mismo lenguaje que ya usa
-- one_published_event (002) para "una fila viva a la vez".
CREATE UNIQUE INDEX "one_active_selection_run_per_event"
  ON "selection_runs" ("event_id")
  WHERE "reverted_at" IS NULL;

-- Un alumno no puede tener dos selecciones vivas a la vez (protege contra
-- una asignación manual duplicando a alguien que ya entró por ranking).
CREATE UNIQUE INDEX "one_active_selection_per_student"
  ON "selections" ("student_id")
  WHERE "revoked_at" IS NULL AND "student_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "selection_runs" ADD CONSTRAINT "selection_runs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_runs" ADD CONSTRAINT "selection_runs_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_runs" ADD CONSTRAINT "selection_runs_reverted_by_fkey" FOREIGN KEY ("reverted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "selection_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_entry_validated_by_fkey" FOREIGN KEY ("entry_validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
