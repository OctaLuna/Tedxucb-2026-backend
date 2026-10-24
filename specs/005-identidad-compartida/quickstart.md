# Quickstart de validación: identidad compartida

**Estado:** runbook de verificación manual para la integración ya implementada. Los pasos OAuth real y SMTP externo requieren credenciales de desarrollo/staging; el resto puede verificarse con servicios locales. Usar PostgreSQL aislado y buzón de pruebas. Nunca compartir tokens, PII o credenciales.

## Preparación del entorno

1. Arrancar PostgreSQL/Redis/Mailpit local y comprobar health de servicios.
2. Aplicar migraciones únicamente a DB local y cargar seeds idempotentes para `tedxucb` e `innovation-week`. No ejecutar contra Supabase productivo.
3. Para habilitar Google en local, hace falta únicamente un **OAuth 2.0 Client ID tipo Web** (`…apps.googleusercontent.com`). Configurar el mismo ID en el backend y ambos frontends. No hace falta API key, client secret, redirect URI ni callback HTTP para el flujo GIS de ID token; nunca poner secretos OAuth en Vite/Next público. El backend permite omitir el ID en desarrollo, pero valida y exige `GOOGLE_CLIENT_ID` al arrancar en `production`.
4. Iniciar backend, servicio Avatar 2D y cualquiera de los frontends con origen/redirect allowlisted; verificar CORS sin wildcard. El frontend conserva muestras locales si el API no responde.
5. Crear cuenta Workspace de prueba, cuenta Google externa permitida y otra no permitida. Crear usuario Admin desde fixture controlado, no mediante botón público.

## Operación local, soporte y recuperación

