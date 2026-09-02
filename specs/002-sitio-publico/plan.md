# Plan de implementación: Sitio público TEDxUCB

**Basado en:** `specs/002-sitio-publico/spec.md`
**Stack:** NestJS + TypeScript + PostgreSQL + Prisma 7, monolito modular
**Dependencia:** solo el rol `ADMIN` de `001-identidad-y-usuarios` (ya implementada)

> Este documento se mantiene de alto nivel. El esquema detallado está en
> `data-model.md`, los contratos de API en `contracts/`, y las tareas de
> implementación en `tasks.md`.

## Resumen técnico

Este repositorio es **exclusivamente el backend** (ADR-006). Ese límite no es
un detalle administrativo: es el principio rector de todo este diseño. Cada
requisito del spec se filtró contra una pregunta única — "¿esto es un dato o
una regla que el frontend necesita del servidor, o es una decisión de
presentación que el frontend puede resolver solo?". El manual de marca
(RF-219) y la agenda del evento (RF-220) cayeron del lado del frontend y se
descartaron explícitamente del backend, sin generar entidad ni endpoint — el
responsable del proyecto lo confirmó de forma directa al resolver esos
marcadores en `spec.md`. La accesibilidad (RF-217) y el responsive (RF-216)
siguieron el mismo filtro: solo generan una obligación de backend donde de
verdad hay un dato que servir (el texto alternativo de la foto de un
speaker), nunca una regla de CSS.

El resto del diseño gira sobre dos ejes. El primero es **contenido editable
sin desplegar código** (RF-203): en vez de construir un CMS genérico
—explícitamente prohibido por el Artículo VII—, se modela como bloques de
texto con clave estable conocida de antemano (`content_blocks`), el mismo
patrón de "texto configurable por el admin" que `001` ya usa para el
consentimiento, pero sin su necesidad de versionado: el consentimiento tiene
peso legal y necesita historial (`consent_versions`); un párrafo sobre la
temática de sostenibilidad no.

El segundo eje es el **embudo de postulación → speaker** (Historias 3 y 4).
La pieza más sutil del contrato de API no es CRUD: es la cuenta regresiva
(RF-204), que exige explícitamente no depender del reloj del dispositivo. El
diseño resuelve esto exponiendo la hora del propio servidor en la misma
respuesta que la fecha del evento, para que el cliente calcule el delta
contra dos valores igualmente confiables, en vez de calcular "cuánto falta"
en cada request del lado del servidor (que además quedaría desactualizado
bajo caché).

## Fase -1: Gates previos a la implementación

### Gate de simplicidad (Artículo VII)

- [x] ¿Se usan ≤3 proyectos/módulos? — Sí, **2**: `content` y `speakers`. Se
      validaron tres hipótesis antes de decidir:
      - **1 módulo único — descartada.** Mezclaría el dominio de
        "configuración/texto casi estático" (Evento, bloques de contenido)
        con el de "flujo de personas con estado, anti-abuso y subida de
        archivos" (speakers, postulaciones) — dos dominios técnicos
        distintos en un solo servicio, violando el Artículo I.
      - **3 módulos (`content`, `speakers`, `applications` separados) —
        considerada, descartada.** El volumen total de endpoints de `002`
        (~17) no justifica sobre-fragmentar. Hay un precedente interno más
        fuerte en sentido contrario: `001/users` ya agrupa `UsersService` +
        `RegistrationService` (su propia máquina de estados) en un solo
        módulo porque comparten familia de entidad y guard —
        `SpeakerApplication` y `Speaker` comparten exactamente esa
        relación, y además RF-215 exige convertir una en otra sin
        recapturar datos, operación más simple de transaccionar dentro de
        un mismo módulo que cruzando un límite de módulo.
      - **2 módulos — aceptada.** `content` agrupa lo casi-estático y de
        baja frecuencia de cambio (Evento, bloques de contenido). `speakers`
        agrupa todo lo que gira en torno a la persona que sube al
        escenario — la ficha pública y el embudo que la alimenta — con dos
        servicios internos (`speakers.service.ts`, `applications.service.ts`)
        que comparten `PrismaService` para la conversión, sin necesidad de
        importar entre módulos.
      No se llega al límite de 3, así que no aplica Registro de complejidad.
