# Modelo de datos: Sitio público TEDxUCB

**Feature:** `002-sitio-publico`
**Motor:** PostgreSQL 15+

Este documento contiene el detalle del esquema. Las entidades de identidad
(`users`) pertenecen a `001` y aquí solo se referencian.

---

## 1. Evento

```sql
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  tagline     TEXT,
  starts_at   TIMESTAMPTZ NOT NULL,
  venue       TEXT,
  capacity    INTEGER,
  image_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'DRAFT',
  updated_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('DRAFT','PUBLISHED')),
  CONSTRAINT capacity_positive CHECK (capacity IS NULL OR capacity > 0)
);

-- Solo un evento publicado a la vez: mismo idioma que
-- one_active_consent_version en 001. El endpoint público lee esta fila.
CREATE UNIQUE INDEX one_published_event
  ON events (status) WHERE status = 'PUBLISHED';
```

Puntos de diseño:

- **No se modela como historial de ediciones.** El spec solo pide que el
  admin pueda cambiar la fecha del evento actual (caso límite "se cancela o
  reprograma"), nunca gestionar varias ediciones a la vez. Construir eso
  ahora sería el future-proofing que prohíbe el Artículo VII: si en el futuro
  hay una segunda edición de TEDxUCB, se reabre con spec y ADR propios.
- **`image_url`** — RF-218 (Open Graph): campo que faltaba en el diseño
  original de la entidad (ver `plan.md`).
- **`one_published_event`** es lo que hace posible que
  `GET /api/v1/public/event` sea una consulta directa sin ambigüedad: existe
  como máximo una fila con `status = 'PUBLISHED'`.
- **Sin `ends_at`.** El spec habla de "fecha y hora" en singular; RF-205
  (estado posterior al evento) se deriva comparando `starts_at` contra la
  hora del servidor, no contra una ventana de duración que nadie pidió.

## 2. Bloques de contenido

```sql
CREATE TABLE content_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  title       TEXT,
  body        TEXT NOT NULL,
  updated_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT key_format CHECK (key ~ '^[a-z0-9_]+$'),
  CONSTRAINT body_not_blank CHECK (length(trim(body)) > 0)
);
```

- **Sin `status`/publicación.** A diferencia de `Speaker`, un bloque de
  contenido no tiene estado borrador — el admin edita directamente el texto
  que ya es público (RF-203). Modelar un estado de publicación aquí sería
  construir el mecanismo de revisión de un CMS genérico, explícitamente
  descartado.
- **`key_format`** traslada al motor la idea de "clave estable, no una
  página arbitraria": un slug `snake_case`, no cualquier cadena. No es un
  `CHECK IN (...)` con la lista cerrada de claves — esa lista es una
  decisión de producto/frontend (qué secciones existen), no una restricción
  de esquema; cada sección nueva de todas formas exige una pieza de UI nueva
  en el frontend, así que el control real ya vive ahí.
- **Sin versionado** — ver la fila correspondiente en `plan.md`.

## 3. Speakers

```sql
CREATE TABLE speakers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  headline        TEXT,
  bio             TEXT,
  talk_title      TEXT,
  photo_url       TEXT,
  photo_alt_text  TEXT,
  display_order   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('DRAFT','PUBLISHED')),
  CONSTRAINT full_name_not_blank CHECK (length(trim(full_name)) > 0),
  -- RF-206 + RF-217: una ficha publicada no puede estar incompleta ni
  -- carecer de texto alternativo. Mismo criterio que manual_requires_note
  -- en 003: un descuido del servicio no debe poder dejar publicada una
  -- tarjeta rota.
  CONSTRAINT published_speaker_is_complete CHECK (
    status <> 'PUBLISHED' OR (
      headline       IS NOT NULL AND length(trim(headline))   > 0 AND
      bio            IS NOT NULL AND length(trim(bio))        > 0 AND
      talk_title     IS NOT NULL AND length(trim(talk_title)) > 0 AND
      photo_url      IS NOT NULL AND
      photo_alt_text IS NOT NULL AND length(trim(photo_alt_text)) > 0
    )
  )
);

CREATE INDEX idx_speakers_order ON speakers (status, display_order);
```

- **`display_order`** sin restricción de unicidad: RF-209 solo pide que el
  admin pueda definir el orden, no que sea una secuencia sin huecos. La
  reordenación reescribe los valores de la lista completa en una sola
  transacción; empates se resuelven por `created_at` en la consulta pública.
- **Un solo índice, sin partición `WHERE status = 'PUBLISHED'`.** A
  diferencia de `attendances` en `003` (miles de filas), esta tabla tendrá
  como mucho unas pocas decenas de filas para una sola edición del evento —
  particionar el índice sería complejidad sin beneficio medible.
- **Sin `DELETE`.** El caso límite es explícito: un speaker se despublica
  (`status = 'DRAFT'`), nunca se borra. No existe endpoint de eliminación.

## 4. Postulaciones de speaker

```sql
CREATE TABLE speaker_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             TEXT NOT NULL,
  email                 TEXT NOT NULL,
  affiliation           TEXT NOT NULL,
  expertise_area        TEXT NOT NULL,
  idea_title            TEXT NOT NULL,
  idea_summary          TEXT NOT NULL,
  evidence_basis        TEXT NOT NULL,
  applicability         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'PENDING',
  internal_notes        TEXT,
  reviewed_by           UUID REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  converted_speaker_id  UUID UNIQUE REFERENCES speakers(id),
  ip_address            INET,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (
    status IN ('PENDING','ACCEPTED','REJECTED','NOT_TED_FORMAT','CONVERTED')
  ),
  -- El estado y el enlace de conversión se mueven juntos, siempre.
  CONSTRAINT converted_consistency CHECK (
    (status = 'CONVERTED') = (converted_speaker_id IS NOT NULL)
  ),
  -- Toda resolución (aceptar, rechazar, marcar fuera de formato, convertir)
  -- deja constancia de quién y cuándo -- Artículo V.
  CONSTRAINT reviewed_needs_reviewer CHECK (
    status = 'PENDING' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

-- RF-214, caso límite de duplicados: agrupar por correo sin distinguir
-- mayúsculas.
CREATE INDEX idx_speaker_applications_email
  ON speaker_applications (lower(email));

CREATE INDEX idx_speaker_applications_status_created
  ON speaker_applications (status, created_at DESC);
```

- **`NOT_TED_FORMAT` como estado hermano de `REJECTED`**, no una razón de
  texto libre sobre `REJECTED` — ver `plan.md` para el porqué (CE-202 se
  alimenta de poder contar cuántas llegan así).
- **Sin unicidad de `email`.** El caso límite lo exige explícitamente: no se
  bloquea una segunda postulación del mismo correo. El índice sobre
  `lower(email)` existe solo para que el panel pueda agrupar/contar
  eficientemente, no para restringir.
- **`converted_speaker_id UNIQUE`** — impide que dos conversiones
  concurrentes sobre la misma postulación produzcan dos speakers. Es la
  misma razón por la que `003` usa `reverses_id UNIQUE` en
  `point_transactions`: la restricción de base de datos gana la carrera que
  un `SELECT` previo en el servicio perdería.
- **`ip_address`** — mismo campo forense que `attendances.ip_address` en
  `003`, insumo para ajustar el rate limit si aparece abuso real.

## 5. Relaciones

```
events (singleton operativo, seeded)         content_blocks (clave -> texto)
   status = PUBLISHED (único, índice parcial)     sin relación con otras tablas

speaker_applications --(converted_speaker_id, 0..1)--> speakers
        |                                                    ^
        +-- reviewed_by --------------------------> users (001)  +-- created_by --> users (001)
```

`events` y `content_blocks` no tienen relación entre sí ni con
`speakers`/`speaker_applications` — son dominios independientes, lo que
confirma que la separación en dos módulos (`content`/`speakers`) también
tiene sentido a nivel de esquema, no solo de organización de carpetas.

## 6. Datos semilla

**Evento — sí hace falta sembrarlo, con la fecha real.** A diferencia de las
categorías de actividad de `003` (bloqueadas: no hay ningún dato real
todavía), aquí sí existe un dato real conocido: el evento es el 9 de
noviembre. La Historia 2 completa (cuenta regresiva) no se puede demostrar
sin al menos una fila `PUBLISHED`. Semilla propuesta:

```sql
INSERT INTO events (name, tagline, starts_at, venue, status)
VALUES (
  'TEDxUCB',
  NULL,  -- lema pendiente de copywriting, el admin lo completa por PATCH
  '2026-11-09T14:00:00-04:00',  -- 10:00 hora La Paz -- PLACEHOLDER, hora
                                  -- exacta pendiente de confirmar con el
                                  -- responsable del evento
  NULL,  -- sede pendiente de confirmar
  'PUBLISHED'
);
```

La hora exacta y la sede son placeholders verosímiles, marcados como tales.
El propio mecanismo que RF-203/RF-204 existen para habilitar —edición sin
desplegar código— es lo que permite corregirlos en cuanto se confirmen, sin
bloquear el resto del desarrollo ni las pruebas.

**Bloques de contenido — se siembra al menos uno, con texto real del propio
`spec.md`, no inventado:**

```sql
INSERT INTO content_blocks (key, title, body)
VALUES (
  'linea_tematica',
  'Nuestra línea temática',
  'La línea temática es la Sostenibilidad en sentido amplio y sistémico -- '
  'viabilidad, equilibrio, gobernanza y permanencia a largo plazo --, '
  'abordada desde el área de expertise de cada disciplina: economía, '
  'ciencias, arte, gestión del talento, infraestructura.'
);
```

**Speakers — deliberadamente NINGUNO.** La Historia 3 empieza vacía a
propósito ("aún no tenemos speakers confirmados"). Sembrar un speaker de
prueba en el ambiente real contradiría el propio escenario del spec; los
datos de un speaker de prueba viven únicamente en las pruebas de integración
(ver Grupo de pruebas en `tasks.md`), nunca en el seed de producción.

**Postulaciones — ninguna.** Son datos generados por visitantes reales desde
el día del lanzamiento.
