#!/usr/bin/env bash
# ============================================================================
# Préparation d'un VPS OVHcloud neuf (Debian 12 ou Ubuntu 24.04) pour mon50ccetmoi.
# À lancer UNE fois, en root, depuis le dépôt cloné :
#   sudo sovereign-core/deploy/install.sh
#
# Ce que fait le script :
#   - installe Docker (dépôt officiel) et git
#   - pare-feu : seuls SSH, HTTP et HTTPS entrent
#   - mises à jour de sécurité automatiques
#   - 2 Go de swap si le serveur n'en a pas
#   - crée sovereign-core/.env avec des secrets neufs (mot de passe de la base,
#     clés JWT, phrase de chiffrement des sauvegardes) — jamais écrasé s'il existe
#   - programme la sauvegarde chaque nuit à 3 h 30
# Il ne démarre rien : il reste à compléter .env (clés S3, domaine), voir deploy/README.md.
# ============================================================================
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$(dirname "$0")/lib.sh"

[ "$(id -u)" -eq 0 ] || die "lancez ce script en root (sudo)"
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
    debian|ubuntu) ;;
    *) die "système non prévu : ${PRETTY_NAME:-inconnu} (Debian 12 ou Ubuntu 24.04 attendu)" ;;
esac
export DEBIAN_FRONTEND=noninteractive

log "1/6 Paquets de base"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git openssl ufw unattended-upgrades cron

log "2/6 Docker (dépôt officiel)"
if ! command -v docker >/dev/null 2>&1; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

log "3/6 Pare-feu (SSH, HTTP, HTTPS seulement)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
# Note : Docker ouvre lui-même les ports qu'il publie. Seul Caddy en publie (80 et 443) ;
# la base et l'API n'en publient aucun (voir docker-compose.vps.yml).

log "4/6 Mises à jour de sécurité automatiques"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

log "5/6 Swap"
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "6/6 Fichier .env et sauvegarde nocturne"
if [ -e "$ENV_FILE" ]; then
    log "$ENV_FILE existe déjà : laissé tel quel."
else
    "$CORE_DIR/deploy/make-env.sh"
fi

cat > /etc/cron.d/mon50cc-backup <<EOF
# Sauvegarde chiffrée de la base mon50ccetmoi, chaque nuit à 3 h 30
30 3 * * * root $CORE_DIR/deploy/backup.sh >> /var/log/mon50cc-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/mon50cc-backup

log "Préparation terminée. Étapes suivantes : deploy/README.md (compléter .env, DNS, démarrage)."
