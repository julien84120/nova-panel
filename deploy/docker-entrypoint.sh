#!/bin/sh
# Démarre en root uniquement pour préparer les fichiers, puis bascule vers l'utilisateur "nova".
set -eu

NOVA_USER="${NOVA_RUN_AS:-nova}"
HOME_DIR="$(getent passwd "$NOVA_USER" | cut -d: -f6)"

if [ "$(id -u)" = "0" ]; then
  # Clés/config SSH montées en lecture seule dans /ssh → copie avec les bons droits
  # (ssh refuse une clé privée lisible par d'autres ou appartenant à un autre utilisateur).
  if [ -d /ssh ] && [ -n "$(ls -A /ssh 2>/dev/null)" ]; then
    rm -rf "$HOME_DIR/.ssh"
    install -d -m 700 -o "$NOVA_USER" -g "$NOVA_USER" "$HOME_DIR/.ssh"
    for f in /ssh/*; do
      [ -f "$f" ] || continue
      case "$(basename "$f")" in
        README*|*.example) continue ;;
        *.pub|known_hosts|config) mode=644 ;;
        *) mode=600 ;;
      esac
      install -m "$mode" -o "$NOVA_USER" -g "$NOVA_USER" "$f" "$HOME_DIR/.ssh/$(basename "$f")"
    done
  fi
  chown -R "$NOVA_USER:$NOVA_USER" "${NOVA_DATA_DIR:-/data}"
  exec setpriv --reuid="$NOVA_USER" --regid="$NOVA_USER" --init-groups env HOME="$HOME_DIR" "$@"
fi

exec "$@"
