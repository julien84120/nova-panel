"""Interface en ligne de commande : `novapanel <commande>` (ou `python -m app <commande>`)."""

from __future__ import annotations

import argparse
import getpass
import os
import sys

from app import __version__
from app.auth import AuthError, AuthService
from app.config import get_settings
from app.db import Database


def _auth() -> AuthService:
    s = get_settings()
    return AuthService(Database(s.nova_data_dir / "novapanel.db"), s)


def _read_password(args) -> str:
    if args.password_stdin:
        return sys.stdin.readline().rstrip("\n")
    while True:
        p1 = getpass.getpass("Mot de passe (10 caractères min.) : ")
        p2 = getpass.getpass("Confirmez : ")
        if p1 == p2:
            return p1
        print("Les mots de passe ne correspondent pas, recommencez.", file=sys.stderr)


def cmd_serve(_args) -> int:
    import uvicorn

    s = get_settings()
    uvicorn.run(
        "app.main:app",
        host=s.nova_bind_host,
        port=s.nova_bind_port,
        proxy_headers=True,
        forwarded_allow_ips=s.nova_trusted_proxies,
        server_header=False,
    )
    return 0


def cmd_create_admin(args) -> int:
    auth = _auth()
    username = args.username or input("Nom d'utilisateur [admin] : ").strip() or "admin"
    try:
        auth.create_user(username, _read_password(args))
    except AuthError as e:
        print(f"Erreur : {e.code}", file=sys.stderr)
        return 1
    print(f"Compte « {username} » créé.")
    return 0


def cmd_reset_password(args) -> int:
    auth = _auth()
    try:
        auth.set_password(args.username, _read_password(args))
    except AuthError as e:
        print(f"Erreur : {e.code}", file=sys.stderr)
        return 1
    print(f"Mot de passe de « {args.username} » modifié ; ses sessions ont été fermées.")
    return 0


def cmd_list_users(_args) -> int:
    for u in _auth().list_users():
        print(u)
    return 0


def _drop_privileges() -> None:
    """Dans le conteneur, `docker compose exec` lance la CLI en root : on bascule vers l'utilisateur
    applicatif pour que la base SQLite reste lisible par le service."""
    target = os.environ.get("NOVA_RUN_AS")
    if not target or os.geteuid() != 0:
        return
    import pwd

    pw = pwd.getpwnam(target)
    os.setgid(pw.pw_gid)
    os.setuid(pw.pw_uid)
    os.environ["HOME"] = pw.pw_dir


def main(argv: list[str] | None = None) -> int:
    _drop_privileges()
    parser = argparse.ArgumentParser(prog="novapanel", description="NovaPanel — Proxmox & Docker dashboard")
    parser.add_argument("--version", action="version", version=f"NovaPanel {__version__}")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("serve", help="démarrer le serveur (par défaut)").set_defaults(func=cmd_serve)

    p = sub.add_parser("create-admin", help="créer un compte administrateur")
    p.add_argument("--username")
    p.add_argument("--password-stdin", action="store_true", help="lire le mot de passe sur l'entrée standard")
    p.set_defaults(func=cmd_create_admin)

    p = sub.add_parser("reset-password", help="réinitialiser le mot de passe d'un compte")
    p.add_argument("username")
    p.add_argument("--password-stdin", action="store_true")
    p.set_defaults(func=cmd_reset_password)

    sub.add_parser("list-users", help="lister les comptes").set_defaults(func=cmd_list_users)

    args = parser.parse_args(argv)
    return getattr(args, "func", cmd_serve)(args)


if __name__ == "__main__":
    sys.exit(main())
