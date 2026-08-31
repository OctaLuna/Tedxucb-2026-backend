# Modelo de datos: Identidad, usuarios y perfiles

**Feature:** `001-identidad-y-usuarios`
**Motor:** PostgreSQL 15+

Este documento contiene el detalle del esquema. `003-motor-de-puntos` agrega
`student_profiles.total_points` mediante `ALTER TABLE` (ver su
`data-model.md` §6) — esa columna **no** se declara aquí para no adelantarse
a esa feature ni duplicar su definición.

---

## 0. Extensión requerida

```sql
CREATE EXTENSION IF NOT EXISTS citext;
```

Necesaria para `users.email`: comparación insensible a mayúsculas de forma
nativa, sin depender de que cada consulta futura recuerde aplicar `LOWER()`.
Sostiene RF-106: dos alumnos no pueden crear cuentas "distintas" escribiendo
el mismo correo con distinta capitalización.

## 1. Usuarios y roles

```sql
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               CITEXT NOT NULL UNIQUE,
  password_hash       TEXT,
  full_name           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING',
  registration_source TEXT NOT NULL,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_status
    CHECK (status IN ('INVITED','PENDING','ACTIVE','DISABLED','REJECTED')),
  CONSTRAINT valid_registration_source
    CHECK (registration_source IN ('SELF_REGISTRATION','ADMIN_CREATED')),
  CONSTRAINT self_registration_never_invited
    CHECK (registration_source <> 'SELF_REGISTRATION' OR status <> 'INVITED'),
  CONSTRAINT admin_created_never_pending_or_rejected
    CHECK (registration_source <> 'ADMIN_CREATED' OR status NOT IN ('PENDING','REJECTED')),
  CONSTRAINT password_required_unless_invited
    CHECK (status = 'INVITED' OR password_hash IS NOT NULL)
);

CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_created_by ON users (created_by);
```

Puntos de diseño:

- **`registration_source` distingue las dos puertas de entrada** (RF-104 vs
  RF-104a). `self_registration_never_invited` y
  `admin_created_never_pending_or_rejected` codifican en el motor que un
  alumno auto-registrado nunca pasa por el estado `INVITED` (ese es el camino
  del staff) y que una cuenta dada de alta por el administrador nunca queda
  `PENDING` ni `REJECTED` (esos estados son del flujo de revisión de
  auto-registro, RF-126).
- **`password_required_unless_invited`** traslada al motor la regla de que
  toda cuenta que no está esperando aceptar una invitación debe poder
  autenticarse. Un descuido del código de aplicación que cree un usuario
  `ACTIVE` sin contraseña queda rechazado por la base, no solo por disciplina.
- **`created_by`** referencia a sí misma: `NULL` para auto-registro, el `id`
  del administrador para alta manual. Sostiene RF-117 (auditoría) a nivel de
  dato, además de la entrada correspondiente en `audit_log`.

```sql
CREATE TABLE user_roles (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  granted_by  UUID REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role),
  CONSTRAINT valid_role CHECK (role IN ('ADMIN','STAFF','ALUMNO'))
);

CREATE INDEX idx_user_roles_role ON user_roles (role);
```

Relación real N:M, no una etiqueta: la clave primaria compuesta permite que un
usuario tenga varias filas (RF-101, RF-102) sin restricción que lo impida.
`granted_by`/`granted_at` dan trazabilidad de quién otorgó cada rol, en
complemento de `audit_log`.

**RF-119 — nunca sin administrador activo.** No es una restricción estática:
depende de contar filas relacionadas en el momento de la operación, así que
se implementa con triggers, igual que el trigger de inmutabilidad del libro
mayor en `003`.

```sql
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
      'No se puede retirar el rol de administrador: el sistema quedaría sin ningún administrador activo (RF-119)';
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
        'No se puede deshabilitar: es el único administrador activo (RF-119)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_disable_last_admin
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION forbid_disabling_last_admin();
```

Dos triggers porque son dos operaciones distintas que pueden violar la misma
invariante: retirar el rol (`DELETE` en `user_roles`) y deshabilitar la cuenta
(`UPDATE` de `users.status`). Un `SELECT` previo en el servicio no basta:
dos peticiones simultáneas de "retirar admin a X" y "deshabilitar a Y" —los
dos últimos administradores— podrían pasar ambas si solo se verificara en la
aplicación.

## 2. Tokens de un solo uso

Tabla unificada para invitación, verificación de correo y recuperación de
contraseña (ver Decisiones técnicas en `plan.md` — mismo criterio que
`point_transactions.type` en `003`).

