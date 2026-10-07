<p align="center">
  <img src="frontend/public/favicon.svg" width="64" alt="NovaPanel" />
</p>

<h1 align="center">NovaPanel</h1>

<p align="center">
  Tableau de bord open-source pour piloter un hyperviseur <b>Proxmox VE</b> et des serveurs <b>Ubuntu / Docker</b>.<br/>
  <i>Open-source dashboard to manage a Proxmox VE hypervisor and Ubuntu / Docker servers.</i>
</p>

![NovaPanel — dashboard](docs/screenshots/dashboard-dark.png)

## Statut / Status

| Sprint | Contenu | État |
| --- | --- | --- |
| 1 | Fondation frontend : Vite, Tailwind v4, shadcn/ui, Layout (sidebar + header), dashboard, FR/EN, thème sombre/clair | ✅ |
| 2 | Backend FastAPI : Proxmox (`proxmoxer`, jeton API lecture seule) + Docker via SSH (`docker`, `paramiko`), dashboard branché sur l'API, mode démo automatique | ✅ |
| 2.5 | Authentification (obligatoire avant toute exposition réseau) | ⏳ |
| 3 | Pages VMs / LXC / Docker / stockage / réseau, actions (start/stop…) | ⏳ |
| 4 | Packaging : `install.sh` (Proxmox & Ubuntu), Docker Compose, releases GitHub | ⏳ |

## Stack

- **Frontend** : React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), Recharts, lucide-react, React Router
- **Backend** : Python 3.11+, FastAPI, `proxmoxer`, `docker`, `paramiko`, géré avec [uv](https://docs.astral.sh/uv/)

## Développement / Development

```bash
# Terminal 1 — API (http://127.0.0.1:8000/api/docs)
cd backend
uv sync
cp .env.example .env      # puis complétez (voir ci-dessous)
uv run python -m app

# Terminal 2 — interface (http://localhost:5173, /api proxifié vers :8000)
cd frontend
npm install
npm run dev
```

Sans `.env` complété, chaque source passe automatiquement en **mode démo** (badge « Données fictives »).
Tests : `cd backend && uv run pytest` · `cd frontend && npm run lint && npm run build`.

## Configuration des sources

### 1. Proxmox VE (testé sur 9.2) — jeton API en lecture seule

Dans l'interface Proxmox :

1. **Datacenter → Permissions → Users → Add** : utilisateur `novapanel`, realm `Proxmox VE authentication server` (`pve`).
2. **Datacenter → Permissions → API Tokens → Add** : utilisateur `novapanel@pve`, Token ID `novapanel`, laissez **Privilege Separation** coché. Copiez le secret (affiché une seule fois).
3. **Datacenter → Permissions → Add → API Token Permission** : chemin `/`, token `novapanel@pve!novapanel`, rôle **`PVEAuditor`**, *Propagate* coché.

Ou en ligne de commande sur le nœud :

```bash
pveum user add novapanel@pve --comment "NovaPanel (lecture seule)"
pveum user token add novapanel@pve novapanel --privsep 1      # affiche le secret
pveum acl modify / --tokens 'novapanel@pve!novapanel' --roles PVEAuditor
```

Puis dans `backend/.env` :

```ini
PROXMOX_HOST=192.168.1.10
PROXMOX_USER=novapanel@pve
PROXMOX_TOKEN_NAME=novapanel
PROXMOX_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PROXMOX_VERIFY_SSL=false   # certificat auto-signé par défaut
```

### 2. Serveur Ubuntu / Docker via SSH (ex. instance Oracle Cloud)

NovaPanel utilise **un alias SSH** défini dans `~/.ssh/config` de l'utilisateur qui exécute le backend : le SDK Docker (`ssh://alias`) et la sonde de métriques (paramiko) lisent la même configuration.

```sshconfig
# ~/.ssh/config
Host nova-oracle
    HostName 152.70.x.x          # IP publique de l'instance
    User ubuntu
    IdentityFile ~/.ssh/novapanel_ed25519
    IdentitiesOnly yes
```

```bash
# Sur votre machine : clé dédiée, puis copie de la clé publique
ssh-keygen -t ed25519 -f ~/.ssh/novapanel_ed25519 -C novapanel
ssh-copy-id -i ~/.ssh/novapanel_ed25519.pub nova-oracle
ssh nova-oracle 'docker version --format {{.Server.Version}}'   # doit répondre sans mot de passe

# Sur le serveur : l'utilisateur SSH doit pouvoir parler au démon Docker
sudo usermod -aG docker ubuntu     # puis se reconnecter
```

> La première connexion `ssh nova-oracle` enregistre l'empreinte du serveur dans `known_hosts`.
> Le backend **refuse** les hôtes inconnus (pas d'acceptation automatique d'empreinte).
>
> ⚠️ Être membre du groupe `docker` équivaut à un accès root sur ce serveur : utilisez une clé dédiée et protégez-la.

Puis dans `backend/.env` :

```ini
DOCKER_SSH_HOST=nova-oracle
DOCKER_DISPLAY_NAME=oracle-docker
```

## API

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/api/health` | État de l'API et de chaque source (`live` / `demo` / `error`) |
| GET | `/api/dashboard` | Instantané complet : résumé, hôtes, invités, tâches, historique 1 h |
| POST | `/api/dashboard/refresh` | Force une collecte immédiate |
| GET | `/api/hosts` | Nœuds Proxmox + hôtes Docker |
| GET | `/api/guests?type=qemu\|lxc\|docker&host=` | VMs, conteneurs LXC et Docker |

Un collecteur en tâche de fond interroge les sources toutes les `NOVA_POLL_INTERVAL` secondes (10 par défaut) ;
les routes lisent le dernier instantané, quel que soit le nombre d'onglets ouverts.
L'historique du graphique est amorcé avec les RRD Proxmox de la dernière heure.

> 🔒 **Sécurité** : il n'y a pas encore d'authentification. L'API écoute sur `127.0.0.1` par défaut —
> ne l'exposez pas sur le réseau avant le sprint « Authentification ».

Ajouter un composant shadcn/ui : `npx shadcn@latest add dialog` (config dans `frontend/components.json`).

## Structure

```
backend/
├── .env.example             # modèle de configuration (copier en .env)
├── app/
│   ├── main.py              # routes FastAPI (+ service du frontend compilé)
│   ├── collector.py         # collecte périodique + historique
│   ├── config.py            # réglages (.env)
│   ├── schemas.py           # modèles Pydantic
│   └── services/            # proxmox.py, docker_host.py, demo.py
└── tests/
frontend/
├── components.json          # config shadcn/ui
├── vite.config.ts           # alias @ → src, proxy /api → :8000
└── src/
    ├── index.css            # tokens du thème (sombre/clair)
    ├── components/
    │   ├── ui/              # composants shadcn/ui
    │   ├── brand/           # logo NovaPanel
    │   └── dashboard/       # cartes métriques, graphiques, listes
    ├── lib/api.ts           # client et types de l'API
    ├── hooks/               # DashboardProvider (polling), useTheme
    ├── i18n/                # traductions FR / EN
    ├── layout/              # Layout, Sidebar, Header, navigation
    └── pages/               # Dashboard, ComingSoon
```

## Licence

MIT — voir [LICENSE](LICENSE).
