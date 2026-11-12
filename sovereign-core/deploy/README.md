# Mise en ligne sur un VPS OVHcloud (petit budget)

Tout tourne sur **un seul VPS** : l'API, la base PostgreSQL + PostGIS, et Caddy pour le HTTPS.
Les preuves de la Boîte Noire et les sauvegardes partent dans l'**Object Storage** OVHcloud.

| Élément | Offre OVHcloud | Prix indicatif (novembre 2026) |
| --- | --- | --- |
| Serveur | VPS-2 (4 vCores, 8 Go, 75 Go NVMe), Debian 12 ou Ubuntu 24.04 | 8,65 € TTC / mois |
| Preuves + sauvegardes | Object Storage (projet Public Cloud), région GRA | ≈ 0,014 € HT / Go / mois, trafic sortant gratuit |

Fichiers :

- `../docker-compose.vps.yml` — les 3 services ; la base n'a **aucun port ouvert**.
- `Caddyfile` — HTTPS automatique (Let's Encrypt) pour le domaine de l'API.
- `env.vps.example` — modèle du fichier `.env`.
- `install.sh` — prépare un VPS neuf (Docker, pare-feu, mises à jour auto, swap, secrets, sauvegarde nocturne).
- `backup.sh` / `restore.sh` — sauvegarde chiffrée et restauration de la base.

## 1. Dans l'espace client OVHcloud

1. **Public Cloud › Object Storage › Créer un conteneur** (API S3, région **GRA**) :
   - `mon50cc-preuves` — **cocher Object Lock à la création** (impossible à activer ensuite) ;
   - `mon50cc-sauvegardes` — sans Object Lock.
2. **Utilisateurs S3** : un utilisateur pour les preuves, un autre pour les sauvegardes.
   Noter clé d'accès et clé secrète de chacun (affichées une seule fois).
3. **Bare Metal Cloud › VPS** : commander un VPS-2, Debian 12 ou Ubuntu 24.04, région France.
4. **DNS** (chez Amen.fr tant que le domaine y est) : un enregistrement **A**
   `api.mon50ccetmoi.com` → adresse IP du VPS.

## 2. Sur le VPS (connexion SSH)

```bash
sudo git clone https://github.com/xavierlechanu-netizen/xavierlechanu-netizen.github.io.git /opt/mon50cc
cd /opt/mon50cc
sudo sovereign-core/deploy/install.sh
```

Le script affiche une **phrase de chiffrement des sauvegardes** : la recopier tout de suite
dans un gestionnaire de mots de passe. Sans elle, aucune sauvegarde n'est relisible.

Compléter ensuite `sovereign-core/.env` (`sudo nano sovereign-core/.env`) :
les 4 clés S3, et le domaine si ce n'est pas `api.mon50ccetmoi.com`.

## 3. Démarrer

```bash
cd /opt/mon50cc/sovereign-core
sudo docker compose -f docker-compose.vps.yml up -d --build
curl https://api.mon50ccetmoi.com/api/v1/health      # → {"status":"OK",...}
```

L'API **refuse de démarrer** si le conteneur des preuves n'a pas Object Lock : c'est voulu.

## 4. Sauvegardes

- Automatiques chaque nuit à 3 h 30 (journal : `/var/log/mon50cc-backup.log`).
- Chiffrées sur le serveur avant l'envoi, vérifiées (relues) avant d'être gardées.
- Conservées 7 jours sur le VPS et 30 jours dans l'Object Storage (`BACKUP_RETENTION_DAYS`).

```bash
sudo sovereign-core/deploy/backup.sh                    # sauvegarde immédiate
sudo sovereign-core/deploy/restore.sh --list            # sauvegardes disponibles
sudo sovereign-core/deploy/restore.sh <nom> --yes       # REMPLACE la base par cette sauvegarde
```

**Tester une restauration une fois par trimestre** : une sauvegarde jamais relue n'est pas une sauvegarde.

## 5. Mettre à jour l'application

```bash
cd /opt/mon50cc && sudo git pull
cd sovereign-core && sudo docker compose -f docker-compose.vps.yml up -d --build
```

## Sécurité

- Entrent seulement SSH (22), HTTP (80) et HTTPS (443) ; la base n'est joignable que par l'API.
- `.env` est en lecture pour root seulement et n'est jamais mis dans git.
- Conseillé : connexion SSH par clé uniquement (`PasswordAuthentication no` dans `/etc/ssh/sshd_config`).
- Les preuves ne peuvent être ni modifiées ni supprimées pendant 5 ans, même par nous (Object Lock Compliance).

## Limites de cette formule

Une seule machine : si elle tombe, l'appli est coupée le temps de la relancer (aucune donnée
perdue grâce aux sauvegardes et au coffre des preuves). Quand les revenus le permettront :
base PostgreSQL gérée par OVHcloud et deux serveurs derrière un répartiteur de charge
(voir `../CAHIER_DES_CHARGES_OVHCLOUD.md`).
