#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NovaPanel — installation native (systemd) sur Debian 12/13, Proxmox VE 8/9,
# Ubuntu 22.04/24.04. Idempotent : relancez-le pour mettre à jour.
#
#   curl -fsSL https://raw.githubusercontent.com/julien84120/nova-panel/main/install.sh | sudo bash
#   # ou depuis un clone du dépôt :
#   sudo ./install.sh
#
# Options :
#   --version <vX.Y.Z|latest>  version publiée à installer (défaut : latest)
#   --source-dir <dossier>     installer depuis un dossier source (défaut : le dépôt contenant ce script)
#   --ref <branche|tag|sha>    compiler depuis GitHub à cette référence (ex. main)
#   --port <port>              port d'écoute (défaut : 8080)
#   --bind <adresse>           adresse d'écoute (défaut : 0.0.0.0)
#   --admin-user <nom>         créer ce compte admin (mot de passe demandé, ou lu dans $NOVA_ADMIN_PASSWORD)
#   --yes                      ne pose aucune question
#   --uninstall [--purge]      désinstaller (--purge supprime aussi config et données)
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

REPO="julien84120/nova-panel"
APP_DIR="/opt/novapanel"
ETC_DIR="/etc/novapanel"
ENV_FILE="$ETC_DIR/novapanel.env"
DATA_HOME="/var/lib/novapanel"
SVC_USER="novapanel"
NODE_VERSION="22.20.0"

VERSION="latest"; SOURCE_DIR=""; REF=""; PORT="8080"; BIND="0.0.0.0"
ADMIN_USER=""; ASSUME_YES=0; UNINSTALL=0; PURGE=0

c_blue=$'\e[34m'; c_green=$'\e[32m'; c_yellow=$'\e[33m'; c_red=$'\e[31m'; c_dim=$'\e[2m'; c_off=$'\e[0m'
[ -t 1 ] || { c_blue=""; c_green=""; c_yellow=""; c_red=""; c_dim=""; c_off=""; }
step() { printf '%s==>%s %s\n' "$c_blue" "$c_off" "$*"; }
ok()   { printf '%s ✓%s %s\n' "$c_green" "$c_off" "$*"; }
warn() { printf '%s ! %s%s\n' "$c_yellow" "$*" "$c_off" >&2; }
die()  { printf '%s ✗ %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }
trap 'die "échec à la ligne $LINENO (commande : $BASH_COMMAND)"' ERR

# stdin peut être le script lui-même (curl | bash) → on lit les réponses sur le terminal
ask() { # ask "question" [défaut]
  local reply
  if [ "$ASSUME_YES" = 1 ] || [ ! -r /dev/tty ]; then echo "${2:-}"; return; fi
  read -r -p "$1 " reply </dev/tty || true
  echo "${reply:-${2:-}}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --source-dir) SOURCE_DIR="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --bind) BIND="$2"; shift 2 ;;
    --admin-user) ADMIN_USER="$2"; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge) PURGE=1; shift ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "option inconnue : $1" ;;
  esac
done

[ "$(id -u)" = 0 ] || die "lancez ce script en root (sudo)."
command -v systemctl >/dev/null && [ -d /run/systemd/system ] || die "systemd est requis."

# ── Désinstallation ─────────────────────────────────────────
if [ "$UNINSTALL" = 1 ]; then
  step "Désinstallation de NovaPanel"
  systemctl disable --now novapanel.service 2>/dev/null || true
  rm -f /etc/systemd/system/novapanel.service /usr/local/bin/novapanel
  systemctl daemon-reload
  rm -rf "$APP_DIR"
  if [ "$PURGE" = 1 ]; then
    rm -rf "$ETC_DIR" "$DATA_HOME"
    userdel "$SVC_USER" 2>/dev/null || true
    ok "NovaPanel, sa configuration et ses données ont été supprimés."
  else
    ok "NovaPanel désinstallé. Conservés : $ETC_DIR et $DATA_HOME (--purge pour les supprimer)."
  fi
  exit 0
fi

# ── Vérifications système ───────────────────────────────────
. /etc/os-release
case "${ID}:${VERSION_ID:-}" in
  debian:12|debian:13|ubuntu:22.04|ubuntu:24.04|ubuntu:24.10|ubuntu:25.04|ubuntu:25.10) ;;
  *) warn "système non testé : ${PRETTY_NAME:-inconnu}. On continue quand même." ;;
esac
case "$(uname -m)" in
  x86_64|amd64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) die "architecture non supportée : $(uname -m)" ;;
esac

if [ -d /etc/pve ]; then
  warn "Ce système est un hôte Proxmox VE."
  warn "Recommandé : installer NovaPanel dans un conteneur LXC Debian plutôt que sur l'hyperviseur."
  [ "$(ask 'Installer quand même sur l hôte ? [o/N]' n)" = "o" ] || [ "$ASSUME_YES" = 1 ] || die "installation annulée."
fi

step "Installation des dépendances système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl git openssh-client tar gzip >/dev/null
ok "dépendances installées"

