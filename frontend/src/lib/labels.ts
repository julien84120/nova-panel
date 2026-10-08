import type { Lang } from "@/i18n/translations"

/** Libellés lisibles des types de tâches Proxmox les plus courants. */
const TASK_LABELS: Record<string, { fr: string; en: string }> = {
  vzdump: { fr: "Sauvegarde", en: "Backup" },
  qmstart: { fr: "Démarrage VM", en: "VM start" },
  qmstop: { fr: "Arrêt forcé VM", en: "VM stop" },
  qmshutdown: { fr: "Extinction VM", en: "VM shutdown" },
  qmreboot: { fr: "Redémarrage VM", en: "VM reboot" },
  qmsuspend: { fr: "Suspension VM", en: "VM suspend" },
  qmresume: { fr: "Reprise VM", en: "VM resume" },
  qmigrate: { fr: "Migration VM", en: "VM migration" },
  qmsnapshot: { fr: "Snapshot VM", en: "VM snapshot" },
  qmclone: { fr: "Clonage VM", en: "VM clone" },
  qmcreate: { fr: "Création VM", en: "VM creation" },
  qmdestroy: { fr: "Suppression VM", en: "VM destroy" },
  vzstart: { fr: "Démarrage CT", en: "CT start" },
  vzstop: { fr: "Arrêt forcé CT", en: "CT stop" },
  vzshutdown: { fr: "Extinction CT", en: "CT shutdown" },
  vzreboot: { fr: "Redémarrage CT", en: "CT reboot" },
  vzcreate: { fr: "Création CT", en: "CT creation" },
  vzmigrate: { fr: "Migration CT", en: "CT migration" },
  vncproxy: { fr: "Console VNC", en: "VNC console" },
  termproxy: { fr: "Terminal", en: "Terminal" },
  aptupdate: { fr: "Mise à jour APT", en: "APT update" },
  startall: { fr: "Démarrage global", en: "Start all" },
  stopall: { fr: "Arrêt global", en: "Stop all" },
  imgdel: { fr: "Suppression d'image", en: "Image delete" },
  download: { fr: "Téléchargement", en: "Download" },
}

export const taskLabel = (type: string, lang: Lang) => TASK_LABELS[type]?.[lang] ?? type

/** Traduit les types de stockage Proxmox en libellés courts. */
export const STORAGE_TYPES: Record<string, string> = {
  dir: "Directory",
  lvm: "LVM",
  lvmthin: "LVM-Thin",
  zfspool: "ZFS",
  zfs: "ZFS over iSCSI",
  nfs: "NFS",
  cifs: "SMB/CIFS",
  pbs: "Proxmox Backup",
  rbd: "Ceph RBD",
  cephfs: "CephFS",
  iscsi: "iSCSI",
  btrfs: "Btrfs",
  rootfs: "Système",
}