- [x] ¿No hay future-proofing / features especulativas? — Sí. No se modela
      agenda/programa (RF-220, descartado explícitamente), no se modela
      manual de marca (RF-219, descartado explícitamente), no se versiona
      `content_blocks` (no hay requisito legal como el de `consent_versions`
      que lo justifique), no se construye recorte/redimensionado de
      imágenes del lado del servidor (el encuadre consistente de la grilla
      lo resuelve `object-fit: cover` en CSS del frontend, sin depender del
      aspecto de la imagen original). No se construye una tabla de
      "eventos" con historial de ediciones pasadas/futuras: es la primera
      edición y el spec solo pide que el admin pueda cambiar la fecha del
      evento actual, no gestionar varias.

### Gate anti-abstracción (Artículo VIII)

- [x] ¿Se usa el framework directamente? — Sí. Prisma directo. Reutiliza
      exactamente el patrón de subida de imagen ya implementado en
      `001/profiles` (`file-type` contra un allowlist real, `multer` en
      memoria, `useStaticAssets` sin `@nestjs/serve-static`) para la foto de
      speaker — no se reinventa.
- [x] ¿Una sola representación del modelo de datos? — Sí. DTO solo donde el
      contrato difiere de la entidad: la conversión de postulación a speaker
      (RF-215) compone campos de dos tablas en una sola operación, como ya
      hace el check-in de `003`.

### Gate integration-first (Artículo IX)

- [x] ¿Los contratos están definidos antes que el código? — Sí, en
      `contracts/`.
- [x] ¿Se prueba contra servicios reales? — Sí, PostgreSQL real. La
      corrección depende de restricciones que un mock no reproduce: el
      índice único parcial de "un solo evento publicado a la vez", el
      `CHECK` que impide publicar un speaker incompleto, y la concurrencia
      de doble conversión de una misma postulación.

### Cumplimiento constitucional

- [x] **I, library-first:** `EventsService`, `ContentBlocksService`,
      `SpeakersService` y `ApplicationsService` son invocables sin HTTP.
- [~] **IV, auditabilidad:** no aplica en su forma de libro mayor (no hay
      puntos aquí), pero se traduce en reutilizar `audit_log` (tabla
      compartida, ya definida por `001`) para cambios de estado de
      postulación, publicación/despublicación de speaker y ediciones del
      Evento — ninguna tabla nueva, solo reutilización de infraestructura ya
      construida.
- [x] **V, privilegio mínimo y datos personales:** todo endpoint que puede
      revelar una postulación o un speaker no publicado vive en un
      controlador **físicamente separado** del público (nunca la misma ruta
      con un filtro condicional por rol) — ver la tabla de decisiones. Es
      deliberadamente más estricto que `faculties`/`careers` en `001` (que
      sí comparten ruta entre lectura pública y escritura admin), porque
      aquí la contrapartida de una fuga no es un catálogo académico sino
      datos de contacto reales y fichas todavía sin aprobar.
- [x] **VI, fiabilidad de campo:** aplica como "contenido público liviano y
      rápido" (CE-205): las colecciones públicas (`content_blocks`,
      `speakers`) no se paginan porque están acotadas por la realidad del
      producto (un puñado de bloques de texto, unas pocas decenas de
      speakers como máximo para una sola edición) — paginar algo que no
      puede crecer sin límite sería complejidad sin beneficio.

## Decisiones técnicas y su porqué