if ! command -v uv >/dev/null; then
  step "Installation de uv (gestionnaire Python)"
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh >/dev/null
fi
ok "uv $(uv --version | cut -d' ' -f2)"

# ── Utilisateur et dossiers ─────────────────────────────────
if ! id "$SVC_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_HOME" --create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
install -d -m 750 -o "$SVC_USER" -g "$SVC_USER" "$DATA_HOME" "$DATA_HOME/data"
install -d -m 700 -o "$SVC_USER" -g "$SVC_USER" "$DATA_HOME/.ssh"
install -d -m 755 "$APP_DIR" "$APP_DIR/releases"
install -d -m 750 -g "$SVC_USER" "$ETC_DIR"

# ── Récupération du code ────────────────────────────────────
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
SCRIPT_DIR=""
if [ -f "${BASH_SOURCE[0]:-}" ]; then SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; fi
if [ -z "$SOURCE_DIR" ] && [ -z "$REF" ] && [ -f "$SCRIPT_DIR/backend/pyproject.toml" ] && [ "$VERSION" = "latest" ]; then
  SOURCE_DIR="$SCRIPT_DIR"
fi

build_frontend() { # $1 = dossier source
  if [ -f "$1/frontend/dist/index.html" ] && [ ! -f "$1/frontend/package.json" ]; then return; fi
  step "Compilation de l'interface (Node.js $NODE_VERSION temporaire)"
  local node_dir="$TMP/node"
  mkdir -p "$node_dir"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.gz" \
    | tar -xz -C "$node_dir" --strip-components=1
  (cd "$1/frontend" && PATH="$node_dir/bin:$PATH" npm ci --no-audit --no-fund --loglevel=error >/dev/null \
    && PATH="$node_dir/bin:$PATH" npm run build >/dev/null)
  ok "interface compilée"
}

if [ -n "$SOURCE_DIR" ]; then
  SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd)"
  step "Installation depuis le dossier source $SOURCE_DIR"
  RELEASE="src-$(git -C "$SOURCE_DIR" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
  mkdir -p "$TMP/src"
  tar -C "$SOURCE_DIR" --exclude=node_modules --exclude=.venv --exclude=.git --exclude=backend/data \
      --exclude='*.env' --exclude=.env -cf - . | tar -C "$TMP/src" -xf -
  build_frontend "$TMP/src"
  SRC="$TMP/src"
elif [ -n "$REF" ]; then
  step "Téléchargement de $REPO@$REF"
  git clone -q "https://github.com/$REPO.git" "$TMP/src"
  git -C "$TMP/src" checkout -q "$REF"
  RELEASE="git-$(git -C "$TMP/src" rev-parse --short HEAD)"
  build_frontend "$TMP/src"
  SRC="$TMP/src"
else
  if [ "$VERSION" = "latest" ]; then
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
      | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1 || true)"
  fi
  if [ -n "$VERSION" ] && curl -fsSL -o "$TMP/novapanel.tar.gz" \
      "https://github.com/$REPO/releases/download/$VERSION/novapanel-$VERSION.tar.gz" 2>/dev/null; then
    step "Installation de la version $VERSION"
    if curl -fsSL -o "$TMP/novapanel.tar.gz.sha256" \
        "https://github.com/$REPO/releases/download/$VERSION/novapanel-$VERSION.tar.gz.sha256" 2>/dev/null; then
      (cd "$TMP" && sed "s#  .*#  novapanel.tar.gz#" novapanel.tar.gz.sha256 | sha256sum -c --quiet -) \
        || die "somme de contrôle invalide pour l'archive téléchargée"
      ok "archive vérifiée (SHA-256)"
    fi
    mkdir -p "$TMP/src" && tar -xzf "$TMP/novapanel.tar.gz" -C "$TMP/src" --strip-components=1
    RELEASE="$VERSION"
  else
    warn "aucune version publiée trouvée → compilation depuis la branche main"
    git clone -q --depth 1 "https://github.com/$REPO.git" "$TMP/src"
    RELEASE="git-$(git -C "$TMP/src" rev-parse --short HEAD)"
    build_frontend "$TMP/src"
  fi
  SRC="$TMP/src"
fi
[ -f "$SRC/frontend/dist/index.html" ] || die "interface compilée introuvable dans la source"

DEST="$APP_DIR/releases/$RELEASE"
rm -rf "$DEST" && mkdir -p "$DEST/frontend"
cp -a "$SRC/backend" "$DEST/backend"
cp -a "$SRC/frontend/dist" "$DEST/frontend/dist"
rm -rf "$DEST/backend/.venv" "$DEST/backend/data" "$DEST/backend/tests" "$DEST/backend/.env"

step "Installation de l'environnement Python"
export UV_PYTHON_INSTALL_DIR="$APP_DIR/python" UV_CACHE_DIR="$TMP/uv-cache"
(cd "$DEST/backend" && uv sync --frozen --no-dev --python 3.12 --quiet)
chmod -R a+rX "$DEST" "$APP_DIR/python" 2>/dev/null || true
ln -sfn "$DEST" "$APP_DIR/current"
ok "NovaPanel $RELEASE installé dans $DEST"

