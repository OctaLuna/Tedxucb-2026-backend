-- La migración histórica del ledger revoca permisos del rol local ted.
-- Solo se ejecuta al crear el clúster efímero de pruebas.
CREATE ROLE ted NOLOGIN;
