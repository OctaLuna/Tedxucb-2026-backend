-- Initial public program imported from the official schedule supplied for
-- Nov 9-13, 2026. Imported content has no human editor attribution; future
-- changes made through the admin API continue to record created_by.
ALTER TABLE "event_program_items" ALTER COLUMN "created_by" DROP NOT NULL;

WITH target_event AS (
  SELECT "id" FROM "events" WHERE "slug" = 'innovation-week'
), schedule("day", "start_time", "end_time", "title", "description", "type") AS (
  VALUES
    (9, '09:00', '10:30', 'IISEC-OBSA', NULL, 'OTHER'),
    (9, '10:45', '12:15', 'Debate Economía', NULL, 'TALK'),
    (9, '12:15', '14:30', 'Taller USEI', NULL, 'OTHER'),
    (9, '14:15', '15:45', 'Informe socio-ambiental', NULL, 'TALK'),
    (9, '16:00', '17:30', 'Revista LAJED', NULL, 'TALK'),
    (9, '17:45', '19:00', 'Desarrollo sostenible, tecnología espacial y ciencia de datos — Carlos Méndez; presentación de beca MEXT, Universidad de Nagoya', NULL, 'TALK'),
    (10, '09:00', '10:30', 'Sociedad Científica CPA-ICO', NULL, 'OTHER'),
    (10, '10:45', '12:15', 'Presentación Revista Motivus — Sociedad Científica ADM-IIE', NULL, 'TALK'),
    (10, '12:15', '14:30', 'Taller USEI', NULL, 'OTHER'),
    (10, '14:15', '15:45', 'Estructuración de procesos de internacionalización corporativa — profesor visitante', NULL, 'TALK'),
    (10, '16:00', '17:30', 'Branding y e-commerce para comercio internacional — profesor visitante', NULL, 'TALK'),
    (10, '17:45', '19:00', 'Taller investigación: Primero investigar, después proponer — ADM-IIE', NULL, 'OTHER'),
    (11, '09:00', '10:30', 'Experiencia de los estudiantes en el IISEC', NULL, 'TALK'),
    (11, '10:45', '12:15', 'Social media y marketing internacional — profesor visitante', NULL, 'TALK'),
    (11, '12:15', '14:30', 'Taller USEI', NULL, 'OTHER'),
    (11, '14:15', '15:45', 'Taller investigación — CPA, Livia López (estudiantes)', NULL, 'OTHER'),
    (11, '16:00', '17:30', '“Abrir el paper”. Colaboración y aprendizaje en la construcción de un artículo científico — ADM-IIE', NULL, 'TALK'),
    (11, '17:45', '19:00', 'Sociología aplicada a la empresa — profesor visitante', NULL, 'TALK'),
    (12, '09:00', '10:30', 'Sociedad Científica - ECO', NULL, 'OTHER'),
    (12, '14:15', '15:45', 'TEDxUCB', NULL, 'TALK'),
    (13, '09:00', '10:30', 'Tutorización de trabajos de grado bajo un enfoque internacional', NULL, 'TALK'),
    (13, '14:15', '15:45', 'Intercambio de herramientas pedagógicas', NULL, 'TALK'),
    (9, '09:00', '19:00', 'Actividad central: Debate Economía', 'Actividad central del día.', 'OTHER'),
    (10, '09:00', '19:00', 'Actividad central: Expo Marketing', 'Actividad central durante todo el día.', 'OTHER'),
    (11, '09:00', '19:00', 'Actividad central: Fintech', 'Actividad central durante todo el día.', 'OTHER'),
    (12, '09:00', '19:00', 'Actividad central: TEDxUCB', 'Actividad central del día.', 'OTHER')
), ranked AS (
  SELECT *, row_number() OVER (ORDER BY "day", "start_time", "title") - 1 AS position
  FROM schedule
)
INSERT INTO "event_program_items"
  ("event_id", "created_by", "title", "description", "type", "starts_at", "ends_at", "display_order", "status")
SELECT e."id", NULL, r."title", r."description", r."type",
       make_timestamptz(2026, 11, r."day", split_part(r."start_time", ':', 1)::int,
         split_part(r."start_time", ':', 2)::int, 0, 'America/La_Paz'),
       make_timestamptz(2026, 11, r."day", split_part(r."end_time", ':', 1)::int,
         split_part(r."end_time", ':', 2)::int, 0, 'America/La_Paz'),
       r."position"::int, 'PUBLISHED'
FROM target_event e CROSS JOIN ranked r;
