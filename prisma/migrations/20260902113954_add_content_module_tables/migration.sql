-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "venue" TEXT,
    "capacity" INTEGER,
    "image_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "valid_status" CHECK ("status" IN ('DRAFT','PUBLISHED')),
    CONSTRAINT "capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0)
);

-- CreateTable
CREATE TABLE "content_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "key_format" CHECK ("key" ~ '^[a-z0-9_]+$'),
    CONSTRAINT "body_not_blank" CHECK (length(trim("body")) > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "content_blocks_key_key" ON "content_blocks"("key");

-- Solo un evento publicado a la vez -- mismo idioma que
-- one_active_consent_version (001) y one_pending_correction_per_student_field.
-- GET /public/event depende de esta garantía para no tener ambigüedad
-- sobre "el" evento vigente.
CREATE UNIQUE INDEX "one_published_event" ON "events" ("status") WHERE "status" = 'PUBLISHED';

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
