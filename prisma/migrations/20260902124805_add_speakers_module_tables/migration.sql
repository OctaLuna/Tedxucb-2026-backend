-- CreateTable
CREATE TABLE "speakers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "talk_title" TEXT,
    "photo_url" TEXT,
    "photo_alt_text" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speakers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valid_status" CHECK ("status" IN ('DRAFT','PUBLISHED')),
    CONSTRAINT "full_name_not_blank" CHECK (length(trim("full_name")) > 0),
    CONSTRAINT "published_speaker_is_complete" CHECK (
      "status" <> 'PUBLISHED' OR (
        "headline" IS NOT NULL AND length(trim("headline")) > 0 AND
        "bio" IS NOT NULL AND length(trim("bio")) > 0 AND
        "talk_title" IS NOT NULL AND length(trim("talk_title")) > 0 AND
        "photo_url" IS NOT NULL AND
        "photo_alt_text" IS NOT NULL AND length(trim("photo_alt_text")) > 0
      )
    )
);

-- CreateTable
CREATE TABLE "speaker_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "affiliation" TEXT NOT NULL,
    "expertise_area" TEXT NOT NULL,
    "idea_title" TEXT NOT NULL,
    "idea_summary" TEXT NOT NULL,
    "evidence_basis" TEXT NOT NULL,
    "applicability" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "internal_notes" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "converted_speaker_id" UUID,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speaker_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valid_status" CHECK ("status" IN ('PENDING','ACCEPTED','REJECTED','NOT_TED_FORMAT','CONVERTED')),
    CONSTRAINT "converted_consistency" CHECK (("status" = 'CONVERTED') = ("converted_speaker_id" IS NOT NULL)),
    CONSTRAINT "reviewed_needs_reviewer" CHECK ("status" = 'PENDING' OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "speaker_applications_converted_speaker_id_key" ON "speaker_applications"("converted_speaker_id");

-- RF-209: orden de aparición pública, filtrado por estado.
CREATE INDEX "idx_speakers_order" ON "speakers" ("status", "display_order");

-- Caso límite de duplicados (RF-214): agrupar por correo sin distinguir mayúsculas.
CREATE INDEX "idx_speaker_applications_email" ON "speaker_applications" (lower("email"));

CREATE INDEX "idx_speaker_applications_status_created" ON "speaker_applications" ("status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker_applications" ADD CONSTRAINT "speaker_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker_applications" ADD CONSTRAINT "speaker_applications_converted_speaker_id_fkey" FOREIGN KEY ("converted_speaker_id") REFERENCES "speakers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
