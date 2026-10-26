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
  Aún no está cargado en el host. Antes de promoverlo se requiere backup
  verificable y ejecutar controladamente las dos migraciones faltantes.
- El `.env` remoto tiene modo `0600`. Su `IMAGE_TAG` declara `release-20261023`,
  aunque los contenedores activos usan `release-20261024`. No imprimir ni
  copiar valores de secretos; corregir esta deriva al preparar el upgrade para
  evitar un rollback accidental al ejecutar Compose.
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

## Siguiente paso seguro

Antes de sustituir imágenes del piloto: obtener backup consistente de la base,
validar su archivo y restaurarlo en una instancia de verificación aislada;
comprobar espacio suficiente sin hacer prune global; alinear `IMAGE_TAG` con la
versión elegida; cargar los cinco TAR y verificar SHA-256; aplicar migraciones
una sola vez; arrancar y comprobar healthchecks. Mantener las imágenes y
volúmenes anteriores para rollback. No habilitar pruebas externas hasta que
los dominios resuelvan y se cierre SMTP.
