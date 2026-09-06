#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

readonly IMAGE="${IMAGE:-ghcr.io/txngjr/carelink-argocd-web}"
readonly PLATFORM="${PLATFORM:-linux/amd64}"
readonly GHCR_USERNAME="${GHCR_USERNAME:-txngjr}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
# Never pass the registry token into docker build/buildx child environments.
export -n GHCR_TOKEN 2>/dev/null || true

pull=0
no_cache=0
print_only=0
push=1

usage() {
  cat <<'EOF'
Build the CareLink Docker image using the current Git commit SHA.

Default image:
  ghcr.io/txngjr/carelink-argocd-web:sha-<7-char-git-sha>

The script does NOT modify deploy/k8s/kustomization.yaml. After a successful
build/push it prints the exact newName/newTag values for you to copy manually.

Usage:
  ./build.sh [--pull] [--no-cache]
  ./build.sh --local
  ./build.sh --print-only

Options:
  --pull        Always pull newer base images before building.
  --no-cache    Build without using Docker/BuildKit cache.
  --local       Build and load the image into the local Docker daemon; do not push.
  --print-only  Print the resolved image/tag and Kustomize values without building.
  -h, --help    Show this help.

Environment:
  IMAGE          Image repository. Default: ghcr.io/txngjr/carelink-argocd-web
  PLATFORM       Target platform. Default: linux/amd64
  GHCR_USERNAME  GHCR username. Default: txngjr
  GHCR_TOKEN     Optional GitHub token with packages:write. If omitted, Docker's
                 existing ghcr.io login is used.

Examples:
  GHCR_TOKEN=github_pat_xxx ./build.sh
  ./build.sh --local
  ./build.sh --print-only
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

while (($#)); do
  case "$1" in
    --pull) pull=1 ;;
    --no-cache) no_cache=1 ;;
    --local) push=0 ;;
    --print-only) print_only=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown option: $1"
      ;;
  esac
  shift
done

require_command git

[[ -d "${SCRIPT_DIR}/.git" ]] || die "Git repository not found at ${SCRIPT_DIR}"
[[ -f "${SCRIPT_DIR}/Dockerfile" ]] || die "Dockerfile not found at ${SCRIPT_DIR}/Dockerfile"

FULL_SHA="$(git -C "${SCRIPT_DIR}" rev-parse --verify HEAD)"
SHORT_SHA="$(git -C "${SCRIPT_DIR}" rev-parse --short=7 HEAD)"
readonly FULL_SHA SHORT_SHA
readonly IMAGE_TAG="sha-${SHORT_SHA}"
readonly IMAGE_REF="${IMAGE}:${IMAGE_TAG}"

print_result() {
  cat <<EOF

============================================================
CareLink image
============================================================
Image: ${IMAGE_REF}
Commit: ${FULL_SHA}

Copy this into deploy/k8s/kustomization.yaml:

images:
  - name: carelink-app
    newName: ${IMAGE}
    newTag: ${IMAGE_TAG}
============================================================
EOF
}

if [[ -n "$(git -C "${SCRIPT_DIR}" status --porcelain)" ]]; then
  printf 'warning: repository has uncommitted changes.\n' >&2
  printf 'warning: image tag %s represents HEAD (%s), but the image will also contain current working-tree changes.\n' "${IMAGE_TAG}" "${SHORT_SHA}" >&2
fi

if ((print_only)); then
  print_result
  exit 0
fi

require_command docker
docker buildx version >/dev/null 2>&1 || die 'Docker Buildx is not available. Enable/install Docker Buildx first.'

# If a token is supplied, log in without exposing it in process arguments.
# Otherwise the build uses the existing Docker credential for ghcr.io.
if [[ -n "${GHCR_TOKEN}" ]]; then
  printf '%s' "${GHCR_TOKEN}" | docker login ghcr.io --username "${GHCR_USERNAME}" --password-stdin >/dev/null
  unset GHCR_TOKEN
fi

build_cmd=(
  docker buildx build
  --file "${SCRIPT_DIR}/Dockerfile"
  --platform "${PLATFORM}"
  --tag "${IMAGE_REF}"
  --label "org.opencontainers.image.revision=${FULL_SHA}"
  --label "org.opencontainers.image.source=https://github.com/TxngJr/carelink-argocd"
)

((pull)) && build_cmd+=(--pull)
((no_cache)) && build_cmd+=(--no-cache)

if ((push)); then
  build_cmd+=(--push)
  printf 'Building and pushing %s for %s ...\n' "${IMAGE_REF}" "${PLATFORM}" >&2
else
  # --load supports a single-platform image, which is the project default.
  [[ "${PLATFORM}" != *,* ]] || die '--local supports only one PLATFORM value'
  build_cmd+=(--load)
  printf 'Building and loading %s locally for %s ...\n' "${IMAGE_REF}" "${PLATFORM}" >&2
fi

build_cmd+=("${SCRIPT_DIR}")
"${build_cmd[@]}"

print_result
