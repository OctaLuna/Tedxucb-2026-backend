#!/usr/bin/env bash
# Server-side forced command for per-repository GitHub Actions deploy keys.
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo 'Invalid deployment target.' >&2
  exit 2
fi
target=$1
original_command=${SSH_ORIGINAL_COMMAND:-}
digest=
if [[ "$target" == backend ]]; then
  read -r tag digest extra <<< "$original_command"
  if [[ ! "$tag" =~ ^[0-9a-f]{40}$ || ! "$digest" =~ ^sha256:[0-9a-f]{64}$ || -n "${extra:-}" ]]; then
    echo 'Invalid immutable release identity.' >&2
    exit 2
  fi
else
  tag=$original_command
  if [[ ! "$tag" =~ ^[0-9a-f]{40}$ ]]; then
    echo 'Invalid immutable image tag.' >&2
    exit 2
  fi
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
if [[ "$target" == backend ]]; then
  "${compose[@]}" config --quiet
  cid=$("${compose[@]}" ps -aq backend)
  if [[ -z "$cid" ]]; then
    echo 'Deployment refused: the existing backend container could not be identified.' >&2
    exit 7
  fi
  project_label=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$cid")
  service_label=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$cid")
  active_image=$(docker inspect --format '{{.Config.Image}}' "$cid")
  old_tag=$(sed -n 's/^BACKEND_IMAGE_TAG=//p' .env | tail -n 1)
  if [[ -z "$old_tag" ]]; then old_tag=$(sed -n 's/^IMAGE_TAG=//p' .env | tail -n 1); fi
  if [[ "$project_label" != tedx-facultyweek-platform || "$service_label" != backend || "$active_image" != "tedx-platform-backend:$old_tag" || ! "$old_tag" =~ ^[A-Za-z0-9_.-]+$ ]]; then
    echo 'Deployment refused: the active container, Compose labels, and configured backend image do not agree.' >&2
    exit 7
  fi
  if ! docker image inspect "tedx-platform-backend:$old_tag" >/dev/null 2>&1; then
    echo 'Deployment refused: the previous backend image required for rollback is unavailable.' >&2
    exit 8
  fi
fi
if [[ "$target" == backend ]]; then
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  available_mb=$(df -Pm "$docker_root" | awk 'NR == 2 { print $4 }')
  if [[ ! "$available_mb" =~ ^[0-9]+$ ]] || (( available_mb < 2048 )); then
    echo 'Deployment refused: at least 2048 MiB must be available for Docker images.' >&2
    exit 5
  fi
fi

backup=$(mktemp)
cp .env "$backup"
chmod 600 "$backup"
updated=0
service_may_have_changed=0
finish() {
  rc=$?
  trap - EXIT
  rollback_rc=0
  if (( rc != 0 && updated )); then
    if ! cp "$backup" .env; then
      rollback_rc=1
    elif (( service_may_have_changed )) && { ! "${compose[@]}" config --quiet || ! "${compose[@]}" up -d --no-deps --force-recreate "${services[@]}"; }; then
      rollback_rc=1
    else
      if [[ "$target" == backend ]]; then
        restored=0
        for attempt in $(seq 1 36); do
          ready=1
          for service in "${services[@]}"; do
            cid=$("${compose[@]}" ps -q "$service")
            state=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || true)
            health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || true)
            if [[ "$state" != running || "$health" != healthy ]]; then ready=0; fi
          done
          if (( ready )); then restored=1; break; fi
          sleep 5
        done
        if (( ! restored )); then rollback_rc=1; fi
      fi
    fi
    if (( rollback_rc == 0 )); then
      if (( service_may_have_changed )) && [[ "$target" == backend ]]; then
        echo 'The previous release was restored and its health was verified.' >&2
      elif (( service_may_have_changed )); then
        echo 'The previous release configuration was restored.' >&2
      else
        echo 'No service replacement was completed; the prior service remains active.' >&2
      fi
    else
      echo 'AUTOMATIC ROLLBACK FAILED: the previous release could not be verified.' >&2
      rc=70
    fi
  fi
  rm -f "$backup"
  exit "$rc"
}
trap finish EXIT

gzip -dc | docker load
if [[ "$target" == backend ]]; then
  image="tedx-platform-backend:$tag"
  revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")
  architecture=$(docker image inspect --format '{{.Architecture}}' "$image")
  if [[ "$revision" != "$tag" || "$architecture" != amd64 ]]; then
    echo 'Loaded image does not match the requested commit or linux/amd64 architecture.' >&2
    exit 6
  fi
fi

for key in "${keys[@]}"; do
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${tag}|" .env
  else
    printf '\n%s=%s\n' "$key" "$tag" >> .env
  fi
done
if [[ "$target" == backend ]]; then
  if grep -q '^BACKEND_IMAGE_DIGEST=' .env; then
    sed -i "s|^BACKEND_IMAGE_DIGEST=.*|BACKEND_IMAGE_DIGEST=$digest|" .env
  else
    printf '\nBACKEND_IMAGE_DIGEST=%s\n' "$digest" >> .env
  fi
fi
updated=1
"${compose[@]}" config --quiet
if (( migrate )); then "${compose[@]}" run --rm --no-deps migrate; fi
service_may_have_changed=1
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
      state=$(docker inspect --format '{{.State.Status}}' "$cid")
      if [[ "$target" == backend ]]; then
        printf '%s %s %s %s\n' "$service" "$tag" "$digest" "$state"
      else
        printf '%s %s %s\n' "$service" "$tag" "$state"
      fi
    done
    exit 0
  fi
  sleep 5
done
echo 'Deployment health verification timed out.' >&2
exit 1