```sql
CREATE TABLE auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  new_email   CITEXT,
  created_by  UUID REFERENCES users(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_type
    CHECK (type IN ('INVITATION','EMAIL_VERIFICATION','PASSWORD_RESET')),
  CONSTRAINT invitation_has_creator
    CHECK (type <> 'INVITATION' OR created_by IS NOT NULL),
  CONSTRAINT valid_expiry_window
    CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '7 days')
);

CREATE UNIQUE INDEX one_pending_token_per_user_type
  ON auth_tokens (user_id, type) WHERE consumed_at IS NULL;

CREATE UNIQUE INDEX idx_auth_tokens_hash ON auth_tokens (token_hash);
```

Puntos de diseño:

- **`token_hash`**, nunca el token: se guarda `SHA-256(token)`. A diferencia
  de `password_hash` (Argon2id, deliberadamente lento), este hash puede ser
  rápido porque el token ya tiene alta entropía aleatoria — no hace falta
  encarecer un ataque de fuerza bruta sobre un valor de 256 bits.
- **`valid_expiry_window`** traslada RF-108 (siete días, un solo uso) al
  motor: ninguna fila puede nacer con más de 7 días de vigencia, sea cual sea
  el tipo. El servicio decide el valor exacto dentro de esa ventana; la base
  impide que un error de cálculo la extienda.
- **`one_pending_token_per_user_type`** — índice único parcial: evita que un
  usuario acumule varios tokens vivos del mismo tipo (por ejemplo, cinco
  enlaces de recuperación de contraseña simultáneos). Emitir uno nuevo exige
  invalidar el anterior en la misma transacción (marcar `consumed_at`), igual
  patrón que el índice `one_open_claim_per_activity` de `003`.
- **`new_email`** — solo se usa para el caso de RF-112a (corrección de
  correo de una cuenta ya activa): el administrador fija el nuevo correo aquí,
  no en `users.email` directamente, y el cambio real solo ocurre al consumir
  el token. Así, un correo con error de tipeo o inaccesible no deja al alumno
  bloqueado con un correo al que no puede acceder.
- **Inmutabilidad de token consumido**, mismo espíritu que el libro mayor de
  `003`:

```sql
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
```

Las filas nunca se borran: quedan como evidencia de qué invitaciones y
verificaciones se enviaron, en línea con la postura general del proyecto de
no destruir trazabilidad.

## 3. Perfil de alumno

```sql
CREATE TABLE student_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  student_code        TEXT NOT NULL UNIQUE,
  career_id           UUID NOT NULL REFERENCES careers(id),
  academic_period     TEXT NOT NULL,
  phone               TEXT NOT NULL,
  avatar_url          TEXT,
  id_document_url     TEXT,
  bio                 TEXT,
  interests           TEXT[],
  accessibility_needs TEXT,
  professional_link   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_code_not_blank CHECK (length(trim(student_code)) > 0)
);

CREATE INDEX idx_student_profiles_career ON student_profiles (career_id);
```

- **`user_id` es la propia clave primaria** (relación 1:1 real con `users`,
  no una FK adicional con su propio `id`) — mismo patrón que ya usa `003` al
  referenciar `student_profiles(user_id)`.
- **`ON DELETE RESTRICT`**: es una segunda barrera, además de la disciplina
  de "nunca borrar", contra un `DELETE` accidental sobre `users` que arrastre
  el perfil e invalide la trazabilidad de `003`.
- **`student_code UNIQUE`** sostiene RF-106 junto con `users.email UNIQUE`.
  La restricción es permanente: un código de registro rechazado o
  deshabilitado no se libera para un segundo registro (ver ADR-007 sobre por
  qué la revisión manual, no un padrón, es la segunda barrera).
- **Campos obligatorios en el registro** (RF-110, sin restricciones
  alimentarias): `student_code`, `career_id`, `academic_period`, `phone`.
  **Opcionales, completables después** (RF-110a): `avatar_url`,
  `id_document_url`, `bio`, `interests`, `accessibility_needs`,
  `professional_link`.
- **`academic_period` es texto libre**, no un `INTEGER` de semestre: las
  carreras de la UCB no comparten necesariamente la misma convención
  (semestral vs. anual), y fijar un formato rígido aquí sería inventar una
  restricción que el spec no pide.
- **`total_points` no se declara aquí.** Lo agrega `003-motor-de-puntos`
  mediante `ALTER TABLE` (ver su `data-model.md` §6). Declararlo en ambos
  lugares duplicaría la fuente de verdad del esquema.
