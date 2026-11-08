# GitHub Actions deployment model

## Production flow

The backend runs the integration workflow for pull requests to `develop` and `main`. It applies migrations to disposable PostgreSQL, runs unit/contract/integration and API e2e suites, builds the Linux/amd64 image, and checks its health endpoint in a temporary container. On `main`, the tested image is passed to a serialized release job, published to GHCR under the commit SHA, and its manifest digest is recorded.

Before deployment, the job confirms the workflow SHA is still the tip of `main`. It sends the tested image stream plus SHA and digest through the repository's restricted SSH key. The server accepts only the backend release target, checks commit label/architecture and the existing Compose project/service/image identity, records the SHA and digest in the project `.env`, runs pending migrations, and recreates only `backend`. A shared `flock` serializes releases across repositories. If health verification fails after replacement, the server restores the prior `.env` and backend image and verifies its health. Other repositories continue using their current SHA-only release command.

Create `develop` from the current `main` before opening development PRs. Pushes to `main` run CI and deploy automatically; no Vercel deletion is part of this workflow.

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

The workflows use the server entrypoints `/home/adminkaaiya/.local/bin/tedx-platform-deploy` and `/home/adminkaaiya/.local/bin/ideathon-release-entry`, with the Compose project at `/home/adminkaaiya/projects/tedx-facultyweek-platform/compose.yaml` and the existing project `.env`. The backend release does not rebuild or restart PostgreSQL, Redis, Caddy, Porerekua, or Amazonia. Its short-lived image archive is streamed over SSH and not persisted on the server; GHCR keeps the immutable SHA-tagged package and digest for reference. Old local images remain available for rollback.

## Domain and remaining provider work

The Caddy source has an additive API-only route for `kaaiya.lpz.ucb.edu.bo`; this environment could not resolve that hostname during setup. Do not reload the shared gateway or retire Vercel until DNS resolves to the VPS, the current Caddy state is checked, and HTTPS/API checks succeed. Keep the existing TEDx and Innovation Week host routes intact.

The current server Compose stack owns its PostgreSQL, Redis, and uploads volume. Provider work that remains outside that stack (including external SMTP delivery and any optional QStash usage) stays as technical debt; it is not migrated or reconfigured by the backend release workflow.
