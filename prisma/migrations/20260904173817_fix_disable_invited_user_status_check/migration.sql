-- Bug real detectado en la prueba manual de endpoints (2026-09-04):
-- POST /users/:id/disable devolvía 500 al deshabilitar una cuenta INVITED
-- (creada por POST /users, aún sin password_hash porque no aceptó su
-- invitación) -- el CHECK "password_required_unless_invited" exigía
-- password_hash no nulo para CUALQUIER estado que no fuera INVITED,
-- incluido DISABLED. El contrato (usuarios-y-roles.md) no documenta esa
-- excepción: deshabilitar debe funcionar para cualquier cuenta, incluida
-- una invitación nunca aceptada (revocarla es el caso de uso obvio).
ALTER TABLE "users" DROP CONSTRAINT "password_required_unless_invited";

ALTER TABLE "users" ADD CONSTRAINT "password_required_unless_invited"
  CHECK ("status" IN ('INVITED', 'DISABLED') OR "password_hash" IS NOT NULL);
