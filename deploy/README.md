# Empaquetado de la plataforma

El stack de servidor está definido en `compose.yaml`: PostgreSQL, Redis,
migración one-shot, API compartida, TEDx, Innovation Week, Avatar 2D API y
editor. El gateway Caddy existente se configura por separado con
`caddy-routes.caddyfile`; no se debe reemplazar el gateway compartido con el
proyecto de Amazonia.

## Construir imágenes

Desde el backend, con Docker Buildx disponible y los cuatro repositorios en
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
ningún secreto de servidor se incorpora a las imágenes.

Si la red de build inspecciona TLS con una CA privada confiable, se puede
pasar el certificado PEM con `-BuildCaFile 'C:\ruta\ca.pem'`. El script lo
monta como secreto BuildKit solo durante la instalación de dependencias y el
build TEDx que descarga Google Fonts; no desactiva la validación TLS ni copia
la CA a las imágenes finales. No guardar certificados privados o
credenciales en el repositorio o en los TAR.

## Carga en el servidor

Transferir los cinco TAR y el manifiesto; comprobar sus SHA-256 y cargarlos con
`docker load`. Preparar `.env` en el servidor a partir de `.env.example`,
configurar `IMAGE_TAG` con el tag empaquetado y confirmar que la red externa
`tedx-facultyweek-edge` ya está conectada al Caddy existente. Aplicar las
migraciones con el servicio `migrate` y luego levantar el stack:

```sh
docker compose --env-file .env -f compose.yaml up -d
```

La primera ejecución debe seguir el runbook de deploy con backup, estado de
migraciones y pruebas de salud antes de habilitar tráfico. No ejecutar
`down -v` ni modificar la red, volúmenes o configuración del proyecto
existente de Amazonia.
