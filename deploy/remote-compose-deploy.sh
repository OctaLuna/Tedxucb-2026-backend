#!/usr/bin/env bash
# Server-side forced command for per-repository GitHub Actions deploy keys.
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo 'Invalid deployment target.' >&2
  exit 2
fi
target=$1
tag=${SSH_ORIGINAL_COMMAND:-}
if [[ ! "$tag" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Invalid immutable image tag.' >&2
  exit 2
fi

root=/home/adminkaaiya/projects/tedx-facultyweek-platform
compose=(docker compose --env-file .env -f compose.yaml)
case "$target" in
  backend) keys=(BACKEND_IMAGE_TAG); services=(backend); migrate=1 ;;
  tedx) keys=(TEDX_IMAGE_TAG); services=(tedx-web); migrate=0 ;;
  innovation) keys=(INNOVATION_IMAGE_TAG); services=(innovation-web); migrate=0 ;;
  avatar-2d) keys=(AVATAR_SERVICE_IMAGE_TAG AVATAR_EDITOR_IMAGE_TAG); services=(avatar-service avatar-editor); migrate=0 ;;
  *) echo 'Unknown deployment target.' >&2; exit 2 ;;
esac

exec 9>/tmp/tedx-platform-deploy.lock
flock -w 1800 9 || { echo 'Another platform deployment is running after a 30-minute wait.' >&2; exit 4; }
cd "$root"
backup=$(mktemp)
cp .env "$backup"
chmod 600 "$backup"
updated=0
finish() {
  rc=$?
  if (( rc != 0 && updated )); then
    cp "$backup" .env
    "${compose[@]}" up -d --no-deps --force-recreate "${services[@]}" || true
  fi
  rm -f "$backup"
  exit "$rc"
}
trap finish EXIT

gzip -dc | docker load
for key in "${keys[@]}"; do
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${tag}|" .env
  else
    printf '\n%s=%s\n' "$key" "$tag" >> .env
  fi
done
updated=1
"${compose[@]}" config --quiet
if (( migrate )); then "${compose[@]}" run --rm --no-deps migrate; fi
"${compose[@]}" up -d --no-deps --force-recreate "${services[@]}"

for attempt in $(seq 1 36); do
  ready=1
  for service in "${services[@]}"; do
    cid=$("${compose[@]}" ps -q "$service")
    state=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || true)
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || true)
    if [[ "$state" != running || "$health" == unhealthy ]]; then
      echo "$service did not remain healthy (state=$state health=$health)." >&2
      exit 1
    fi
    if [[ "$health" != healthy ]]; then
      if [[ "$service" == avatar-editor && "$state" == running ]]; then
        docker exec "$cid" wget -q -O /dev/null http://127.0.0.1/ || ready=0
      else
        ready=0
      fi
    fi
  done
  if (( ready )); then
    for service in "${services[@]}"; do
      cid=$("${compose[@]}" ps -q "$service")
      printf '%s %s %s\n' "$service" "$tag" "$(docker inspect --format '{{.State.Status}}' "$cid")"
    done
    exit 0
  fi
  sleep 5
done
echo 'Deployment health verification timed out.' >&2
exit 1
