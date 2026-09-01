-- CreateTable
CREATE TABLE "faculties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "faculty_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "careers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "student_code" TEXT NOT NULL,
    "career_id" UUID NOT NULL,
    "academic_period" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "avatar_url" TEXT,
    "id_document_url" TEXT,
    "bio" TEXT,
    "interests" TEXT[],
    "accessibility_needs" TEXT,
    "professional_link" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "student_code_not_blank" CHECK (length(trim("student_code")) > 0)
);

-- CreateTable
CREATE TABLE "consent_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_acceptances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "consent_version_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable: no estaba en data-model.md de 001-a (vacio ahi) -- lo exige
-- el contrato usuarios-y-roles.md. Disenado ahora, documentado como desvio
-- en docs/progress.md.
CREATE TABLE "correction_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valid_correction_field" CHECK ("field" IN ('studentCode','careerId','email')),
    CONSTRAINT "valid_correction_status" CHECK ("status" IN ('PENDING','RESOLVED','REJECTED')),
    CONSTRAINT "resolved_needs_resolver" CHECK ("status" = 'PENDING' OR ("resolved_by" IS NOT NULL AND "resolved_at" IS NOT NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "faculties_name_key" ON "faculties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "careers_faculty_id_name_key" ON "careers"("faculty_id", "name");
CREATE INDEX "idx_careers_faculty" ON "careers"("faculty_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_student_code_key" ON "student_profiles"("student_code");
CREATE INDEX "idx_student_profiles_career" ON "student_profiles"("career_id");

-- CreateIndex
CREATE UNIQUE INDEX "consent_versions_version_key" ON "consent_versions"("version");
-- Solo una version activa a la vez: publicar una nueva debe desactivar la
-- anterior en la misma transaccion.
CREATE UNIQUE INDEX "one_active_consent_version" ON "consent_versions" ("is_active") WHERE "is_active";

-- CreateIndex
CREATE UNIQUE INDEX "consent_acceptances_student_id_consent_version_id_key" ON "consent_acceptances"("student_id", "consent_version_id");

-- CreateIndex
CREATE INDEX "idx_correction_requests_status" ON "correction_requests"("status");
-- Evita que un alumno acumule varias solicitudes pendientes para el mismo
-- campo mientras espera respuesta (mismo patron que one_open_claim_per_activity
-- en 003).
CREATE UNIQUE INDEX "one_pending_correction_per_student_field" ON "correction_requests" ("student_id", "field") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "careers" ADD CONSTRAINT "careers_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_acceptances" ADD CONSTRAINT "consent_acceptances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_acceptances" ADD CONSTRAINT "consent_acceptances_consent_version_id_fkey" FOREIGN KEY ("consent_version_id") REFERENCES "consent_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex (cosmetico: alinea con la convencion @unique de Prisma, no cambia comportamiento)
ALTER INDEX "idx_auth_tokens_hash" RENAME TO "auth_tokens_token_hash_key";
ALTER INDEX "idx_refresh_tokens_hash" RENAME TO "refresh_tokens_token_hash_key";
