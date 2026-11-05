#!/usr/bin/env bash
set -Eeuo pipefail

home=/home/adminkaaiya
bin="$home/.local/bin"
ssh_dir="$home/.ssh"
install -d -m 700 "$bin"
install -m 700 /tmp/remote-compose-deploy.sh "$bin/tedx-platform-deploy"
install -m 700 /tmp/ideathon-github-entry.sh "$bin/ideathon-release-entry"
chmod 600 "$ssh_dir/authorized_keys"

append_key() {
  local command=$1 pub=$2
  if ! grep -Fq "$pub" "$ssh_dir/authorized_keys"; then
    printf 'restrict,command="%s" %s\n' "$command" "$pub" >> "$ssh_dir/authorized_keys"
  fi
}

append_key "$bin/tedx-platform-deploy backend" "$(cat /tmp/gha-deploy-backend.pub)"
append_key "$bin/tedx-platform-deploy tedx" "$(cat /tmp/gha-deploy-tedx.pub)"
append_key "$bin/tedx-platform-deploy innovation" "$(cat /tmp/gha-deploy-innovation.pub)"
append_key "$bin/tedx-platform-deploy avatar-2d" "$(cat /tmp/gha-deploy-avatar2d.pub)"
append_key "$bin/ideathon-release-entry" "$(cat /tmp/gha-deploy-ideathon.pub)"

chmod 600 "$ssh_dir/authorized_keys"
rm -f /tmp/remote-compose-deploy.sh /tmp/ideathon-github-entry.sh /tmp/gha-deploy-*.pub
echo 'Restricted GitHub Actions deployment keys installed.'
