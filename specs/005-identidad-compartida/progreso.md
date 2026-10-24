# Progreso de integración

## 2026-10-23 — Apodo compartido, primer incremento

- El responsable autorizó la ejecución autónoma del plan y aprobó las pruebas.
- Se preparó PostgreSQL/Redis de prueba en `docker-compose.test.yml`, aislados de Supabase y enlazados a loopback. Las migraciones históricas se aplicaron desde cero sobre `ted_integration_test`.
- Fase Red: los nueve casos iniciales fallaron por `404` de la ruta aún inexistente.
- Se añadió apodo nullable con clave canónica única, validación, endpoint propio y lectura desde `/me`. Para la fase inicial se adoptó el máximo técnico de 24 caracteres propuesto en el plan, sin asignar apodos ficticios a usuarios existentes.
- Fase Verde: 14 pruebas de contrato pasaron en PostgreSQL y Redis locales, incluidas concurrencia, normalización, límites y cuenta deshabilitada. También pasaron 23 pruebas de las suites de login, `/me` y nickname antes del ajuste final de concurrencia; tras ese ajuste se repitieron las 14 de nickname. El build del backend pasó.
- Las notas iniciales de este incremento son históricas. El estado vigente de Google, autorización por evento, whitelist, frontends y avatar está en [avance-integracion-2026-10-23.md](./avance-integracion-2026-10-23.md); no se debe interpretar como pendiente toda la feature.
- Las migraciones se aplicaron únicamente a PostgreSQL local aislado; nunca a Supabase productivo.

## Permisos y dependencias previstos

- La sesión activa escribe únicamente en el workspace backend. El frontend y avatar requieren un perfil que incluya sus directorios o permiso concreto para los cambios preparados.
- OAuth necesita crear/configurar un cliente Google en un proyecto accesible y establecer origins y callbacks reales; no se ha localizado un cliente configurado para esta integración.
- Las pruebas usan infraestructura local separada y URLs explícitas; el `.env` existente apunta a Supabase y nunca debe usarse para pruebas que truncan tablas.
- La migración a una base compartida requiere aplicar el procedimiento de inventario y validación definido en el plan antes de ejecutarse.

### Actualización local: OAuth y administradores (2026-10-23)

- El Client ID Web recibido está configurado únicamente en los archivos locales ignorados del backend y ambos frontends. El backend devuelve `200` al reto Google; una credencial ficticia ya pasa de `GOOGLE_AUTH_UNAVAILABLE` a `INVALID_GOOGLE_CREDENTIAL`, lo que confirma que la audiencia está configurada. No se imprimió ni guardó el ID en archivos versionados.
- TEDx e Innovation Week sirven el bundle con el mismo Client ID; ambos orígenes pasan CORS. La prueba real requiere una interacción Google en el navegador y que el proyecto OAuth tenga guardados los orígenes locales y los usuarios de prueba.
- `.env.admin.local` (ignorado por Git) contiene la allowlist local. `ADMIN_EMAILS` se limita al backend; una autenticación Google permitida asigna rol `ADMIN` y los dos permisos (`tedxucb`, `innovation-week`) de forma transaccional e idempotente. La prueba usa un correo sintético y no replica el correo personal en código fuente.
- Backend compilado; contratos focalizados de identidad/admin: 5 suites y 34 pruebas aprobadas, más 2 suites/17 pruebas tras aislar los tests de configuración y Google. El build de Innovation Week pasó con 34 pruebas; TEDx pasó typecheck, lint y build (dos warnings `<img>` previos); Avatar 2D pasó verify (22 pruebas de dominio/servicio y builds).
- Los cinco servicios locales responden en 3100/3000/5173/4002/5175. No se tocó Supabase productivo. Sigue pendiente realizar el inicio Google real desde navegador y repetir el conjunto completo de regresión del backend tras la provisión de admin.

### Verificación local posterior - 2026-10-23

