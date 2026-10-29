# Empaquetado de la plataforma

El stack de servidor está definido en `compose.yaml`: PostgreSQL, Redis,
migración one-shot, API compartida, TEDx, Innovation Week, IDEATHON, Avatar 2D API y
editor. El gateway Caddy existente se configura por separado con
`caddy-routes.caddyfile`; no se debe reemplazar el gateway compartido con el
proyecto de Amazonia.

## Construir imágenes

Desde el backend, con Docker Buildx disponible y los cinco repositorios en
revisiones comprometidas:

```powershell
.\deploy\package-images.ps1 `
  -Tag release-YYYYMMDD `
  -WebLandingRoot 'C:\Documents\SoftwareDevelopment\WebLanding'
```

El script construye imágenes `linux/amd64`, las exporta a TAR en
`deploy/artifacts/` y escribe `manifest-<tag>.txt` con las revisiones fuente,
tamaño y SHA-256. Rechaza cambios trackeados sin commit y marca si una fuente
contiene archivos no trackeados. Verificar el manifiesto antes de transferir
los archivos.
El `GOOGLE_CLIENT_ID` público de ambos frontends debe existir y coincidir;
ningún secreto de servidor se incorpora a las imágenes. El manifiesto registra
el commit y el hash de los archivos locales sin seguimiento que puedan entrar
al contexto. Un tag existente queda ligado a esas fuentes: no se puede
reutilizar para otra revisión ni sobrescribir una imagen; crea un tag nuevo.

Si la red de build inspecciona TLS con una CA privada confiable, se puede
pasar el certificado PEM con `-BuildCaFile 'C:\ruta\ca.pem'`. El script lo
monta como secreto BuildKit solo durante la instalación de dependencias y el
build TEDx que descarga Google Fonts; no desactiva la validación TLS ni copia
la CA a las imágenes finales. No guardar certificados privados o
credenciales en el repositorio o en los TAR.

## Carga en el servidor

Transferir los seis TAR, el manifiesto y `server.env.example`; comprobar sus
SHA-256 y cargarlos con `docker load`. En el directorio del stack del servidor,
copiar `server.env.example` como `.env` y completar los placeholders con los
valores del entorno. La plantilla contiene nombres y valores de ejemplo, nunca
credenciales reales. Configurar `IMAGE_TAG` con el tag empaquetado y confirmar
que la red externa `tedx-facultyweek-edge` ya está conectada al Caddy existente. Aplicar las
migraciones con el servicio `migrate` y luego levantar el stack:

`IMAGE_TAG` sigue definiendo Avatar 2D e IDEATHON. Se pueden actualizar backend,
Innovation y TEDx por separado con `BACKEND_IMAGE_TAG`,
`INNOVATION_IMAGE_TAG` y `TEDX_IMAGE_TAG`; vacíos heredan `IMAGE_TAG`.
El override de backend aplica tanto al API como al job `migrate`. Antes de
levantar el stack, revisar la interpolación sin imprimir valores con
`docker compose --env-file .env -f compose.yaml config -q`.

```sh
docker compose --env-file .env -f compose.yaml up -d
```

La primera ejecución debe seguir el runbook de deploy con backup, estado de
migraciones y pruebas de salud antes de habilitar tráfico. No ejecutar
`down -v` ni modificar la red, volúmenes o configuración del proyecto
existente de Amazonia.


## IDEATHON

IDEATHON es actualmente una SPA informativa independiente, sin inicio de sesion ni llamadas a la API compartida. El empaquetado requiere Bun 1.4+ en el equipo de build, ejecuta una instalacion congelada y compila `dist` antes de crear la imagen Nginx. El host Caddy es `ideathon.sis-ucb.site`; Cloudflare necesita un registro `A` proxied con ese nombre hacia `201.131.41.89`. Caddy enruta internamente al servicio `ideathon-web:80`.

La biblioteca de videos queda desactivada hasta que esten disponibles los MP4 aprobados. La ruta `/videos`, sus entradas de navegacion y llamadas desde las paginas redirigen a Inicio o estan ocultas. El manifiesto y la implementacion se conservan para rehabilitar la seccion al restaurar los archivos.
