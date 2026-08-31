# SPEC — TEDxUCB · Plataforma web y backend

**Proyecto:** TEDxUCB — Universidad Católica Boliviana "San Pablo", Sede La Paz
**Fecha del evento:** 9 de noviembre
**Versión del documento:** 1.0
**Estado:** Especificación aprobada para inicio de desarrollo

---

## Tabla de contenidos

1. [Propósito del proyecto](#1-propósito-del-proyecto)
2. [Alcance](#2-alcance)
3. [Glosario](#3-glosario)
4. [Roles y permisos](#4-roles-y-permisos)
5. [Funcionalidades](#5-funcionalidades)
6. [Decisiones técnicas](#6-decisiones-técnicas)
7. [Modelo de datos](#7-modelo-de-datos)
8. [Reglas de negocio](#8-reglas-de-negocio)
9. [Sistema de puntos y anti-fraude](#9-sistema-de-puntos-y-anti-fraude)
10. [Asignación de cupos del evento](#10-asignación-de-cupos-del-evento)
11. [Arquitectura del backend](#11-arquitectura-del-backend)
12. [API — Endpoints](#12-api--endpoints)
13. [Seguridad](#13-seguridad)
14. [Trabajos en segundo plano](#14-trabajos-en-segundo-plano)
15. [Requisitos no funcionales](#15-requisitos-no-funcionales)
16. [Fases de entrega](#16-fases-de-entrega)
17. [Criterios de aceptación](#17-criterios-de-aceptación)
18. [Decisiones pendientes](#18-decisiones-pendientes)

---

## 1. Propósito del proyecto

La Universidad Católica Boliviana "San Pablo", Sede La Paz, está diseñando **TEDxUCB**, un espacio para visibilizar el pensamiento crítico y las ideas de vanguardia de su comunidad.

La línea temática central es la **Sostenibilidad**, entendida en su sentido más amplio y sistémico: no limitada a lo ecológico, sino como el desafío de construir viabilidad, equilibrio, gobernanza y permanencia a largo plazo, analizada desde el área de expertise de cada disciplina (economía, ciencias, arte, gestión del talento, infraestructura, etc.).

El formato TED se rige bajo la premisa de **"hablar a la cabeza, no al corazón"**. No se buscan discursos de autoayuda, anécdotas puramente personales ni mensajes de motivación, sino la transferencia de ideas conceptuales, basadas en evidencia, investigación y aplicabilidad real, que desafíen los paradigmas actuales.

Este documento especifica **un sistema con dos caras** que comparten infraestructura:

| | Sitio público | Plataforma interna |
|---|---|---|
| **Para quién** | Comunidad UCB y público general | Alumnos, staff y organización |
| **Qué hace** | Comunica la temática, presenta speakers, muestra la cuenta atrás y recibe postulaciones | Registra participación en actividades, otorga puntos y determina quiénes acceden al evento |
| **Objetivo** | Posicionar el evento y captar speakers | Asignar de forma justa, trazable y auditable los cupos limitados |

**El problema central que resuelve la plataforma interna:** el auditorio tiene capacidad para **100 personas**, de las cuales **80 son alumnos**. La demanda es mayor que la oferta. La solución adoptada es un sistema de méritos: los alumnos acumulan puntos participando en actividades previas, y los cupos se asignan según ese puntaje. Para que ese sistema sea legítimo, cada punto debe ser **verificable, trazable y reversible**.

### Referencias de estilo

Sitios con contenido similar al buscado, usados como guía: `tedxsitges.com`, `tedxsurco.com`.

---

## 2. Alcance

### Dentro del alcance

- Sitio público con sección de temática, sección de speakers y cuenta atrás ("save the date").
- Formulario público para que perfiles destacados expresen su interés en participar como speakers.
- Perfiles de alumnos con avatar, historial de actividades y puntaje.
- Panel de administración para crear usuarios, definir actividades y monitorear el progreso de todos los alumnos.
- Registro de participación mediante QR con validación por staff.
- Motor de puntos con historial auditable e irreversible.
- Ranking y proceso de asignación de los 80 cupos estudiantiles, con lista de espera.
- Ticket de ingreso al evento y control de acceso en puerta.
- Notificaciones por correo electrónico.
- Exportación de reportes en CSV/XLSX.

### Fuera del alcance (v1)

- Pagos o venta de entradas.
- Aplicación móvil nativa (el escaneo se hace desde el navegador del dispositivo del staff).
- Streaming o publicación de video de las charlas.
- Integración con el sistema académico de la UCB (los alumnos se cargan por CSV o alta manual).
- Multi-idioma (el sitio será solo en español; el modelo de datos deja la puerta abierta).

---

## 3. Glosario

| Término | Significado |
|---|---|
| **Actividad** | Evento previo al TEDxUCB (taller, conferencia, feria, voluntariado) que otorga puntos a quien participa. |
| **Check-in** | Registro validado de que un alumno participó en una actividad. |
| **Ledger de puntos** | Tabla de solo-inserción que registra cada movimiento de puntos. Es la única fuente de verdad del puntaje. |
| **Reversión** | Transacción negativa que anula una anterior sin borrarla, dejando ambas en el historial. |
| **Snapshot** | Fotografía congelada del puntaje y la posición de un alumno en el momento del corte. |
| **Cupo (seat)** | Asiento del evento asignado a una persona concreta. |
| **Crew / Staff** | Persona autorizada a validar la participación de alumnos en una actividad concreta. |

---

## 4. Roles y permisos

Se definen **tres roles**. El rol de coordinador queda fusionado dentro de ADMIN: no existe separación entre quien administra el sistema y quien monitorea a los alumnos.

| Rol | Descripción |
|---|---|
| `ADMIN` | Control total. Crea y edita usuarios de cualquier tipo (incluidos alumnos y staff), define actividades y su valor en puntos, asigna staff a actividades, monitorea el progreso de todos los alumnos, corrige y revierte puntos, configura el evento, ejecuta la asignación de cupos, gestiona el contenido público y revisa las postulaciones de speakers. Accede a la auditoría completa. |
| `STAFF` | Valida la participación de alumnos en las actividades que tiene asignadas. Escanea el QR del alumno, ve la lista de asistencia de su actividad y puede registrar asistencia manual con justificación obligatoria. **No** puede crear usuarios, definir actividades, alterar el valor en puntos ni ver el ranking global. |
| `ALUMNO` | Ve su propio perfil, avatar, historial de actividades, puntaje acumulado y su posición en el ranking. Genera su QR personal. Confirma o rechaza su cupo si resulta seleccionado. |

### Modelo de asignación

La relación entre usuarios y roles es **muchos-a-muchos**, no un campo único. Motivo: un alumno destacado puede actuar como staff en una actividad concreta sin perder su condición de alumno ni su puntaje. Un ADMIN puede además ser staff de una actividad puntual.

### Matriz de permisos

| Acción | ADMIN | STAFF | ALUMNO |
|---|:---:|:---:|:---:|
| Crear/editar usuarios | ✅ | ❌ | ❌ |
| Importar alumnos por CSV | ✅ | ❌ | ❌ |
| Crear/editar actividades | ✅ | ❌ | ❌ |
| Asignar staff a una actividad | ✅ | ❌ | ❌ |
| Hacer check-in de un alumno | ✅ | ✅ (solo su actividad) | ❌ |
| Ver asistencia de una actividad | ✅ | ✅ (solo su actividad) | ❌ |
| Ajustar puntos manualmente | ✅ | ❌ | ❌ |
| Revertir una transacción | ✅ | ❌ | ❌ |
| Ver ranking global | ✅ | ❌ | ✅ (solo posición y top público) |
| Ver progreso de cualquier alumno | ✅ | ❌ | ❌ |
| Ejecutar asignación de cupos | ✅ | ❌ | ❌ |
| Confirmar cupo propio | ❌ | ❌ | ✅ |
| Control de acceso en puerta | ✅ | ✅ | ❌ |
| Editar contenido público y speakers | ✅ | ❌ | ❌ |
| Revisar postulaciones de speakers | ✅ | ❌ | ❌ |
| Ver logs de auditoría | ✅ | ❌ | ❌ |

---

## 5. Funcionalidades

### 5.1 Sitio público

**F-01 · Sección de temática.** Página que explica qué es TEDx, qué es TEDxUCB y desarrolla la línea temática de Sostenibilidad en su sentido sistémico. El contenido es editable por ADMIN sin tocar código, mediante bloques de contenido almacenados en base de datos.

**F-02 · Sección de speakers.** Grilla con fotografía, nombre, titular breve, reseña y título de la charla de cada speaker. Cada speaker tiene un indicador de publicación: mientras no haya confirmados, la sección puede mostrar un estado "Próximamente" sin necesidad de desplegar código nuevo. Orden configurable.

**F-03 · Save the date / cuenta atrás.** Contador regresivo hasta la fecha y hora del evento. El backend expone la fecha en UTC y el frontend renderiza el contador; nunca se depende del reloj del cliente para determinar el estado del evento.

**F-04 · Postulación de speakers.** Formulario público donde los perfiles invitados expresan su interés. Los campos están redactados deliberadamente para filtrar lo que el formato TED descarta: se pide **idea conceptual, base de evidencia y aplicabilidad**, no trayectoria emotiva ni anécdota personal. Protegido con captcha y límite de envíos.

**F-05 · Información general del evento.** Fecha, sede, agenda resumida y enlaces institucionales.

### 5.2 Perfiles y usuarios

**F-06 · Perfil de alumno.** Cada alumno tiene avatar (subida de imagen con recorte y límite de tamaño), nombre, carrera, semestre, código de registro y biografía breve.

**F-07 · Historial de actividades.** El alumno ve la lista cronológica de todas las actividades en las que participó, con fecha, puntos obtenidos y quién validó su participación. Incluye ajustes y reversiones, con su motivo visible.

**F-08 · Progreso y puntaje.** El alumno ve su puntaje total, su posición en el ranking y —si el ADMIN lo habilita— cuántos puntos lo separan del corte de los 80 cupos.

**F-09 · QR personal.** El alumno genera desde su perfil un código QR con token firmado y de vida corta que el staff escanea para registrarlo.

**F-10 · Alta de usuarios.** El ADMIN crea perfiles de alumnos y de staff, individualmente o por importación masiva desde CSV. El usuario creado recibe una invitación por correo para definir su contraseña.

**F-11 · Panel de monitoreo.** Vista para ADMIN con el listado completo de alumnos, filtros por carrera, facultad y rango de puntos, orden por puntaje, y acceso al detalle de progreso individual de cada uno.

### 5.3 Actividades y participación

**F-12 · Gestión de actividades.** El ADMIN crea actividades con título, descripción, categoría, lugar, fecha de inicio y fin, ventana de check-in, cupo máximo y **valor en puntos**. Las actividades pasan por estados: borrador → publicada → cerrada.

**F-13 · Asignación de staff.** El ADMIN designa qué usuarios con rol STAFF pueden validar cada actividad. Un staff solo puede registrar asistencia en las actividades que tiene asignadas.

**F-14 · Check-in por QR.** El staff escanea el QR del alumno desde su dispositivo. El sistema valida el token, la ventana horaria, el permiso del staff y la no-duplicación, registra la asistencia y **carga los puntos automáticamente al perfil del alumno** en la misma transacción.

**F-15 · Check-in manual.** Si el celular del alumno falla, el staff puede registrarlo buscándolo por nombre o código. Requiere **nota justificativa obligatoria** y queda marcado como manual en el historial y la auditoría.

**F-16 · Corrección de puntos.** El ADMIN puede otorgar bonos, aplicar penalizaciones o revertir una carga errónea. Toda corrección exige motivo y queda registrada. Nunca se borra el registro original.

### 5.4 Evento y cupos

**F-17 · Ranking.** Listado ordenado por puntaje, con desempate determinista, filtrable por carrera y facultad.

**F-18 · Asignación de cupos.** Proceso explícito disparado por el ADMIN que congela el ranking, asigna los 80 cupos estudiantiles y arma la lista de espera, guardando el puntaje y la posición de cada seleccionado en ese instante.

**F-19 · Invitación y confirmación.** Los seleccionados reciben un correo con fecha límite para confirmar. Quien no confirma libera su cupo y el sistema promueve automáticamente al primero de la lista de espera.

**F-20 · Ticket y control de acceso.** Cada cupo confirmado genera un código único. El día del evento, el staff lo escanea en puerta y el sistema marca la asistencia real.

### 5.5 Transversales

**F-21 · Notificaciones.** Correo al ganar puntos (configurable), al ser seleccionado, al recibir la invitación, al acercarse el deadline de confirmación y al ser promovido desde la lista de espera.

**F-22 · Reportes.** Exportación en CSV/XLSX de alumnos, asistencia por actividad, ranking y lista final de asistentes.

**F-23 · Auditoría.** Registro inmutable de toda acción sensible: creación de usuarios, cambios en el valor de actividades, ajustes y reversiones de puntos, y ejecución de la asignación de cupos.

---

## 6. Decisiones técnicas

| Componente | Elección | Justificación |
|---|---|---|
| Lenguaje | TypeScript | Un solo lenguaje en todo el equipo si el frontend es React/Next. |
| Framework | NestJS | Trae de fábrica guards para control de roles, validación por DTO e inyección de dependencias — exactamente lo que este dominio necesita. Estructura modular impuesta, lo que evita que el proyecto se desordene con varios desarrolladores. |
| Base de datos | PostgreSQL 15+ | Transacciones ACID reales, índices parciales, restricciones a nivel de motor y tipos como `JSONB`, `CITEXT` e `INET`. La integridad del puntaje no puede depender solo del código de aplicación. |
| ORM | Prisma | Migraciones versionadas, tipado end-to-end y buena ergonomía en transacciones. |
| Autenticación | JWT de acceso corto + refresh token rotativo en base de datos | Permite revocar sesiones, algo imposible con JWT puro. |
| Hash de contraseñas | Argon2id | Estándar actual recomendado. |
| Colas y jobs | BullMQ + Redis | Envío de correos, expiración de invitaciones y reconciliación nocturna sin bloquear las peticiones. |
| Almacenamiento de imágenes | S3 compatible o Cloudinary | Avatares y fotos de speakers nunca en el sistema de archivos del servidor. |
| Arquitectura | Monolito modular | El proyecto tiene una fecha fija y un equipo acotado. Microservicios serían sobreingeniería; la modularidad interna deja la puerta abierta si algún día hace falta separar. |
| Documentación de API | OpenAPI/Swagger autogenerado | Contrato vivo para el equipo de frontend. |

---

## 7. Modelo de datos

### 7.1 Identidad y perfiles

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT,                            -- null si el alta aún no fue aceptada
  full_name       TEXT NOT NULL,
  avatar_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'INVITED', -- INVITED | ACTIVE | DISABLED
  last_login_at   TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  code  TEXT PRIMARY KEY,          -- ADMIN | STAFF | ALUMNO
  name  TEXT NOT NULL
);

CREATE TABLE user_roles (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  role_code TEXT REFERENCES roles(code),
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_code)
);

CREATE TABLE faculties (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE careers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  name       TEXT NOT NULL,
  UNIQUE (faculty_id, name)
);

CREATE TABLE student_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  student_code  TEXT UNIQUE NOT NULL,      -- registro/matrícula UCB
  career_id     UUID REFERENCES careers(id),
  semester      SMALLINT,
  bio           TEXT,
  qr_secret     TEXT NOT NULL,             -- semilla para firmar su QR personal
  total_points  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT total_points_non_negative CHECK (total_points >= 0)
);

CREATE INDEX idx_student_points ON student_profiles (total_points DESC);
CREATE INDEX idx_student_career ON student_profiles (career_id);
```

> **Nota sobre `total_points`:** es una **caché derivada**, no la fuente de verdad. La fuente de verdad es `point_transactions`. Esto permite recalcular el puntaje completo desde cero ante cualquier inconsistencia, y es lo que hace el sistema auditable.

```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.2 Actividades y participación

```sql
CREATE TABLE activity_categories (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE,       -- Taller, Conferencia, Voluntariado, Feria...
  color TEXT
);

CREATE TABLE activities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID REFERENCES activity_categories(id),
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  points_value      INTEGER NOT NULL CHECK (points_value > 0),
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  checkin_opens_at  TIMESTAMPTZ,
  checkin_closes_at TIMESTAMPTZ,
  capacity          INTEGER,
  allow_multiple_checkins BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | PUBLISHED | CLOSED | CANCELLED
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_window CHECK (ends_at > starts_at)
);

CREATE INDEX idx_activities_status_date ON activities (status, starts_at DESC);

-- Qué staff puede validar en qué actividad
CREATE TABLE activity_staff (
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id)
);

CREATE TABLE attendances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID NOT NULL REFERENCES activities(id),
  student_id    UUID NOT NULL REFERENCES student_profiles(user_id),
  method        TEXT NOT NULL,                     -- STAFF_SCAN | STUDENT_SCAN | MANUAL
  status        TEXT NOT NULL DEFAULT 'APPROVED',  -- PENDING | APPROVED | REJECTED
  validated_by  UUID REFERENCES users(id),
  note          TEXT,                              -- obligatoria si method = MANUAL
  device_hash   TEXT,
  ip_address    INET,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Impide doble carga de puntos por la misma actividad
CREATE UNIQUE INDEX one_attendance_per_activity
  ON attendances (activity_id, student_id)
  WHERE status <> 'REJECTED';

CREATE INDEX idx_attendance_student ON attendances (student_id, checked_in_at DESC);
CREATE INDEX idx_attendance_device ON attendances (device_hash, checked_in_at DESC);
```

### 7.3 Ledger de puntos

Es el núcleo del sistema. Tabla **append-only**: nunca se ejecuta `UPDATE` ni `DELETE` sobre ella.

```sql
CREATE TABLE point_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES student_profiles(user_id),
  points          INTEGER NOT NULL,   -- positivo o negativo, nunca cero
  type            TEXT NOT NULL,      -- ACTIVITY | BONUS | PENALTY | ADJUSTMENT | REVERSAL
  activity_id     UUID REFERENCES activities(id),
  attendance_id   UUID UNIQUE REFERENCES attendances(id),
  reverses_id     UUID REFERENCES point_transactions(id),
  reason          TEXT,
  created_by      UUID REFERENCES users(id),  -- null si fue automático
  idempotency_key TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT non_zero CHECK (points <> 0)
);

CREATE INDEX idx_points_student ON point_transactions (student_id, created_at DESC);
CREATE INDEX idx_points_activity ON point_transactions (activity_id);
```

**Por qué esta forma:**

- **Append-only.** Si el staff se equivocó, se inserta una transacción `REVERSAL` con puntos negativos que apunta a la original mediante `reverses_id`. El historial del alumno queda completo y explicable; nunca hay un puntaje que cambió "solo".
- **`idempotency_key`** mata el problema clásico del QR: el celular pierde señal, el alumno vuelve a escanear y se le cargan los puntos dos veces. La clave tiene la forma `attendance:{activity_id}:{student_id}`. El índice único la bloquea a nivel de motor.
- La inserción de la transacción y la actualización de `student_profiles.total_points` ocurren en la **misma transacción de base de datos**, con `SELECT ... FOR UPDATE` sobre la fila del alumno.

### 7.4 Evento y cupos

```sql
CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,     -- 'tedxucb-2026'
  name         TEXT NOT NULL,
  tagline      TEXT,
  starts_at    TIMESTAMPTZ NOT NULL,     -- alimenta la cuenta atrás pública
  ends_at      TIMESTAMPTZ,
  venue        TEXT,
  total_seats  INTEGER NOT NULL,         -- 100
  is_published BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE seat_quotas (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,      -- ALUMNO | DOCENTE | INVITADO | STAFF
  seats    INTEGER NOT NULL,   -- 80 para ALUMNO
  PRIMARY KEY (event_id, audience)
);

CREATE TABLE event_seats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  audience         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'SELECTED',
    -- SELECTED | INVITED | CONFIRMED | DECLINED | WAITLIST | EXPIRED | ATTENDED
  points_snapshot  INTEGER,
  rank_snapshot    INTEGER,
  waitlist_position INTEGER,
  ticket_code      TEXT UNIQUE,
  invited_at       TIMESTAMPTZ,
  confirm_deadline TIMESTAMPTZ,
  confirmed_at     TIMESTAMPTZ,
  checked_in_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_seats_status ON event_seats (event_id, status);
```

El snapshot es clave: cuando alguien reclame *"yo tenía más puntos que fulano"*, existe el número exacto congelado en el momento del corte.

### 7.5 Contenido público

```sql
CREATE TABLE speakers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID REFERENCES events(id),
  full_name     TEXT NOT NULL,
  headline      TEXT,             -- "Economista, investigadora en energía"
  bio           TEXT,
  photo_url     TEXT,
  talk_title    TEXT,
  socials       JSONB DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_published  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE speaker_applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID REFERENCES events(id),
  full_name      TEXT NOT NULL,
  email          CITEXT NOT NULL,
  phone          TEXT,
  affiliation    TEXT,            -- carrera, unidad académica, empresa
  expertise_area TEXT NOT NULL,   -- economía, ciencias, arte, infraestructura...
  idea_title     TEXT NOT NULL,
  idea_abstract  TEXT NOT NULL,   -- la idea conceptual (límite de caracteres)
  evidence_base  TEXT,            -- investigación o evidencia que la respalda
  applicability  TEXT,            -- aplicabilidad real de la idea
  links          JSONB,           -- LinkedIn, CV, charla previa
  status         TEXT NOT NULL DEFAULT 'RECEIVED',
    -- RECEIVED | REVIEWING | SHORTLISTED | REJECTED | ACCEPTED
  reviewer_notes TEXT,
  reviewed_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE content_blocks (
  key        TEXT PRIMARY KEY,    -- 'theme.hero', 'theme.body', 'about.tedx'
  locale     TEXT NOT NULL DEFAULT 'es',
  content    JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Los campos del formulario de postulación están redactados a propósito para filtrar lo que el formato TED descarta: piden **idea, evidencia y aplicabilidad**, no historia personal ni mensaje motivacional.

### 7.6 Auditoría

```sql
CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   UUID REFERENCES users(id),
  action     TEXT NOT NULL,   -- POINTS_REVERSED | USER_CREATED | SEAT_ALLOCATED | ...
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  diff       JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_logs (entity, entity_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at DESC);
```

### 7.7 Diagrama de relaciones

```
faculties ──< careers ──< student_profiles ──1:1── users ──< user_roles >── roles
                                │                    │
                                │                    ├──< activity_staff >── activities
                                │                    ├──< refresh_tokens
                                │                    ├──< invitations
                                │                    └──< event_seats >── events ──< seat_quotas
                                │
                                ├──< attendances >── activities ──> activity_categories
                                │        │
                                │        └──1:1── point_transactions
                                └──< point_transactions ──> point_transactions (reverses_id)

events ──< speakers
events ──< speaker_applications
content_blocks (independiente)
audit_logs ──> users
```

---

## 8. Reglas de negocio

**RN-01.** El puntaje de un alumno es siempre igual a la suma de sus transacciones en el ledger. `total_points` es una caché y debe coincidir; un job nocturno verifica esta igualdad.

**RN-02.** Ningún servicio, salvo el módulo de puntos, escribe en `student_profiles.total_points`.

**RN-03.** Una transacción de puntos nunca se modifica ni se borra. Los errores se corrigen con una transacción `REVERSAL`.

**RN-04.** Un alumno solo puede recibir puntos una vez por actividad, salvo que la actividad tenga `allow_multiple_checkins = true`.

**RN-05.** Un check-in solo es válido dentro de la ventana `checkin_opens_at` → `checkin_closes_at` y con la actividad en estado `PUBLISHED`.

**RN-06.** Un staff solo puede validar en actividades donde figure en `activity_staff`.

**RN-07.** El check-in manual exige nota justificativa. Sin nota, la petición se rechaza.

**RN-08.** El puntaje nunca puede quedar negativo. Una penalización que llevaría el total por debajo de cero se trunca a cero y se registra la observación.

**RN-09.** Modificar `points_value` de una actividad **no** recalcula retroactivamente los puntos ya otorgados. Los puntos ya cargados quedan tal cual; el nuevo valor aplica solo a check-ins futuros.

**RN-10.** Una actividad con asistencias registradas no puede eliminarse, solo cancelarse (`CANCELLED`). Cancelar una actividad ofrece al ADMIN revertir en bloque los puntos que otorgó.

**RN-11.** Un usuario deshabilitado (`DISABLED`) conserva su historial y su puntaje, pero queda excluido del ranking y de la asignación de cupos.

**RN-12.** La asignación de cupos solo puede ejecutarse una vez por evento salvo que el ADMIN la revierta explícitamente, acción que queda auditada.

**RN-13.** Un cupo confirmado no puede reasignarse automáticamente. Solo la expiración o el rechazo liberan un cupo.

**RN-14.** El ticket de ingreso es de un solo uso: un segundo escaneo del mismo código devuelve error y muestra la hora del primer ingreso.

---

## 9. Sistema de puntos y anti-fraude

El riesgo principal de este proyecto no es técnico sino social: hay 80 cupos, la demanda los supera y habrá intentos de inflar puntos. El diseño asume eso desde el inicio.

### 9.1 Modelo de escaneo

**Modelo A — El staff escanea al alumno (adoptado como principal).**

Cada alumno tiene en su perfil un QR que contiene un token firmado con su `qr_secret`, con `student_id` y marca temporal, **válido ~60 segundos y rotando en pantalla**. El staff abre la actividad en su dispositivo autenticado y escanea.

Ventajas: el dispositivo que otorga puntos está autenticado y es de confianza; una captura de pantalla del QR no sirve porque expira; queda registrado quién validó a quién.

**Modelo B — El alumno escanea un QR del lugar (opcional, para actividades masivas).**

Más rápido con grupos grandes, pero un QR estático se fotografía y circula por WhatsApp en treinta segundos. Solo es viable con **QR rotativo proyectado en pantalla** (token que cambia cada 30 segundos) y ventana de check-in cerrada. Se implementa como opción secundaria configurable por actividad.

### 9.2 Capas de protección

Independientes del modelo de escaneo:

1. Ventana horaria de check-in acotada por actividad.
2. Índice único en base de datos que impide dos asistencias aprobadas del mismo alumno en la misma actividad.
3. `idempotency_key` en el ledger que impide la doble carga ante reintentos de red.
4. Registro de `device_hash` e `ip_address` en cada check-in, con alerta cuando un mismo dispositivo registra a más de N alumnos distintos en un intervalo corto.
5. Modo manual disponible pero marcado, con nota obligatoria y visible en auditoría.
6. Rate limiting por alumno y por dispositivo.
7. Todos los tokens de QR firmados con HMAC y verificados en el servidor; el cliente nunca decide si un token es válido.

### 9.3 Flujo del check-in

Todo ocurre dentro de una sola transacción de base de datos:

```
1. Validar el token del QR (firma HMAC + ventana temporal)
2. Verificar que el staff esté asignado a esa actividad (activity_staff)
3. Verificar estado PUBLISHED y ventana de check-in abierta
4. INSERT en attendances
   └─ si viola el índice único → HTTP 409 devolviendo el registro previo
5. INSERT en point_transactions con idempotency_key
6. SELECT ... FOR UPDATE sobre student_profiles + UPDATE de total_points
7. COMMIT
8. Encolar notificación al alumno (fuera de la transacción)
```

Respuesta al staff: nombre y foto del alumno, puntos otorgados y nuevo total. Confirmación visual inmediata, porque el escaneo ocurre con una fila de gente esperando.

### 9.4 Reconciliación

Un job nocturno compara, para cada alumno, `SUM(point_transactions.points)` contra `student_profiles.total_points`. Si difieren, corrige la caché y emite una alerta. Es barato de escribir y evita un desastre silencioso.

---

## 10. Asignación de cupos del evento

El proceso es explícito y ejecutado por el ADMIN, no una consulta calculada en vivo.

### 10.1 Pasos

1. **Corte.** El ADMIN dispara la asignación con una fecha límite. El ranking se congela en ese instante.
2. **Ranking.** Orden por `total_points DESC`. **Criterio de desempate:** la fecha de la transacción con la que el alumno alcanzó ese puntaje (gana quien llegó antes). El desempate importa mucho: con 80 cupos, un empate en el puesto 80 es prácticamente seguro.
3. **Asignación.** Top 80 → estado `SELECTED`. Los siguientes ~20 → `WAITLIST` con posición numerada. Se guarda `points_snapshot` y `rank_snapshot` de cada uno.
4. **Invitación.** Correo automático con fecha límite de confirmación (48–72 horas configurables). Estado → `INVITED`.
5. **Confirmación.** El alumno confirma desde su perfil → `CONFIRMED` y se genera `ticket_code`. Si rechaza → `DECLINED`.
6. **Expiración.** Un job marca `EXPIRED` a quien no confirmó a tiempo, libera el cupo y promueve automáticamente al primero de la lista de espera, enviándole su invitación.
7. **Ingreso.** El día del evento el staff escanea el `ticket_code` en puerta → `ATTENDED`.

### 10.2 Consulta de ranking (referencia)

```sql
SELECT
  sp.user_id,
  u.full_name,
  c.name AS career,
  sp.total_points,
  RANK() OVER (
    ORDER BY sp.total_points DESC,
             (SELECT MAX(pt.created_at)
                FROM point_transactions pt
               WHERE pt.student_id = sp.user_id) ASC
  ) AS position
FROM student_profiles sp
JOIN users u ON u.id = sp.user_id
LEFT JOIN careers c ON c.id = sp.career_id
WHERE u.status = 'ACTIVE'
ORDER BY position;
```

---

## 11. Arquitectura del backend

Monolito modular en NestJS.

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── guards/           # JwtAuthGuard, RolesGuard, ActivityStaffGuard
│   ├── decorators/       # @Roles(), @CurrentUser(), @Public()
│   ├── interceptors/     # logging, transformación de respuesta, auditoría
│   ├── filters/          # manejo global de excepciones
│   └── pipes/            # validación de DTOs
├── config/               # variables de entorno tipadas y validadas al arrancar
├── modules/
│   ├── auth/             # login, refresh, recuperación, aceptación de invitación
│   ├── users/            # CRUD, alta de alumnos y staff, asignación de roles
│   ├── students/         # perfil, avatar, historial, progreso
│   ├── catalog/          # facultades, carreras, categorías de actividad
│   ├── activities/       # CRUD, publicación, asignación de staff, QR de sesión
│   ├── attendance/       # check-in, validación, correcciones
│   ├── points/           # ledger, reversiones, ajustes, saldo
│   ├── leaderboard/      # ranking, filtros, snapshots
│   ├── events/           # evento, cupos, asignación, tickets, lista de espera
│   ├── public/           # speakers, cuenta atrás, contenido, postulaciones
│   ├── notifications/    # correo y plantillas
│   ├── storage/          # subida de avatares y fotos
│   ├── reports/          # exportación CSV/XLSX
│   └── audit/            # registro de acciones sensibles
├── jobs/                 # BullMQ: correos, expiración de cupos, reconciliación
└── database/
    ├── schema.prisma
    ├── migrations/
    └── seeds/            # roles, facultades, carreras UCB, categorías, admin inicial
```

Cada módulo sigue la misma estructura interna: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`, `entities/`.

---

## 12. API — Endpoints

Prefijo: `/api/v1`

### Autenticación

```
POST   /auth/login                          público
POST   /auth/refresh                        público (con refresh token)
POST   /auth/logout                         autenticado
POST   /auth/forgot-password                público
POST   /auth/reset-password                 público (con token)
POST   /auth/accept-invitation              público (con token de invitación)
```

### Perfil propio

```
GET    /me                                  autenticado
PATCH  /me                                  autenticado
PATCH  /me/avatar                           alumno
GET    /me/points?page=&limit=              alumno · historial paginado
GET    /me/progress                         alumno · total, posición, distancia al corte
GET    /me/qr                               alumno · token rotativo firmado
GET    /me/seat                             alumno · estado de su cupo
POST   /me/seat/confirm                     alumno
POST   /me/seat/decline                     alumno
```

### Usuarios (ADMIN)

```
POST   /users
GET    /users?role=&q=&page=
GET    /users/:id
PATCH  /users/:id
POST   /users/:id/roles
DELETE /users/:id/roles/:code
POST   /users/:id/disable
POST   /users/:id/resend-invitation
POST   /users/bulk-import                   CSV de alumnos
```

### Alumnos y monitoreo (ADMIN)

```
GET    /students?career=&faculty=&q=&sort=points&page=
GET    /students/:id
GET    /students/:id/progress               historial completo + resumen
GET    /students/:id/attendances
```

### Catálogo (ADMIN)

```
GET    /faculties          ·  POST /faculties
GET    /careers            ·  POST /careers
GET    /activity-categories ·  POST /activity-categories
```

### Actividades

```
POST   /activities                          admin
GET    /activities?status=&from=&to=        autenticado
GET    /activities/:id                      autenticado
PATCH  /activities/:id                      admin
POST   /activities/:id/publish              admin
POST   /activities/:id/close                admin
POST   /activities/:id/cancel               admin
POST   /activities/:id/staff                admin
DELETE /activities/:id/staff/:userId        admin
GET    /activities/mine                     staff · sus actividades asignadas
GET    /activities/:id/session-qr           staff · QR rotativo del lugar
POST   /activities/:id/checkin              staff · núcleo del sistema
POST   /activities/:id/checkin/manual       staff · requiere nota
GET    /activities/:id/attendances          staff (propia), admin
PATCH  /attendances/:id/reject              admin
```

### Puntos (ADMIN)

```
POST   /points/adjustments                  bono, penalización o ajuste con motivo
POST   /points/:txId/reverse                reversión
GET    /points/student/:studentId
```

### Ranking

```
GET    /leaderboard?limit=&career=&faculty=  autenticado
GET    /leaderboard/public?limit=            público (opcional, solo top N)
```

### Evento y cupos (ADMIN)

```
POST   /events                              ·  PATCH /events/:id
GET    /events/:id
POST   /events/:id/quotas
POST   /events/:id/allocate-seats            ejecuta la selección
POST   /events/:id/send-invitations
GET    /events/:id/seats?status=
POST   /events/:id/seats                     alta manual (docentes, invitados)
POST   /events/:id/seats/:seatId/promote     promover desde lista de espera
POST   /events/:id/checkin                   staff · control de acceso en puerta
```

### Público (sin autenticación)

```
GET    /public/event                        datos del evento y fecha para la cuenta atrás
GET    /public/speakers                     solo los publicados
GET    /public/content/:key                 bloques de contenido de la sección temática
POST   /public/speaker-applications         formulario · rate limit + captcha
```

### Postulaciones (ADMIN)

```
GET    /speaker-applications?status=&page=
GET    /speaker-applications/:id
PATCH  /speaker-applications/:id            cambio de estado y notas
POST   /speaker-applications/:id/promote    convierte la postulación en speaker
```

### Speakers y contenido (ADMIN)

```
POST   /speakers  ·  PATCH /speakers/:id  ·  DELETE /speakers/:id
POST   /speakers/:id/photo
POST   /speakers/reorder
PUT    /content/:key
```

### Reportes (ADMIN)

```
GET    /reports/students.csv
GET    /reports/activities/:id/attendance.csv
GET    /reports/leaderboard.csv
GET    /reports/events/:id/attendees.csv
```

### Auditoría (ADMIN)

```
GET    /audit?entity=&actor=&from=&to=&page=
```

### Convenciones de respuesta

- Errores con formato uniforme: `{ statusCode, error, message, details? }`.
- Paginación uniforme: `{ data: [], meta: { page, limit, total, totalPages } }`.
- Todas las fechas en ISO 8601 con zona UTC.
- `409 Conflict` para duplicados de check-in, devolviendo el registro existente.

---

## 13. Seguridad

- **Contraseñas** con Argon2id. Nunca almacenamiento en texto plano ni algoritmos propios.
- **JWT de acceso de 15 minutos** + refresh token rotativo persistido y revocable. Rotación en cada uso; reutilización de un token ya usado revoca toda la familia de tokens de ese usuario.
- **RBAC** aplicado por guards en cada controlador, no por comprobaciones dispersas en la lógica.
- **Validación estricta de DTOs** en toda entrada, con lista blanca de campos.
- **Rate limiting diferenciado**: el endpoint público de postulaciones es el que va a recibir spam; el de check-in es el que se va a saturar el día de la actividad. Límites distintos para cada uno.
- **Captcha** en el formulario público de postulación.
- **Tokens de QR firmados con HMAC**, con vida corta y verificación exclusivamente en el servidor.
- **CORS** restringido a los dominios del frontend.
- **Cabeceras de seguridad** vía Helmet.
- **Secretos** solo por variables de entorno, validadas al arrancar la aplicación. Nada de credenciales en el repositorio.
- **Subida de archivos** con validación de tipo MIME real, límite de tamaño y renombrado en el servidor.
- **Datos personales**: los alumnos son identificables; el acceso al listado completo y a los reportes está restringido a ADMIN y queda auditado.
- **Backups** diarios automáticos de la base de datos, con retención mínima de 30 días. Restauración probada antes del evento.

---

## 14. Trabajos en segundo plano

| Job | Frecuencia | Descripción |
|---|---|---|
| `send-email` | Bajo demanda | Envío de correos desde cola, con reintentos. |
| `expire-seat-invitations` | Cada 15 min | Marca `EXPIRED` los cupos no confirmados y promueve la lista de espera. |
| `reconcile-points` | Diario (nocturno) | Compara la suma del ledger contra `total_points` y alerta ante discrepancias. |
| `close-activities` | Cada hora | Cierra automáticamente las actividades cuya ventana de check-in ya venció. |
| `confirmation-reminder` | Diario | Recuerda a los invitados que su plazo de confirmación está por vencer. |
| `daily-digest` | Diario | Resumen para ADMIN: check-ins del día, actividades próximas, alertas de fraude. |

---

## 15. Requisitos no funcionales

- **Rendimiento del check-in:** respuesta bajo 500 ms en el percentil 95. Es la operación más sensible: se ejecuta con una fila de estudiantes esperando.
- **Concurrencia:** el sistema debe soportar picos de escaneo simultáneo al inicio de una actividad masiva.
- **Disponibilidad:** foco en las ventanas de actividades y en el día del evento.
- **Trazabilidad:** toda modificación de puntos debe poder explicarse a partir del ledger, sin excepción.
- **Portabilidad de la interfaz de staff:** debe funcionar desde el navegador de un celular de gama media, con conexión inestable. Se contempla comportamiento degradado y reintento seguro gracias a la idempotencia.
- **Zona horaria:** almacenamiento en UTC, presentación en `America/La_Paz`.
- **Observabilidad:** logs estructurados con identificador de petición, y monitoreo de errores.

---

## 16. Fases de entrega

**Fase 1 — Cimientos.** Esquema de base de datos, migraciones, seeds, autenticación, roles y CRUD de usuarios. Alta de alumnos individual y por CSV.

**Fase 2 — Sitio público.** Evento, cuenta atrás, bloques de contenido de la temática, speakers y formulario de postulación. Es lo que puede publicarse primero y da presencia al proyecto mientras el resto se construye.

**Fase 3 — Motor de puntos.** Actividades, asignación de staff, ledger, check-in por QR, check-in manual, ajustes y reversiones. Perfil de alumno con historial y progreso.

**Fase 4 — Monitoreo y ranking.** Panel de ADMIN, filtros, reportes y exportaciones.

**Fase 5 — Cupos.** Asignación, invitaciones, confirmación, lista de espera, tickets y control de acceso.

**Fase 6 — Endurecimiento.** Anti-fraude avanzado, reconciliación, notificaciones completas, pruebas de carga sobre el check-in y ensayo general antes del 9 de noviembre.

---

## 17. Criterios de aceptación

- Un ADMIN puede crear un alumno, y ese alumno recibe una invitación y define su contraseña.
- Un ADMIN puede crear una actividad con valor en puntos y asignarle staff.
- Un staff escanea el QR de un alumno y los puntos aparecen en el perfil del alumno de forma inmediata y automática.
- Escanear dos veces al mismo alumno en la misma actividad no duplica los puntos y devuelve un error claro.
- Un QR capturado en pantalla y usado un minuto después es rechazado.
- Un alumno ve su puntaje, su historial completo con motivos y su posición en el ranking.
- Un ADMIN revierte una carga errónea y el historial muestra tanto la carga original como su reversión.
- La suma del ledger de cualquier alumno coincide exactamente con su `total_points`.
- El ADMIN ejecuta la asignación y el sistema produce 80 seleccionados y una lista de espera ordenada, con snapshots guardados.
- Un seleccionado que no confirma en plazo libera su cupo y el siguiente en lista de espera recibe su invitación automáticamente.
- El sitio público muestra la temática, los speakers publicados y una cuenta atrás correcta hacia el 9 de noviembre.
- Un visitante envía una postulación de speaker y esta aparece en el panel del ADMIN.
- Un ticket escaneado dos veces en puerta es rechazado la segunda vez.

---

## 18. Decisiones pendientes

Puntos que requieren definición del equipo organizador antes o durante el desarrollo:

1. **Cuota por carrera o facultad.** Un ranking puramente por puntos puede terminar con la mayoría de los 80 cupos concentrados en una sola carrera, lo cual contradice el espíritu interdisciplinario del evento. ¿Se reserva un mínimo por facultad?

2. **Visibilidad del ranking.** ¿Cada alumno ve solo su posición, o hay un ranking público visible para todos? Un ranking público motiva, pero también expone y puede generar fricción.

3. **Catálogo de actividades y su valor.** Qué actividades otorgan puntos y cuántos. Conviene definir una escala coherente desde el inicio (por ejemplo, asistencia a taller = 10, voluntariado = 25) para evitar inflación posterior.

4. **Autenticación institucional.** ¿Los alumnos entran con correo y contraseña propios, o se integra el correo institucional de la UCB mediante Google Workspace?

5. **Fecha de corte.** Cuándo se congela el ranking y se asignan los cupos. Debe haber margen suficiente entre el corte y el 9 de noviembre para gestionar confirmaciones y lista de espera.

6. **Los otros 20 cupos.** ¿Son invitados, docentes y organización asignados manualmente por el ADMIN, o alguna parte también se disputa por puntos?

7. **Origen de los datos de alumnos.** ¿Existe un padrón institucional exportable, o el ADMIN cargará el CSV manualmente?