- En navegador headless, Innovation Week y TEDx cargan Google Identity Services; `POST /auth/google/challenge` devuelve `200` desde ambos orígenes `localhost`. El iframe del botón Google aparece y no se muestra el error de Client ID faltante. Falta validar el acceso final con una selección de cuenta real.
- Los accesos de muestra se probaron en navegador: Innovation Week muestra el usuario invitado y TEDx permite invitado y admin; la navegación de administración aparece para el perfil de demostración.
- Innovation Week pasó typecheck, lint, aislamiento, build y 34 pruebas (13 archivos). TEDx pasó typecheck, lint y build; conserva dos avisos `<img>` existentes en `AvatarCta.tsx`.
- Backend: build aprobado; 71 suites y 402 pruebas pasaron con `--maxWorkers=1`. Jest usa `workerIdleMemoryLimit: 1GB` para reciclar workers entre archivos y evitar que la corrida serial acumule más de 3 GB. Los contratos focalizados de administración, identidad, apodo, sesión, avatar y postulaciones también pasaron.
- `.env.admin.local` sigue presente localmente e ignorado por Git. La asignación de ADMIN y acceso a ambos eventos ocurre tras login Google válido. La prueba visual con Google real y la entrega controlada de SMTP externo siguen pendientes; Supabase productivo no se modificó.

### Corrección del contrato de errores TEDx - 2026-10-23

- La API uniforme entrega su identificador en el campo `error`; TEDx esperaba `code`, por lo que no habilitaba correctamente la verificación de correos externos autorizados. El parser acepta ahora el campo contractual y mantiene compatibilidad con `code`.
- El modal ya no borra el aviso cuando vuelve a inicializar Google tras detectar `EMAIL_OWNERSHIP_REQUIRED`; una prueba de navegador simuló la respuesta HTTP 403 y luego `SENT`, y confirmó ambos mensajes y el segundo POST.
- TEDx volvió a pasar typecheck, lint y build; el servidor local responde `200`. No se modificó el archivo local `AGENTS.md` ni se incluyeron secretos.

- Se completó también una simulación del camino exitoso en navegador para ambos frontends: login con respuesta válida, recepción de permiso del evento, captura de `LeoCoder77` y envío del `PATCH /me/nickname`. Innovation Week mostró la pantalla de continuación; TEDx cerró el modal al terminar. No se crearon cuentas en la base de datos local.

### Fallback de Google con API no disponible - 2026-10-23

- En ambos frontends, cuando falla el reto de conexión al backend, ahora se mantiene un control visible `Reintentar con Google`; queda deshabilitado si no está configurado el Client ID. Invitado y admin siguen disponibles para inspección.
- Playwright con el backend bloqueado confirmó en ambos sitios el botón de reintento y las dos opciones de demostración. También se verificó que el contenido de muestra aparece cuando se interrumpen las llamadas API.
- Innovation Week pasó nuevamente verify (typecheck, lint, 34 pruebas, aislamiento y build). TEDx pasó typecheck, lint y build; se mantienen dos warnings `<img>` previos.
- La recuperación también se ejercitó en navegador: al devolver `503` en el reto y luego `200`, el botón `Reintentar con Google` vuelve a obtener el nonce y hace aparecer el widget en ambos clientes.

### Onboarding incompleto bloqueado por API - 2026-10-23

- `JwtAuthGuard` ahora consulta la cuenta autenticada y rechaza rutas protegidas con `NICKNAME_REQUIRED` mientras falte apodo. Solo `/me`, `/me/events`, `PATCH /me/nickname` y cierre global de sesión permiten completar/inspeccionar el onboarding incompleto.
- `profiles-nickname.contract.spec.ts` prueba el rechazo de una ruta normal antes del apodo y su autorización después de guardarlo; perfil y eventos siguen disponibles durante onboarding.
- Se corrigió `tests/support/seed-user.ts` para poblar `nicknameKey` en conjunto con `nickname`, respetando la restricción SQL de consistencia y normalización NFKC.
- Verificación: build backend aprobado; cuatro contratos relacionados aprobaron 40/40 pruebas. Regresión serial: 70/71 suites y 402/403 pruebas; el único timeout fue el `beforeEach` de `event-program.contract.spec.ts` al truncar tablas (30 s). La suite aislada aprobó 5/5 inmediatamente después. No se modificó base productiva.