# Nettoyage : on garde les 3 dernières versions
{ ls -1dt "$APP_DIR"/releases/* 2>/dev/null | tail -n +4 | grep -vF "$(readlink -f "$APP_DIR/current")" | xargs -r rm -rf; } || true

# ── Configuration ───────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  step "Création de $ENV_FILE"
  {
    echo "# NovaPanel — configuration (lue par le service systemd)"
    echo "NOVA_BIND_HOST=$BIND"
    echo "NOVA_BIND_PORT=$PORT"
    echo "NOVA_DATA_DIR=$DATA_HOME/data"
    echo "NOVA_STATIC_DIR=$APP_DIR/current/frontend/dist"
    echo "NOVA_POLL_INTERVAL=10"
    echo "NOVA_DEMO=false"
    echo "# Mettre true si NovaPanel est servi en HTTPS derrière un reverse proxy"
    echo "NOVA_COOKIE_SECURE=false"
    echo "NOVA_TRUSTED_PROXIES=127.0.0.1"
    echo
    echo "# ── Proxmox VE (jeton API lecture seule, rôle PVEAuditor) ──"
    echo "PROXMOX_HOST="
    echo "PROXMOX_PORT=8006"
    echo "PROXMOX_USER=novapanel@pve"
    echo "PROXMOX_TOKEN_NAME=novapanel"
    echo "PROXMOX_TOKEN_SECRET="
    echo "PROXMOX_VERIFY_SSL=false"
    echo
    echo "# ── Docker via SSH (alias de $DATA_HOME/.ssh/config) ──"
    echo "DOCKER_SSH_HOST="
    echo "DOCKER_DISPLAY_NAME=docker-host"
  } >"$ENV_FILE"
else
  ok "configuration existante conservée ($ENV_FILE)"
fi
chown root:"$SVC_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"

# Commande d'administration : exécute la CLI en tant qu'utilisateur du service
cat >/usr/local/bin/novapanel <<EOF
#!/bin/sh
# NovaPanel CLI — ex. : sudo novapanel create-admin | reset-password <user> | list-users
[ "\$(id -u)" = 0 ] || { echo "utilisez sudo novapanel ..." >&2; exit 1; }
set -a; . $ENV_FILE; set +a
cd $DATA_HOME
exec setpriv --reuid=$SVC_USER --regid=$SVC_USER --init-groups env HOME=$DATA_HOME \\
  $APP_DIR/current/backend/.venv/bin/novapanel "\$@"
EOF
chmod 755 /usr/local/bin/novapanel

# ── Service systemd ─────────────────────────────────────────
if [ -f "$SRC/deploy/novapanel.service" ]; then
  install -m 644 "$SRC/deploy/novapanel.service" /etc/systemd/system/novapanel.service
else
  die "deploy/novapanel.service introuvable dans la source"
fi
systemctl daemon-reload
systemctl enable novapanel.service >/dev/null 2>&1
systemctl restart novapanel.service

step "Démarrage du service"
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$(. "$ENV_FILE"; echo "$NOVA_BIND_PORT")/api/health" >/dev/null 2>&1 && break
  sleep 1
done
systemctl is-active --quiet novapanel.service || { journalctl -u novapanel -n 30 --no-pager; die "le service n'a pas démarré"; }
ok "service novapanel actif"

# ── Compte administrateur ───────────────────────────────────
if [ -z "$(novapanel list-users 2>/dev/null)" ]; then
  if [ -n "$ADMIN_USER" ] && [ -n "${NOVA_ADMIN_PASSWORD:-}" ]; then
    printf '%s\n' "$NOVA_ADMIN_PASSWORD" | novapanel create-admin --username "$ADMIN_USER" --password-stdin
  elif [ "$ASSUME_YES" != 1 ] && [ -r /dev/tty ]; then
    step "Création du compte administrateur"
    user="${ADMIN_USER:-$(ask "Nom d'utilisateur [admin] :" admin)}"
    novapanel create-admin --username "$user" </dev/tty
  else
    warn "aucun compte : ouvrez l'interface et saisissez le jeton affiché par : journalctl -u novapanel | grep -A2 jeton"
  fi
fi

PORT_NOW="$(. "$ENV_FILE"; echo "$NOVA_BIND_PORT")"
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

${c_green}NovaPanel est installé.${c_off}

  Interface      : http://${IP:-<ip>}:${PORT_NOW}
  Configuration  : $ENV_FILE   ${c_dim}(puis : sudo systemctl restart novapanel)${c_off}
  Clés SSH       : $DATA_HOME/.ssh/   ${c_dim}(config, clé privée, known_hosts)${c_off}
  Logs           : journalctl -u novapanel -f
  Administration : sudo novapanel reset-password <utilisateur>
  Mise à jour    : relancez ce script · Désinstallation : --uninstall

EOF
