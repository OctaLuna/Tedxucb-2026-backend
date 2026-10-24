# Continuacion de integracion local — 23 de octubre de 2026

> Estado actualizado: consultar [avance-integracion-2026-10-23.md](./avance-integracion-2026-10-23.md). Esa nota supersede los pendientes de Avatar 2D y agenda que aparecen mas abajo y registra la corrida global de backend posterior.

## Verificaciones de esta continuacion

- Backend: `npm run build` completado correctamente.
- Innovation Week: `npm run build` completado correctamente; 12 archivos de prueba y 29 pruebas aprobaron.
- TEDx: `pnpm build` completado correctamente (Next.js produjo salida estatica y compilacion TypeScript exitosa).
- Avatar 2D: `npm run build` completado correctamente; una suite de servicio y cuatro pruebas aprobaron.
- Servicios locales respondieron correctamente: API `http://localhost:3100/api/v1/health`, TEDx `http://localhost:3000/`, Innovation Week `http://localhost:5173/` y Avatar 2D `http://localhost:4002/ready`.

## Estado de contratos entre componentes

- Innovation Week ya usa el backend para Google, `/me`, eventos permitidos, apodo compartido, agenda y speakers públicos. El editor 2D se ofrece como personalización opcional.
- TEDx usa el mismo backend para Google, renovación/cierre de sesión, `/me`, `/me/events` y apodo. Su consulta de speakers usa el backend; la agenda y administración de contenido aún están pendientes.
- Los builds no validan un inicio de sesión Google real: ambos frontends carecen de un OAuth Client ID válido para desarrollo.
- El servicio 2D aún guarda documentos bajo un token invitado del navegador. La referencia no tiene propietario backend y no se recupera al cambiar de navegador o dispositivo. No persistir como avatar global hasta añadir una operación autenticada de claim/session, validar pertenencia y definir resolución de conflictos entre documentos existentes.
- Las pruebas del servicio de avatar confirman actualmente aislamiento entre tokens invitados, control de revisión e idempotencia; no cubren identidad de cuenta.
- La pantalla de administración de En Vivo de Innovation Week conserva operaciones locales para configuración, selección destacada, quiz y medios. El backend no tiene contrato persistido para toda esa estructura; no traducir esos objetos directamente a `Activity` porque tienen semánticas distintas.

## Próximos pasos de implementación

1. Completar inventario de rutas y modelos event-scoped; comprobar Swagger contra ambos consumidores.
2. Diseñar y probar el protocolo de propiedad Avatar 2D entre JWT del backend y SQLite del proveedor; actualizar el paquete del contrato y ambos consumidores.
3. Integrar los endpoints existentes de agenda y speakers del frontend TEDx; después modelar por separado la configuración del espacio En Vivo.
4. Cerrar login y correo reales en entorno local/staging con OAuth Client ID y SMTP autorizados.
5. Ejecutar recorridos de navegador para registro, apodo duplicado, scope por evento, logout, refresh y recuperación de avatar.

Las migraciones y verificaciones de base de datos deben seguir limitadas a PostgreSQL local aislado; no ejecutar contra Supabase.
