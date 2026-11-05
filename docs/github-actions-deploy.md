# GitHub Actions deployment model

## Production flow

Each deployable repository builds a Linux/amd64 image on a push to `main`, transfers that immutable commit-tagged image over SSH, then recreates only its Compose service. Deployment steps share a server-side `flock` lock, update only that service's image tag in `.env`, check health, and restore the previous tag and container if verification fails.

| Repository | Workflow | Image tag in server `.env` | Compose service |
| --- | --- | --- | --- |
| `innovation-week-avatar-2d` | `deploy-production.yml` | `AVATAR_SERVICE_IMAGE_TAG`, `AVATAR_EDITOR_IMAGE_TAG` | `avatar-service`, `avatar-editor` |
| `innovation-week-web` | `deploy-production.yml` | `INNOVATION_IMAGE_TAG` | `innovation-web` |
| `tedx-ucb-landing` | `deploy-production.yml` | `TEDX_IMAGE_TAG` | `tedx-web` |
| `Tedxucb-2026-backend` | `deploy-production.yml` | `BACKEND_IMAGE_TAG` | `backend` (migrations run first) |
| `IDEATHON` | `ideathon.yml` | Root-managed digest overlay | `ideathon-web` |

The Avatar integration contract is a TypeScript package, not a container. Its workflow verifies the package on `main`; consumers must vendor a released contract version before their own production workflow can include a contract change.

## GitHub configuration

Set these repository secrets on each deployable repository:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_SSH_KEY_PASSPHRASE`
- `DEPLOY_KNOWN_HOSTS`

Also set `GOOGLE_CLIENT_ID` on the TEDx and Innovation Week frontend repositories. These builds embed the public OAuth web client ID; no OAuth client secret belongs in a frontend build.

Every deployable repository has its own encrypted Ed25519 key. Its server `authorized_keys` entry forces a service-specific deployment command and disables forwarding and interactive shells. Image streams arrive over that restricted SSH session; the runner does not receive a general server shell key.

IDEATHON uses the additional secrets `IDEATHON_DEPLOY_KEY`, `IDEATHON_DEPLOY_KEY_PASSPHRASE`, and `IDEATHON_KNOWN_HOSTS`, plus repository variables `IDEATHON_DEPLOY_ENABLED=true`, `IDEATHON_DEPLOY_HOST`, and `IDEATHON_DEPLOY_USER`. Its existing immutable GHCR image build, latest-main check, digest pinning, media checks, and rollback remain in place; pushes to `main` deploy automatically to the `production-auto` environment.

## Server scope

The workflows use the server entrypoints `/home/adminkaaiya/.local/bin/tedx-platform-deploy` and `/home/adminkaaiya/.local/bin/ideathon-release-entry`, with the Compose project at `/home/adminkaaiya/projects/tedx-facultyweek-platform/compose.yaml` and the existing project `.env`. They do not rebuild or restart PostgreSQL, Redis, Caddy, Porerekua, or Amazonia. Image streams are not persisted as tar files, and old immutable images remain available for rollback.
