# Estrategia de pruebas y aprobación

Estas son pruebas de comportamiento a implementar después de fijar las decisiones pendientes y completar DTO/contratos. Conforme al Artículo III, deben escribirse, revisarse y ser aprobadas antes del código; confirmar fase Red. Se ejecutarán contra PostgreSQL real cuando dependan de unicidad, FK o transacciones. Solo se simulan Google, SMTP, reloj y otros sistemas fuera de control, detrás del adaptador concreto acordado.

## Contrato HTTP

1. Token Google válido, de audiencia e issuer permitidos, identifica una cuenta y produce sesión backend con respuesta tipada.
2. Firma incorrecta, expiración, issuer/audience/nonce/state incorrectos, email no verificado o `hd` no institucional rechazan sesión con error estable.
3. Dominio `ucb.edu.bo` exacto se permite conforme al claim Workspace validado; subdominio parecido, sufijo malicioso y casing/normalización quedan cubiertos.
4. Google externo sin whitelist no recibe acceso a evento ni detalles que permitan enumeración.
5. Usuario externo con permiso para evento A accede A y recibe denegación al evento B. Permiso agregado a ambos habilita ambos; revocado deja de habilitar el recurso en requests posteriores.
6. Cuenta deshabilitada nunca obtiene ni renueva sesión. Los estados `PENDING`, `REJECTED` e `INVITED` siguen la política de producto explícita; asociación no cambia estado/rol.
7. `/me` refleja nickname/status/event scope del token actual y no filtra secretos o claims innecesarios.
8. Guardar propio nickname acepta borde mínimo válido y rechaza 0/1/2 caracteres, símbolos, espacios, controles, key duplicada, con status/error contractual.
9. Dos cuentas concurrentes guardan el mismo apodo: una tiene éxito y otra `409 NICKNAME_TAKEN`; una fila única en DB.
10. Admin autorizado puede listar/crear/actualizar/revocar scopes; usuario sin rol ADMIN recibe 403 en cada método. ADMIN deshabilitado tampoco gestiona.
11. Crear permiso sin `eventIds` expande ambos eventos conforme al contrato; con un UUID se crea solo ese evento; UUID inexistente rechaza sin escrituras parciales.
12. Invitación exige whitelist preexistente, correo válido y admin; token se persiste hasheado, email sale después de commit, expira a tres días, enlace vencido/revocado no habilita acceso.
13. Caída SMTP mantiene estado whitelist definido y devuelve estado de entrega observable; retry del request no crea invitación/token duplicados inesperados.
14. Datos de evento cruzados (activity A, category B; selection run A, event B; query por UUID de otro evento) se rechazan incluso ante request autenticado con scope diferente.
15. CORS permite orígenes exactos de dev/prod; rechaza dominio parecido, origen null no previsto y credenciales con wildcard.
16. El refresh se rota, logout revoca y una cuenta deshabilitada no renueva; almacenamiento cross-origin sigue contrato escogido.

## Integración backend y PostgreSQL

1. Dos logins simultáneos del mismo Google `sub` crean una sola identidad y un solo usuario.
2. Email que coincide con cuenta existente vincula solo si evidencia de titularidad del contrato se cumple. Nunca fusiona por string coincidente con Google no autoritativo.
3. Colisión Google sub ya asociado a otra cuenta da conflicto controlado y no reasigna la identidad.
4. Nickname unique sobre canonical key permanece correcto con casing/NFKC/Unicode según regla final, incluidas solicitudes en paralelo.
5. Al cambiar de evento en endpoints, ninguna consulta devuelve filas del evento anterior; se verifican content, activities, attendance, ledger/progress y selection según alcance implementado.
6. Backfill conserva conteos, relaciones y totales de points; no actualiza/elimina transacciones ni revierte eventos anteriores.
7. Seeds de eventos se pueden ejecutar dos veces sin duplicar raíz o permisos.

## Frontend Innovation Week

1. Carga fría consulta/restaura sesión backend; estados loading, no auth, token vencido, error API y perfil incompleto son visibles y recuperables.
2. Botón Google completa el flujo aprobado y no ofrece modo admin demo con privilegio efectivo.
3. Sin nickname se bloquea navegación participante hasta guardado; nickname ocupado se comunica y permite reintentar; tras éxito se muestra mismo apodo en recarga.
4. Cerrar sesión revoca refresh de backend y limpia estado sensible local según contrato.
5. Usuario con scopes distintos solo ve/consulta eventos habilitados; manipular URLs/UUID no aumenta acceso.
6. Avatar 2D se puede abrir tras onboarding, abandonar sin guardarlo y continuar; fallos del proveedor no bloquean registro.
7. Firebase no aparece en módulos, dependencia/bundle, config Vite, tests o requests una vez completada su retirada; avatares y borradores preexistentes se preservan.
8. Panel admin refleja lista, alta manual, envío de invitación, selectores de evento, modificación y revocación; respuesta no se simula localmente.

## Verificación manual / release

- Quickstart ejecutado primero en local con cuentas de pruebas, dos eventos y PostgreSQL aislado.
- Navegadores independientes y ambos orígenes confirmados después de elegir almacenamiento de sesión.
- Entorno staging con dos redirect URIs allowlisted; tokens/secretos revisados sin imprimirlos.
- Migración ensayada sobre dump sanitizado representativo, reporte de huérfanos/collisions revisado y rollback/forward-fix ensayado.
- Revisión antes de production sobre excepción de auditoría, datos personales, configuración Google y claim de avatar.

## Exclusiones

No enviar invitaciones reales ni modificar Supabase desde tests. No probar el cambio de propietario del avatar hasta aprobar su contrato. No testear identidad Google real en CI: usar tokens firmados/fixtures de verificación en adaptador de proveedor, conservando pruebas de integración del mapping, transacciones, whitelist y sesión. La validación criptográfica se cubre con claves de fixture y casos de issuer/audience/expiración, no mock de DB.
