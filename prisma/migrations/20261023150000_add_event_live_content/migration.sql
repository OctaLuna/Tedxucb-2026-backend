ALTER TABLE "event_program_items"
  ADD CONSTRAINT "event_program_items_id_event_id_key" UNIQUE ("id", "event_id");

CREATE TABLE "event_live_settings" (
  "event_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "manual_activity_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_live_settings_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "event_live_settings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "event_live_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "agenda_slot_id" UUID,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "activation_mode" TEXT NOT NULL DEFAULT 'schedule',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "quiz_enabled" BOOLEAN NOT NULL DEFAULT false,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_live_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_live_activities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_live_activities_agenda_slot_id_event_id_fkey" FOREIGN KEY ("agenda_slot_id", "event_id") REFERENCES "event_program_items"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_live_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_live_activities_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_live_activities_id_event_id_key" UNIQUE ("id", "event_id"),
  CONSTRAINT "event_live_activities_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "event_live_activities_time_range_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "event_live_activities_activation_mode_check" CHECK ("activation_mode" IN ('schedule', 'active', 'inactive')),
  CONSTRAINT "event_live_activities_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
  CONSTRAINT "event_live_activities_display_order_check" CHECK ("display_order" >= 0)
);

CREATE INDEX "event_live_activities_event_id_status_starts_at_idx" ON "event_live_activities"("event_id", "status", "starts_at");
CREATE INDEX "event_live_activities_event_id_display_order_starts_at_idx" ON "event_live_activities"("event_id", "display_order", "starts_at");

ALTER TABLE "event_live_settings"
  ADD CONSTRAINT "event_live_settings_manual_activity_event_fkey"
  FOREIGN KEY ("manual_activity_id", "event_id") REFERENCES "event_live_activities"("id", "event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "event_live_quiz_questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "activity_id" UUID NOT NULL,
  "correct_option_id" UUID,
  "prompt" TEXT NOT NULL,
  "time_limit_seconds" INTEGER NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "event_live_quiz_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_live_quiz_questions_id_event_id_key" UNIQUE ("id", "event_id"),
  CONSTRAINT "event_live_quiz_questions_correct_option_id_id_key" UNIQUE ("correct_option_id", "id"),
  CONSTRAINT "event_live_quiz_questions_activity_event_fkey" FOREIGN KEY ("activity_id", "event_id") REFERENCES "event_live_activities"("id", "event_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_live_quiz_questions_prompt_check" CHECK (length(btrim("prompt")) > 0),
  CONSTRAINT "event_live_quiz_questions_time_limit_check" CHECK ("time_limit_seconds" BETWEEN 5 AND 120),
  CONSTRAINT "event_live_quiz_questions_points_check" CHECK ("points" >= 0),
  CONSTRAINT "event_live_quiz_questions_display_order_check" CHECK ("display_order" >= 0)
);

CREATE INDEX "event_live_quiz_questions_activity_id_display_order_idx" ON "event_live_quiz_questions"("activity_id", "display_order");

CREATE TABLE "event_live_quiz_options" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "text" TEXT NOT NULL,
  CONSTRAINT "event_live_quiz_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_live_quiz_options_id_question_id_key" UNIQUE ("id", "question_id"),
  CONSTRAINT "event_live_quiz_options_question_event_fkey" FOREIGN KEY ("question_id", "event_id") REFERENCES "event_live_quiz_questions"("id", "event_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_live_quiz_options_text_check" CHECK (length(btrim("text")) > 0)
);

CREATE INDEX "event_live_quiz_options_question_id_idx" ON "event_live_quiz_options"("question_id");

ALTER TABLE "event_live_quiz_questions"
  ADD CONSTRAINT "event_live_quiz_questions_correct_option_fkey"
  FOREIGN KEY ("correct_option_id", "id") REFERENCES "event_live_quiz_options"("id", "question_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "event_live_media" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "activity_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "cover_url" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "event_live_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_live_media_activity_event_fkey" FOREIGN KEY ("activity_id", "event_id") REFERENCES "event_live_activities"("id", "event_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_live_media_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "event_live_media_kind_check" CHECK ("kind" IN ('image', 'video', 'resource')),
  CONSTRAINT "event_live_media_url_check" CHECK ("url" LIKE 'https://%'),
  CONSTRAINT "event_live_media_cover_url_check" CHECK ("cover_url" IS NULL OR "cover_url" LIKE 'https://%'),
  CONSTRAINT "event_live_media_display_order_check" CHECK ("display_order" >= 0)
);

CREATE INDEX "event_live_media_activity_id_display_order_idx" ON "event_live_media"("activity_id", "display_order");