### Invitaciones vinculadas al evento - 2026-10-23

- La auditoría encontró que la invitación abría el frontend indicado, pero no guardaba el evento en la fila del token. Al consumir, bastaba cualquier scope activo del correo, lo que podía aceptar un enlace TEDx con solo permiso Innovation Week si el scope original se revocaba.
- `IdentityInvitation` ahora guarda `eventId` con FK e índice por evento/correo. El consumo valida el mismo scope activo. La migración local preserva tokens antiguos solo cuando el único scope activo hace inequívoco su destino; invalida tokens sin scope único. No concede acceso.
- La prueba contractual revoca TEDx mientras mantiene Innovation Week y confirma que el token TEDx no se consume. También se verifica que un fallo SMTP conserva permiso/token con estado `DELIVERY_FAILED`.
- Migración aplicada en las bases locales aisladas `ted_integration_test` y `ted_backend_local`. Build backend aprobado; `identity-email` y entrega SMTP local pasaron 10/10. Smoke runtime: health 200, challenge Google disponible, credencial ficticia rechazada como `INVALID_GOOGLE_CREDENTIAL`; Client ID configurado. No se tocó Supabase productivo.

### Retiro de Firebase verificado - 2026-10-23

- Se buscó Firebase en código, variables locales/ejemplo, tipos, configuración y manifests/lockfiles de TEDx e Innovation Week. No quedan SDKs, imports ni nombres de entorno Firebase; ambos frontends usan los endpoints del backend y el Client ID Web de Google.
### Smoke del widget Google en navegador local - 2026-10-23

- Con Playwright headless, `/registrarse` de Innovation Week cargó el iframe de `accounts.google.com` sin errores de página; al pulsar el botón, el popup llegó a `Sign in - Google Accounts`.
- TEDx abrió su modal y cargó un botón Google en iframe. El click automatizado headless no abrió una ventana de cuenta; no se introdujeron credenciales ni se obtuvo un token. La autenticación real continúa pendiente para validar selección de cuenta y callback/retorno de credencial.
### Regresión backend completa - 2026-10-23

- Tras vincular invitaciones a evento, la regresión serial completa pasó: 71/71 suites, 405/405 pruebas (`npm run test:local -- --maxWorkers=1 --testTimeout=60000`). El límite de 60 s cubre el hook de limpieza serial de `event-program`, que previamente superó 30 s; esa suite también pasó aislada.
- No quedan fallos automatizados conocidos en backend. La autenticación completa con cuenta Google real y un envío SMTP externo controlado siguen como pasos manuales antes de cerrar T071.
### Estado de cuenta validado en cada ruta protegida - 2026-10-23

- `JwtAuthGuard` consulta estado y apodo en cada solicitud. `DISABLED`, `REJECTED` e `INVITED` no pueden usar tokens anteriores; `PENDING` solo puede usar `GET/PATCH /me/profile` y `POST /me/avatar` para completar el flujo heredado. Los endpoints de evento requieren `ACTIVE` mediante `EventAccessService`.
- La prueba de regresión de cuenta desactivada comprueba `/me`, `/me/events` y `/me/profile`; el contrato existente preserva edición del perfil `PENDING`. El intento inicial de bloquear indiscriminadamente esos perfiles falló 3 pruebas, se acotó con metadata `AllowPendingAccount` y se validó de nuevo.
- Resultado final de regresión: 71/71 suites, 406/406 pruebas (`--maxWorkers=1 --testTimeout=60000`). Build backend aprobado.
### Límite de apodo alineado en Innovation Week - 2026-10-23

