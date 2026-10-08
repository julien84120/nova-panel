# Clés SSH pour le mode Docker Compose

Ce dossier est monté **en lecture seule** dans le conteneur (`/ssh`) puis copié dans `~/.ssh`
de l'utilisateur `nova` avec les bons droits. Tout son contenu (sauf ce README et `config.example`)
est ignoré par git.

Placez-y :

| Fichier | Rôle |
| --- | --- |
| `config` | alias SSH (copiez `config.example`) |
| `novapanel_ed25519` | clé privée dédiée à NovaPanel |
| `known_hosts` | empreinte du serveur Docker (`ssh-keyscan -H <ip> > known_hosts`, puis vérifiez-la) |

Dans `config`, utilisez des chemins `~/.ssh/...` (et non `/Users/...` ou `/root/...`).
