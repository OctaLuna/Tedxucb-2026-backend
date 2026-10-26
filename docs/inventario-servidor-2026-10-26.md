# Inventario remoto de solo lectura — 2026-10-26

Este inventario registra el estado observado antes de actualizar el piloto. Se
consultó el host por SSH con la clave dedicada y se verificó la identidad del
host contra `known_hosts`. En esta fase no se escribieron archivos ni se
reiniciaron servicios remotos.

## Host y capacidad

- Linux x86_64, Docker Engine 29.8.1 y Docker Compose 5.5.1.
- 4 vCPU, aproximadamente 3.73 GiB de RAM.
- Disco raíz de 48 GiB, con 8.0 GiB libres (83% ocupado).
- `docker system df` mostró 16.11 GiB de build cache reclaimable. No se limpió:
  el cache es global y puede pertenecer a otros proyectos del host.

## Estado del piloto

- El proyecto `tedx-facultyweek-platform` ya existe en
  `/home/adminkaaiya/projects/tedx-facultyweek-platform`.
- Están arriba y saludables PostgreSQL, Redis, backend, TEDx, Innovation Week
  y Avatar 2D API; el editor también está arriba. El job `migrate` finalizó con
  código 0.
- Los contenedores activos usan `release-20261024`. El estado de Prisma indica
  que la base está al día con las 27 migraciones incluidas en esa imagen.
- El paquete local posterior es `release-20261026-v2` y tiene 29 migraciones.
  Se cargó después de respaldar la base y ejecutar controladamente las dos
  migraciones faltantes.
- El `.env` remoto tenía modo `0600` y declaraba `release-20261023`, aunque los
  contenedores activos usaban `release-20261024`. Antes de promover, se guardó
  copia privada modo `0600` y se actualizó el tag a `release-20261026-v2`. No se
  imprimieron ni copiaron valores de secretos al repositorio.
- Los nombres de variables presentes incluyen `SMTP_HOST` y `SMTP_PORT`, pero
  el inventario no encontró `SMTP_USER`, `SMTP_PASSWORD` ni `MAIL_FROM`. La
  prueba de entrega SMTP externo sigue pendiente según la secuencia acordada.

## Gateway, DNS y aislamiento

- El Caddy existente está en el proyecto `caddy`, usa la red externa
  `tedx-facultyweek-edge` y su configuración valida correctamente.
- Caddy ya declara `tedxucb.sis-ucb.site` y `semana-fcef.sis-ucb.site`, con
  rutas hacia backend, frontends y Avatar 2D.
- Ambos dominios no resolvieron por DNS ni desde el host ni desde el entorno
  local; las solicitudes HTTPS terminaron en error de resolución, por lo que
  TLS y login por origen público aún no se pueden comprobar.
- La aplicación mantiene su red privada y volúmenes con prefijo propio. No se
  modificó Caddy, redes, contenedores ni volúmenes.
- `porerekua-form-1` pertenece al proyecto Compose `porerekua` y a su propio
  directorio. Se dejó intacto junto con todo el proyecto Porerekua/Amazonia.

## Promoción v2 y resultado

- Se generó un `pg_dump -Fc` privado de 121067 bytes, modo `0600`; `pg_restore`
  pudo listar el archivo y restaurarlo sin errores en un PostgreSQL temporal
  aislado. Esa instancia temporal y su volumen anónimo se eliminaron al acabar.
- Avatares 2D y uploads se archivaron por separado y se validó la integridad de
  ambos TAR. Se guardó también una copia del `.env` con modo `0600` antes de
  corregir su `IMAGE_TAG` desfasado.
- Los cinco TAR y el manifiesto se transfirieron al directorio privado del
  proyecto. SHA-256 remoto coincidió con el manifiesto local para cada imagen
  y para el manifiesto; no se usó `docker prune`.
- Se detuvieron únicamente los cinco servicios de aplicación del proyecto
  durante la migración. PostgreSQL y Redis conservaron sus volúmenes activos.
  Se aplicaron `20261024020000_seed_innovation_week_program` y
  `20261026130000_serialize_last_admin_guard`; Prisma reporta 29 migraciones al
  día. La base conserva 2 eventos y 0 usuarios; el cronograma carga 26 elementos.
- El proyecto está en `release-20261026-v2`: PostgreSQL, Redis, backend,
  Innovation Week, TEDx y Avatar API están saludables; el editor responde
  HTTP 200. Innovation Week y TEDx superaron sus healthchecks HTTP; Caddy
  validó sin cambios de configuración. Porerekua/Amazonia permaneció intacto.
- El host quedó con aproximadamente 6.6 GiB libres de 48 GiB. No se eliminó el
  build cache global aunque Docker lo reporta reclaimable.

Quedan pendientes DNS para ambos hosts, certificados TLS, login Google real en
los orígenes desplegados y la configuración/prueba de entrega SMTP externa.
Hasta resolver DNS no puede hacerse aceptación HTTP pública; hasta cerrar
SMTP, las invitaciones por correo no están listas para uso público.