- El formulario ya validaba NFKC, 3–24 caracteres y solo letras/números, pero permitía teclear 48 caracteres antes de mostrar error. `maxLength` ahora coincide con el contrato/backend (24).
- `IdentityPortal` cubre rechazo de símbolos y valores de dos caracteres, aceptación del mínimo válido de tres y el límite de 24 en el campo.
- Innovation Week: typecheck, lint, aislamiento, build y 35/35 pruebas pasaron.

### Verificación de accesos administrativos compartidos - 2026-10-23

- Se agregó edición explícita de permisos existentes en el panel de Innovation Week; permite cambiar el alcance entre TEDxUCB e Innovation Week, invitar por correo y revocar permisos por evento.
- La lista privada `ADMIN_EMAILS` local incluye la cuenta de administración indicada y permanece en `.env.admin.local`, ignorado por Git. `ConfiguredAdminAccessService` concede rol ADMIN y acceso a ambos slugs durante la autenticación Google válida.
- Innovation Week pasó `npm run verify`: typecheck, lint, 36/36 pruebas, chequeo de aislamiento y build. TEDx pasó typecheck, lint y build (dos avisos previos por `<img>` en `AvatarCta.tsx`). Backend: contratos `auth-google` y `admin-event-access`, 19/19.
- Smoke local: TEDx, registro de Innovation Week y API responden 200; el reto OAuth responde 200 con `Access-Control-Allow-Origin` correcto para `localhost:3000` y `localhost:5173`.
- La prueba con identidad real de Google y entrega SMTP externa controlada siguen pendientes. No se modificó Supabase productivo.

### Editor Avatar 2D conectado en TEDx - 2026-10-23

- El modal de identidad TEDx ahora conserva el onboarding abierto hasta que la persona elija continuar, muestra la personalización 2D como opción y permite omitirla. El editor 3D de `/studio` permanece independiente.
- TEDx usa el paquete versionado `@innovation-week/avatar-integration-contract` 1.1.0 distribuido como archivo local versionado. Verifica origen y ventana de `postMessage`, valida la referencia y solo la persiste en `localStorage` después de un mensaje `saved` confiable.
- La apertura autenticada solicita token puente al backend para reclamar/recuperar ownership; renueva la sesión si el access token venció. Los modos de muestra abren el editor sin reclamar ownership.
- TEDx: 5/5 pruebas de contrato/UI, typecheck, lint y build aprobados. Lint conserva dos advertencias preexistentes `<img>` en `AvatarCta.tsx`. Servicios locales backend, ambos frontends, Avatar API (`/health`, `/ready`) y editor responden 200.

### Recorrido local de avatar TEDx y controles demo - 2026-10-23

- Playwright abrió la landing TEDx, mostró el modal de identidad, entró como invitado demo y abrió el editor Avatar 2D real en iframe (`localhost:5175`). El editor cargó su estudio y controles, sin excepciones JavaScript ni solicitudes locales fallidas. No se usaron credenciales Google ni se creó un avatar persistente.
- En la vista admin demo de Innovation Week, los permisos de muestra se pueden editar y revocar localmente. La invitación de muestra informa que no envía correo. La prueba específica cubre alta, selector de eventos, edición, revocación e invitación sin llamadas backend.
- Innovation Week pasó `npm run verify`: typecheck, lint, aislamiento, build y 38/38 pruebas. TEDx pasó `pnpm test` (5/5), `pnpm typecheck`, `pnpm lint` y `pnpm build`; quedan dos avisos preexistentes de imágenes en el área de avatar 3D.
- Para el recorrido, el proceso local TEDx en 3000 se reinició tras detectar que servía un build anterior. El build actual y los cinco servicios locales vuelven a responder; queda pendiente solo la autenticación Google interactiva y el correo SMTP externo controlado.
- Playwright también abrió el modal Google en ambas webs y observó el iframe de Google Identity Services; el reto backend respondió 200 con CORS correcto (`localhost:3000` y `localhost:5173`) y sin errores JavaScript. No se seleccionó una cuenta ni se obtuvo token Google.
