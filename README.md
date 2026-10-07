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
| 1 | Fondation frontend : Vite, Tailwind v4, shadcn/ui, Layout (sidebar + header), dashboard avec données fictives, FR/EN, thème sombre/clair | ✅ |
| 2 | Backend FastAPI (`proxmoxer`, `docker`), auth, API réelle | ⏳ |
| 3 | Pages VMs / LXC / Docker / stockage / réseau, actions (start/stop…) | ⏳ |
| 4 | Packaging : `install.sh` (Proxmox & Ubuntu), Docker Compose, releases GitHub | ⏳ |

## Stack

- **Frontend** : React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), Recharts, lucide-react, React Router
- **Backend (à venir)** : Python FastAPI, `proxmoxer`, `docker`

## Développement / Development

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans frontend/dist
```

Ajouter un composant shadcn/ui : `npx shadcn@latest add dialog` (config dans `frontend/components.json`).

## Structure

```
frontend/
├── components.json          # config shadcn/ui
├── vite.config.ts           # alias @ → src, proxy /api → :8000
└── src/
    ├── index.css            # tokens du thème (sombre/clair)
    ├── components/
    │   ├── ui/              # composants shadcn/ui
    │   ├── brand/           # logo NovaPanel
    │   └── dashboard/       # cartes métriques, graphiques, listes
    ├── data/mock.ts         # données fictives (Sprint 1)
    ├── hooks/               # useLiveMetrics, useTheme
    ├── i18n/                # traductions FR / EN
    ├── layout/              # Layout, Sidebar, Header, navigation
    └── pages/               # Dashboard, ComingSoon
```

## Licence

MIT — voir [LICENSE](LICENSE).