| Decisión | Alternativas consideradas | Por qué esta opción | Requisito |
|---|---|---|---|
| Contrato de cuenta regresiva: el endpoint público devuelve `startsAt` (fecha del evento), `serverTime` (hora actual del propio servidor) y `eventStatus` (`UPCOMING`/`FINISHED`), todos calculados por el servidor | Backend calcula y devuelve `remainingSeconds` directamente; backend devuelve solo `startsAt` y confía en que el cliente use su propio reloj | RF-204 exige explícitamente "no la del dispositivo". Devolver solo `startsAt` no lo resuelve: si el reloj del visitante está mal, el cálculo sigue siendo incorrecto sin importar cuán correcta sea la fecha. Devolver `remainingSeconds` ya calculado es recalcular algo trivial en el servidor y además queda obsoleto si la respuesta se cachea. Devolver ambos valores server-side deja al cliente calcular contra dos relojes controlados por el servidor, sin depender del suyo. `eventStatus` centraliza en una sola fuente de verdad la regla de "ya terminó" (RF-205), evitando que cada cliente reimplemente la comparación de borde. | RF-204, RF-205 |
| `Cache-Control: no-store` en `GET /public/event` | Cachear con TTL corto (30-60s) | `serverTime` pierde su propósito si la respuesta se sirve desde caché: un visitante recibiría una hora de servidor vieja y el delta calculado sería incorrecto por el tiempo que la caché lleve viva. El costo de no cachear es insignificante: es una lectura de una sola fila. | RF-204 |
| `content_blocks` sin versionado (a diferencia de `consent_versions`) | Reusar el patrón de `consent_versions` (historial + una versión activa) | `consent_versions` versiona porque el texto tiene peso legal y cada aceptación debe quedar ligada a una versión concreta, exigencia que no existe aquí. Versionar un párrafo de "sobre el evento" sin ese requisito sería construir para un problema que no está pedido (Artículo VII). | RF-202, RF-203 |
| RF-211 (premisa "hablar a la cabeza, no al corazón" en el formulario) se resuelve como copy estático de frontend, **no** como un bloque de contenido más | Modelarlo como un `content_block` adicional, editable por el admin | Es un texto que no va a cambiar (es la razón de ser del formato TED, no una decisión de temporada) y el propio formulario del frontend ya necesita desplegarse con o sin este cambio. Convertirlo en dinámico agrega una clave más al mecanismo de `content_blocks` sin que ningún escenario del spec pida que cambie sin deploy. | RF-211 |
| Foto de speaker: se reutiliza el patrón de avatar de `001/profiles` (`file-type` contra allowlist real, nunca el mimetype del cliente ni la extensión) — **sin** recorte/redimensionado del lado del servidor | Agregar `sharp` (o similar) para recortar/normalizar proporciones en el servidor | El caso límite pide que "la grilla no se rompa", pero eso es exactamente lo que resuelve `object-fit: cover` en CSS, sin importar el aspecto de la imagen original — es responsabilidad de presentación, no de datos. Agregar una librería de procesamiento de imágenes nueva para un problema que el frontend resuelve mejor sería complejidad no justificada. Lo que sí es responsabilidad de backend — validar que el archivo es realmente una imagen — se cubre reutilizando el patrón ya probado. | Caso límite "foto de proporciones inadecuadas" |
| Speaker publicado exige foto + texto alternativo + titular + reseña + título de charla completos, forzado por `CHECK` en la tabla | Validar la completitud solo en el servicio de aplicación | Un `CHECK` de "publicado implica completo" traduce RF-206 y RF-217 (alt text) al motor, mismo criterio que `manual_requires_note` en `003`: un descuido del código de aplicación no puede dejar publicada una tarjeta rota o sin texto alternativo. | RF-206, RF-217 |
| Postulación: campo señuelo (`website`, oculto en el formulario del frontend) + `RateLimitGuard` ya existente — **sin** captcha por ahora | Integrar un proveedor de captcha (reCAPTCHA/hCaptcha/Turnstile) | No existe hoy cuenta ni credenciales de ningún proveedor de captcha, y elegir uno es una decisión de producto (costo, privacidad, fricción del formulario) que nadie tomó todavía. El campo señuelo es de costo cero y descarta buena parte de los envíos automatizados ingenuos. Rate limit + señuelo + revisión manual del admin son tres capas — mismo principio de "ninguna barrera basta sola, la combinación sostiene" que ya usa `001` (ADR-007). Si el abuso real aparece después del lanzamiento, sumar captcha no exige tocar el esquema. | RF-212 |
| Postulaciones NO son idempotentes (cada envío crea una fila nueva, incluso con datos idénticos) | Deduplicar por correo con una restricción única | El propio caso límite del spec lo exige así explícitamente: "no se bloquea [...] el panel agrupa por correo y señala duplicados". Bloquear reintentos aquí sería inventar una regla que el spec descartó a propósito. | Caso límite "misma persona postula varias veces" |
| `speaker_applications.status` incluye `NOT_TED_FORMAT` como estado propio, hermano de `REJECTED`, no una subcategoría de texto libre | Un campo `rejectionReason` de texto libre sobre `REJECTED` | El caso límite pide medir **cuántas** postulaciones llegan así para decidir si hay que ajustar el texto del formulario (retroalimenta CE-202). Un estado propio se puede contar y filtrar en el panel sin depender de que el admin escriba el motivo de forma consistente. | Caso límite "postulación que no encaja con el formato TED", CE-202 |
| Conversión de postulación a speaker como endpoint de acción dedicado (`POST /applications/:id/convert-to-speaker`), no como un `PATCH` de estado genérico | Permitir `status: "CONVERTED"` vía el mismo `PATCH` de cambio de estado | La operación crea un recurso nuevo (`Speaker`) como efecto secundario — es estructuralmente distinta de un cambio de estado simple, mismo criterio que separar `checkin` de una actualización genérica en `003`. Mantenerla explícita evita que un `PATCH` con `status: "CONVERTED"` intente saltarse la creación del speaker. | RF-215 |
| Mapeo de campos en la conversión: `fullName→fullName`, `ideaTitle→talkTitle`, `affiliation→headline`, `ideaSummary→bio` (el speaker nace `DRAFT`); `photoUrl`/`photoAltText` quedan vacíos, a completar por el admin | Exigir que el admin retipee bio/titular desde cero; o bloquear la conversión hasta que el admin suba la foto | RF-210 no captura ni foto ni una reseña personal (solo datos de la idea) — no existen para "no recapturar". Precargar `bio` desde `ideaSummary` reduce trabajo real sin inventar datos, y como el speaker nace `DRAFT` el admin lo revisa antes de publicar (el `CHECK` de completitud impide publicarlo sin foto). | RF-215 |
| Correo de confirmación de postulación (RF-213) se encola con BullMQ (ya es dependencia) y se envía por un `MailService` nuevo en `src/common/mail/` vía SMTP (`nodemailer`) | Enviar de forma síncrona dentro del request; usar un proveedor SaaS de correo transaccional | `001` dejó pendiente el envío real de correos (construyó la generación de tokens, no el envío) — `002` es la primera feature que de verdad lo necesita. Encolar después de confirmar en base de datos sigue el mismo principio que la notificación de check-in en `003`: un fallo del proveedor de correo no puede impedir que la postulación quede registrada. SMTP genérico vía `nodemailer` no ata el proyecto a una cuenta de un proveedor SaaS todavía no decidida. **Efecto colateral a documentar:** esta pieza de infraestructura, una vez construida, también desbloquea el envío real de invitación/verificación/recuperación de `001`, que hoy no se envía. Requiere nuevas variables de entorno (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`), validadas al arrancar como el resto de `env.validation.ts`. | RF-213 |
| `events.image_url` — campo en la entidad Evento para la imagen representativa de Open Graph | Asumir que RF-218 ya está cubierto sin cambios | Al diseñar el contrato de Open Graph se detectó que ninguna entidad tenía "imagen representativa del evento": ni `content_blocks` (texto puro por diseño) ni `speakers` (fotos de personas, no del evento). Es un campo mínimo, mismo patrón de subida que la foto de speaker. | RF-218 |
| Rutas públicas de `speakers` y `applications` en controladores **físicamente separados** de los de administración (nunca la misma ruta con filtro condicional por rol) | Una sola ruta `GET /speakers` con lectura condicionada por si hay sesión admin, como ya hacen `faculties`/`careers` en `001` | RF-207 es taxativo: "no publicados NUNCA visibles públicamente... el filtrado DEBE ser server-side". Un catálogo académico no tiene ese riesgo; una ficha de speaker sin aprobar o el correo de un postulante, sí. Separar físicamente el controlador hace que la ruta pública no tenga ningún camino de código capaz de devolver un registro no publicado, en vez de depender de que un guard condicional nunca falle. | RF-207, Artículo V |

## Módulos validados

| Módulo | Responsabilidad | Dueño de tablas |
|---|---|---|
| `content` | Entidad Evento (fecha, sede, aforo, imagen, estado de publicación — alimenta la cuenta regresiva y el Open Graph) y bloques de contenido editable de clave estable | `events`, `content_blocks` |
| `speakers` | Fichas de speaker (foto, orden, publicación) y postulaciones públicas (recepción, panel de revisión admin, conversión a ficha) | `speakers`, `speaker_applications` |

Ninguno depende del otro dentro de la feature. Ambos dependen únicamente del
rol `ADMIN` de `001` (guards `JwtAuthGuard` + `RolesGuard`, reutilizados sin
modificación) y de `users.id` para trazabilidad (`updated_by`, `reviewed_by`,
`created_by`).

## Modelo de datos (resumen — detalle en `data-model.md`)

Cuatro entidades. `events` es prácticamente un singleton operativo — una fila
"actual", protegida por un índice único parcial que impide dos filas
`PUBLISHED` a la vez, mismo idioma que `one_active_consent_version` de `001`.
`content_blocks` es clave-valor plano, sin versionado. `speakers` tiene un
`CHECK` que impide publicar una ficha incompleta. `speaker_applications`
tiene su propia máquina de estados (`PENDING → ACCEPTED|REJECTED|
NOT_TED_FORMAT`, y `ACCEPTED → CONVERTED` solo vía el endpoint de conversión)
y un enlace 1:1 opcional hacia el `Speaker` que produjo.

## Contratos (resumen — detalle en `contracts/`)

- `contracts/evento-y-cuenta-regresiva.md` — `GET /api/v1/public/event`
  (contrato completo, resuelve "hora del servidor") + índice de
  `GET/PATCH /api/v1/events`, `POST /api/v1/events/:id/image` (admin).
- `contracts/postulaciones.md` — `POST /api/v1/public/applications`
  (contrato completo, con señuelo anti-bot y rate limit) + índice del panel
  admin (`GET/PATCH /api/v1/applications`,
  `POST /api/v1/applications/:id/convert-to-speaker`).
- `contracts/speakers.md` — índice: `GET /api/v1/public/speakers` +
  CRUD admin (`GET/POST/PATCH /api/v1/speakers`,
  `POST /api/v1/speakers/:id/photo`, `POST /api/v1/speakers/reorder`).
- `contracts/contenido.md` — índice:
  `GET /api/v1/content-blocks`, `GET /api/v1/content-blocks/:key` (públicas),
  `POST/PATCH /api/v1/content-blocks` (admin).

## Orden de creación de archivos (test-first, obligatorio)

1. `contracts/` — especificaciones de la API
2. Pruebas de contrato, luego de integración, luego unitarias
3. Migraciones y esquema de datos (incluye seed del Evento — ver
   `data-model.md` §6)
4. Código fuente que hace pasar las pruebas anteriores, en el orden
   `content` → `speakers` (el countdown y el "sobre el evento" no dependen de
   nada de `speakers`; la conversión de postulación a speaker sí depende de
   que `speakers` ya exista, así que dentro de ese módulo `speakers.service`
   se construye antes que `applications.service`)

## Registro de complejidad

No aplica — el gate de simplicidad no falla (2 módulos ≤ 3). Se documentó en
la sección de gates la razón de no fusionar en 1, siguiendo el mismo criterio
de transparencia que `001` aplicó incluso cuando su resultado tampoco superó
el límite.

## Validación (resumen — escenarios de aceptación del spec)

1. Ciclo feliz de Historia 1: leer `GET /public/event` y
   `GET /content-blocks` sin sesión, verificar que el contenido coincide con
   lo editado por el admin.
2. Cuenta regresiva: verificar que `startsAt` y `serverTime` permiten
   calcular un delta positivo; adelantar el reloj del entorno de prueba más
   allá de `startsAt` y verificar `eventStatus: "FINISHED"`, nunca negativo.
3. Reprogramación: el admin cambia `startsAt` vía `PATCH /events/:id`,
   verificar que `GET /public/event` refleja el cambio sin redeploy.
4. Historia 3, ciclo completo: sin speakers publicados,
   `GET /public/speakers` devuelve lista vacía sin error; se crea un speaker
   de prueba incompleto y se intenta publicar (rechazo por el `CHECK`); se
   completa foto/reseña/titular y se publica; aparece en la lista pública;
   se despublica y desaparece sin borrarse.
5. Historia 4, ciclo completo: postulación pública → aparece en
   `GET /applications` del admin → se acepta → se convierte en speaker sin
   recapturar nombre ni título de charla → el speaker nace `DRAFT`.
6. Duplicados: dos postulaciones con el mismo correo, verificar que ambas se
   registran y que el panel señala el conteo de coincidencias.
7. Anti-abuso: envío con el campo señuelo relleno → `201` idéntico, sin fila
   creada; superar el límite de frecuencia → `429`.
8. Confirmación por correo: verificar que el job se encola tras confirmar en
   base de datos, no antes; simular una caída del SMTP y verificar que la
   postulación igual queda registrada.
