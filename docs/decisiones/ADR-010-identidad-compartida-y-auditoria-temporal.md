# ADR-010: identidad compartida y auditoría temporal

**Estado:** identidad compartida aprobada; auditoría temporal requiere ratificación del mantenedor antes de producción.
**Fecha:** 2026-10-23.

## Contexto

TEDxUCB e Innovation Week compartirán usuarios y apodos mediante identidad Google validada por el backend. El acceso a eventos será independiente. El producto prioriza implementar primero registro, autorización por evento y administración funcional. El mantenedor indicó que, en esta primera etapa funcional, no se agreguen escrituras de auditoría a las acciones nuevas de vínculo Google, whitelist, invitación y cambio de scope.

El Artículo V de `memory/constitution.md` establece que ninguna acción sensible ocurre sin auditoría. Por tanto, esta decisión introduce una excepción al principio vigente y no puede ocultarse como una mera elección de implementación.

## Decisión

- Una cuenta global se asocia a Google `sub` verificado; el apodo es global y único.
- El permiso se asigna por email y evento; una nueva autorización selecciona ambos eventos por defecto.
- El link de invitación vence a los tres días y no concede permiso por sí mismo; el email debe estar ya en whitelist.
- No añadir auditoría nueva para vínculo Google, whitelist, invitación o scope en la fase funcional. No retirar registros de auditoría preexistentes ni modificar trazabilidad de otras operaciones, selección o ledger.
- Antes de producción, el mantenedor debe aprobar una enmienda que acote esta excepción o decidir implementar auditoría. Sin esa decisión el release queda bloqueado.

## Consecuencias

La interfaz puede mostrar estado actual, pero el sistema no tendrá historial fiable de quién vinculó identidades o cambió scopes durante la etapa funcional. Si aparece un abuso, no se podrá reconstruir la secuencia con el `audit_log`. Esta limitación se acepta solo para desarrollo/pruebas y queda como gate de release; no se confunde con auditoría del ledger.

## Revisión requerida

Actualizar estado de este ADR y la constitución antes de producción. Determinar retención y campos mínimos de evento (`actor`, acción, correo minimizado/hash cuando proceda, eventId, timestamp), autorización de lectura y registro de revocación. No almacenar tokens de invitación ni secretos en auditoría.