- `docker compose -f docker-compose.test.yml up -d postgres-test redis-test mailpit-test` levanta servicios enlazados a loopback. Mailpit queda disponible en `http://127.0.0.1:8025`.
- Para migrar y comprobar el estado del backend local, ejecuta `npm run migrate:local`. Sin `DIRECT_URL` explícita, el comando apunta a `ted_backend_local` en `127.0.0.1:55432`; si se define una URL, el script exige loopback, puerto `55432` y una base con prefijo `ted_`. Nunca usa una URL remota ni carga `DIRECT_URL` desde `.env`. Si consultas el estado manualmente, fija primero una `DIRECT_URL` local de forma explícita.
- En una base vacía, el script reconoce únicamente el fallo esperado de `20261023060000_scope_speakers_to_event`, comprueba que eventos, speakers, postulaciones, actividades, ledger, selecciones y contenido estén vacíos, crea el ancla local TEDx y reanuda las migraciones. Si encuentra datos o cualquier otro error, se detiene y no intenta asignarlos automáticamente. Esta ayuda es solo para desarrollo local; los datos legados deben conservar su fila TEDx para que el backfill los asocie correctamente.
- El seed acotado `scripts/seed-shared-events.ts` comprueba que el host sea loopback y el nombre de base `ted_integration_test`; no es un seed de staging/producción. Confirma fechas y slugs con el responsable antes de preparar un entorno desplegado.
- El seed acotado `scripts/seed-shared-events.ts` comprueba que el host sea loopback y el nombre de base `ted_integration_test`; no es un seed de staging/producción. Confirma fechas y slugs con el responsable antes de preparar un entorno desplegado.
- Configuración GIS local: en Google Auth Platform → Clients → Create client → Web application, agregar Authorized JavaScript origins `http://localhost`, `http://localhost:5173` y `http://localhost:3000`. En `Tedxucb-2026-backend/.env`, definir `GOOGLE_CLIENT_ID=<Client ID>`; en Innovation Week `frontend/.env.local`, `VITE_GOOGLE_CLIENT_ID=<Client ID>`; en TEDx `frontend/.env.local`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<Client ID>`. El ID no es secreto; se puede compartir para configurarlo. GIS entrega el ID token por callback JavaScript, así que este flujo no usa redirect URI, callback HTTP ni client secret. Cuando se dockerice y se asigne dominio al servidor, agregar los orígenes HTTPS correspondientes en ese momento. Ver [Google Identity Services: obtener un client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) y [OpenID Connect / Sign in with Google](https://developers.google.com/identity/openid-connect).
- Configurar la audiencia como `External`, porque el flujo admite correos de cualquier dominio que un ADMIN haya autorizado; `Internal` impediría que las cuentas externas lleguen a la whitelist/verificación. Mientras la app esté en estado `Testing`, registrar las cuentas Google de prueba como test users. Antes de habilitar usuarios reales, revisar publicación/verificación, dominios de marca y políticas vigentes con el propietario del proyecto. Referencias oficiales: [audiencia y estado de publicación](https://support.google.com/cloud/answer/15549945?hl=en) y [requisitos de producción/verificación](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).
- El primer usuario ADMIN se provisiona con el mecanismo administrativo controlado existente y aprobación del operador; nunca otorgar ADMIN mediante whitelist/invitación. En local, usa fixtures de pruebas. Registrar quién administrará whitelist y revocación en cada evento antes del staging.
- Si una persona no recibe acceso, soporte debe confirmar correo normalizado, autorización vigente para el slug del evento y estado de cuenta sin copiar tokens ni exponer información de otra persona. Una whitelist no confirma titularidad de correo. No existe endpoint de reenvío de invitación; no simular autorización desde la UI.
- Si SMTP falla, la autorización ya persistida se conserva y la UI debe mostrar fallo de entrega; verificar Mailpit/log de entrega sin revelar token. La invitación vigente puede consumirse según su TTL; no regenerar ni reenviar manualmente hasta diseñar ese flujo.
- Si API no está disponible, Innovation Week y TEDx preservan contenido de muestra/local para consulta y operaciones demo locales; esa ruta no equivale a sesión Google ni persistencia compartida. Restablecer conectividad y confirmar lectura/escritura de ambos slugs antes de retomar operaciones reales.
- Rollback: no borrar tablas, no editar migraciones aplicadas y no restaurar una base sobre otra. Detener despliegue, conservar logs sin PII, diagnosticar con estado de migración y preparar un forward-fix revisado. Cualquier migración de datos reales requiere dump sanitizado, comparación de conteos/relaciones, respaldo y plan explícito aprobado por el responsable; Supabase productivo queda fuera de este runbook.
- Rotar secretos desde el gestor del entorno; no incluirlos en Git, artefactos frontend o tickets. Revocar OAuth client o `AVATAR_BRIDGE_SECRET` solo con una ventana de coordinación, pues invalidará los flujos asociados.

### Administradores locales

En desarrollo, configura `ADMIN_EMAILS` en `.env.admin.local`, archivo ignorado por Git y cargado solo en modo local. Usa una lista de correos separados por comas. Para Docker/servidor, inyecta la misma variable como secreto del backend. Cada dirección configurada que inicia sesión por Google obtiene `ADMIN` y acceso a ambos eventos de forma idempotente; la lista nunca se copia a Innovation Week ni TEDx.

## Escenarios

1. **Primera persona UCB:** entrar con cuenta `@ucb.edu.bo` Workspace válida. Ver una identidad nueva con rol mínimo, onboarding de apodo y eventos según política; aún no entra al resto de la experiencia.
2. **Apodo requerido:** enviar apodo de 2 caracteres, símbolos y espacio: cada uno se rechaza. Guardar apodo de 3–24 caracteres compuesto por letras o números; comprobar normalización y unicidad. Acceder al dashboard y recargar; `/me` devuelve el mismo apodo.
3. **Unicidad:** registrar segundo usuario y tratar de guardar la misma clave de apodo con diferente casing. Debe aparecer conflicto recuperable sin crear segunda clave.
4. **Segundo frontend:** simular callback desde la configuración de TEDx con el mismo Google `sub`; recuperar mismo `userId` y apodo. Las autorizaciones de eventos siguen siendo propias.
5. **Google inválido:** repetir con token vencido, audience equivocado, issuer equivocado o callback state incorrecto. Ningún caso crea sesión/usuario.
6. **Dominio parecido:** intentar cuenta con texto que termina en `ucb.edu.bo` pero no es el dominio Workspace permitido. Debe bloquearse.
7. **Cuenta existente:** asociar cuentas `INVITED`, `PENDING` y `REJECTED` con prueba autorizada; conservar ID, perfil, roles e historial. Cada cuenta conserva estado y sigue bloqueada hasta completar sus controles. Una `DISABLED` no obtiene acceso ni se reactiva.
8. **Cuenta disabled:** intentar login y refresh con identidad asociada a usuario disabled; no emitir ni rotar sesión.
9. **Whitelist defaults:** como admin, agregar correo externo dejando los dos eventos seleccionados. Ver dos permisos; no se agrega rol ADMIN/STAFF.
10. **Permiso granular:** crear otra dirección solo para Innovation Week. Puede ver recursos Innovation Week; endpoint TEDx, URL manipulada o UUID de TEDx es denegado.
11. **Invitación:** para dirección ya en whitelist, pedir envío. Ver correo de prueba y token con vencimiento tres días. El enlace por sí solo no autoriza; externo solo entra tras verificación correcta de identidad/titularidad.
12. **Whitelist obligatoria:** mandar invitación antes de añadir correo. La operación no concede acceso y no inserta scope accidental.
13. **Revocación:** quitar el evento de la autorización y repetir request con sesión existente. El endpoint de evento vuelve a denegar acceso.
14. **SMTP caído:** apagar Mailpit, autorizar y enviar invitación. Ver permiso persistido, error de entrega legible y no duplicación de whitelist; no queda token en log.
15. **Admin:** usuario regular intenta todas las acciones de administración; servidor deniega aunque fuerce llamadas HTTP. Un admin modifica scope y la pantalla refleja respuesta del API.
16. **Evento aislado:** crear misma categoría/título local en dos eventos y consultar; cada evento muestra los propios registros. Hacer consulta/relación compuesta cruzada y comprobar rechazo DB/API.
17. **Ledger:** revisar snapshot/historial antes/después de backfill: mismo número y valores. Intentar actualizar/borrar transacción y confirmar restricciones actuales.
18. **Avatar opcional:** tras apodo, omitir editor y continuar. Repetir abriendo editor 2D; comprobar claim del draft invitado, persistencia, recuperación y revocación. Una falla del avatar no bloquea la cuenta.
19. **Firebase eliminado:** inspeccionar bundle/requests y `rg` para dependencia, variables y llamadas Firebase. Sin llamadas Firebase y sin error de sesión.
20. **Auditoría gate:** confirmar alcance documentado de logs de seguridad y revisar formalmente la excepción antes de habilitar producción.
21. **Limpieza/rollback local:** detener servicios de prueba cuando termine la sesión. No borrar volúmenes o bases sin confirmar que solo contienen fixtures; para migraciones, usar forward-fix revisado y no editar migraciones ya aplicadas.

## Resultado

Anotar build/version, migración aplicada, origen, evento, paso, resultado, error funcional y enlace/captura sin secretos ni PII. No se usa base Supabase productiva, cuentas reales ni correos externos sin consentimiento durante este quickstart.

## Destino de invitaciones y verificacion por evento

El panel de accesos envia el slug del evento elegido. El backend comprueba que el correo mantenga ese permiso antes de enviar el enlace. Configura `PUBLIC_FRONTEND_URL_TEDX` y `PUBLIC_FRONTEND_URL_INNOVATION_WEEK` en cada entorno; ambas son obligatorias para crear enlaces. Si falta una, la API responde `FRONTEND_URL_UNAVAILABLE` y no envia un correo mal dirigido. En local, `npm run start:local` define TEDx en `http://localhost:3000` e Innovation Week en `http://localhost:5173`. Las URLs de produccion deben ser HTTPS y pertenecer a los dominios desplegados de cada sitio.
