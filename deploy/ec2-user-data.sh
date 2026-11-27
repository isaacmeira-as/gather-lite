#!/bin/bash
# User data para Ubuntu 24.04 (EC2 ou Lightsail). Instala Docker, clona o repositório e sobe o app com HTTPS.
# Antes de usar: troque REPO, DOMAIN e os segredos abaixo; aponte o DNS do domínio para o IP elástico da instância.
set -euxo pipefail
REPO="https://github.com/isaacmeira-as/gather-lite.git"
DOMAIN="office.exemplo.com"
JWT_SECRET="$(openssl rand -hex 32)"

apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

mkdir -p /opt && cd /opt
git clone "$REPO" gather-lite || (cd gather-lite && git pull)
cd gather-lite
cat > .env <<ENV
DOMAIN=$DOMAIN
PUBLIC_URL=https://$DOMAIN
JWT_SECRET=$JWT_SECRET
NODE_ENV=production
# Preencha depois de criar a credencial no Google Cloud e rode: docker compose -f deploy/docker-compose.yml up -d
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_MODE=
ALLOW_GUESTS=1
GOOGLE_ALLOWED_DOMAINS=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
ENV
docker compose -f deploy/docker-compose.yml up -d --build