- **Bloqueo de `student_code` y `career_id` tras la verificación (RF-112)**
  no se modela como columna: se deriva de `users.status`. Mientras
  `status = 'PENDING'`, el alumno puede corregir estos campos libremente (es
  parte del mismo registro sin verificar); en cuanto pasa a `ACTIVE`, el
  servicio de `profiles` los bloquea. Se evaluó agregar una columna
  `locked_at` redundante y se descartó: dos fuentes de verdad para el mismo
  hecho ("¿ya se verificó?") se desincronizan tarde o temprano.

## 4. Catálogo académico

```sql
CREATE TABLE faculties (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE careers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_career_per_faculty UNIQUE (faculty_id, name)
);

CREATE INDEX idx_careers_faculty ON careers (faculty_id);
```

RF-116. `unique_career_per_faculty` en vez de `name UNIQUE` global: dos
facultades distintas podrían compartir el nombre de una mención o
especialidad sin que sea un error de catálogo.

## 5. Consentimiento (RF-128)

```sql
CREATE TABLE consent_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version    TEXT NOT NULL UNIQUE,
  body       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo una versión activa a la vez: publicar una nueva debe desactivar
-- la anterior en la misma transacción.
CREATE UNIQUE INDEX one_active_consent_version
  ON consent_versions (is_active) WHERE is_active;

CREATE TABLE consent_acceptances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES student_profiles(user_id),
  consent_version_id  UUID NOT NULL REFERENCES consent_versions(id),
  accepted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, consent_version_id)
);
```

- El texto (`body`) es **configurable por el administrador**, no está fijo en
  el código: el equipo del evento aún no tiene el texto legal aprobado por la
  universidad (decisión tomada en RF-128), así que el sistema debe poder
  recibir el texto real el día que exista, sin desplegar código nuevo.
- `one_active_consent_version` fuerza a que exista como máximo una versión
  vigente en cada momento: el formulario de registro siempre le pide al
  alumno aceptar *esa* versión, y `consent_acceptances` guarda cuál aceptó y
  cuándo, no solo que "aceptó algo".
- No se guarda dirección IP ni otros metadatos de la aceptación: RF-128 pide
  versión y momento, no evidencia forense adicional que el spec no pidió
  (Artículo VII).

## 6. Auditoría

```sql
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_actor  ON audit_log (actor_id, created_at DESC);
```

RF-117. `actor_id` nullable únicamente para acciones verdaderamente
automáticas (ninguna se especifica todavía en `001`); toda acción disparada
por una persona —incluida la propia auto-verificación de un alumno— debe
guardar su `id` como actor. Tabla compartida: `003` y `004` insertan aquí,
`001` es quien la define y quien expone su consulta (RF-117).

## 7. Relaciones

```
faculties ──< careers ──< student_profiles >── users (1:1, PK = user_id)
                                │                   │
                                ├──< consent_acceptances >── consent_versions
                                │
users ──< user_roles                                users ──< auth_tokens
  │                                                    │        (user_id, created_by)
  ├──< audit_log (actor_id)                            │
  │                                                     │
  └── users.created_by ──> users (autorreferencia)      └── auth_tokens.created_by ──> users
```

## 8. Datos semilla

**Facultades y carreras — a diferencia de las categorías de actividad de
`003` (bloqueadas porque no existen todavía), este catálogo sí existe en la
realidad**: la UCB tiene una lista pública y estable de facultades y
carreras. Pero no está verificada dentro de este diseño, y sembrar una lista
inventada produciría pruebas que validan un catálogo ficticio — el mismo
riesgo que `003` evitó con las categorías de actividad. Recomendación: tratar
la carga del catálogo real como una tarea explícita antes de producción (ver
Grupo 9 de `tasks.md`), **no** como un bloqueo de todo el módulo — a
diferencia de RF-310 en `003`, aquí el resto de `profiles` (avatar, edición,
listado, filtros) puede implementarse y probarse con 2-3 facultades/carreras
de prueba, claramente marcadas como tales y nunca presentes en el ambiente de
producción.

**Consentimiento — necesita al menos una fila antes de que Historia 1 pueda
funcionar en absoluto**, porque el registro exige aceptar una versión activa.
A diferencia del catálogo académico, esto sí es un requisito operativo
mínimo: sembrar una versión de marcador de posición (`body` con un texto
provisional, claramente identificado como borrador) en desarrollo/staging, y
tratar "publicar el texto legal real como nueva versión activa" como parte
del checklist de salida a producción — el propio RF-128 ya construyó el
mecanismo (CRUD de `consent_versions` por el admin) para hacer ese reemplazo
sin tocar código.
