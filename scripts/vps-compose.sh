#!/bin/sh
# Use an explicit production project/file; never load the development .env.
set -eu
: "${SWI_CONFIG_DIR:?Set SWI_CONFIG_DIR to the absolute external configuration directory}"
case "$SWI_CONFIG_DIR" in /*) ;; *) echo 'SWI_CONFIG_DIR must be absolute.' >&2; exit 1 ;; esac
export SWI_CONFIG_DIR
# The saved release/hostname are authoritative, even in an old operator shell.
unset PUBLIC_HOST PUBLIC_ORIGIN SITE_HOST SWI_VERSION SWI_LAYOUT SWI_CADDYFILE SWI_CADDY_OPTIONS \
  SWI_BACKEND_IMAGE SWI_FRONTEND_IMAGE COMPOSE_PROFILES
# Use Compose's direct builder; Bake may reject an external secret-file path.
export COMPOSE_BAKE=false
# Builds compile with a throwaway Server Actions key; the real one is runtime-only.
SWI_BUILD_KEY=${SWI_BUILD_KEY:-$(head -c 32 /dev/urandom | base64 | tr -d '\n')}
export SWI_BUILD_KEY
repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
setting() { sed -n "s/^$1='\{0,1\}\([^']*\)'\{0,1\}$/\1/p" "$SWI_CONFIG_DIR/compose.env" 2>/dev/null | tail -n 1; }
tls=$(setting SWI_CADDY_TLS) storage=$(setting SWI_STORAGE)
# Profiles: the split layout runs the website container; Caddy and bundled Silo
# run unless an existing reverse proxy or an external bucket replaces them.
profiles=''
[ "$(setting SWI_LAYOUT)" != split ] || profiles='split'
[ "$tls" = proxy ] || profiles=${profiles:+$profiles,}caddy
[ "$storage" = external ] || profiles=${profiles:+$profiles,}silo
export COMPOSE_PROFILES="$profiles"
# Prepended in reverse: the base file first, then the overrides.
if [ "$storage" = external ]; then set -- --file "$repo_dir/compose.external-storage.yml" "$@"; fi
case "$tls" in
  internal) set -- --file "$repo_dir/compose.internal-tls.yml" "$@" ;;
  proxy) set -- --file "$repo_dir/compose.external-proxy.yml" "$@" ;;
esac
set -- --file "$repo_dir/compose.production.yml" "$@"
exec docker compose --project-name "${SWI_PROJECT_NAME:-swi}" --env-file "$SWI_CONFIG_DIR/compose.env" "$@"
