# NovaPanel — backend

API FastAPI qui collecte les métriques de **Proxmox VE** (`proxmoxer`, jeton API) et d'un **hôte Docker distant via SSH** (`docker` + `paramiko`).

```bash
cd backend
uv sync                      # ou : python3 -m venv .venv && .venv/bin/pip install -e .
cp .env.example .env         # puis complétez
uv run python -m app         # http://127.0.0.1:8000/api/docs
uv run pytest
```

Voir le README racine pour la création du jeton Proxmox et la configuration SSH.
