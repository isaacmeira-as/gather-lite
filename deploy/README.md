# Deploy na AWS (uma instância, HTTPS automático)

O app é um processo Node com SQLite e uploads em disco, então uma instância só
resolve para um time inteiro. Caddy cuida do certificado (Let's Encrypt) e do
WebSocket.

## 1. Domínio
Escolha um subdomínio, por exemplo `office.suaempresa.com`. Você vai apontá-lo
para o IP da instância (registro A). Se o domínio estiver no Route 53, crie o
registro lá; senão, no provedor do domínio.

## 2. Instância
- EC2 **t3.small** (2 vCPU, 2 GB) ou Lightsail de US$ 10 já aguenta dezenas de pessoas.
- Imagem Ubuntu 24.04. Volume de 20 GB.
- Security group: liberar **80** e **443** (e 22 só para o seu IP).
- Aloque um **Elastic IP** e associe à instância, para o DNS não mudar.
- Em "User data", cole o conteúdo de `deploy/ec2-user-data.sh` depois de editar
  `DOMAIN` (e `REPO`, se o repositório for privado use um token na URL).

Alternativa sem user data: entre por SSH e rode os mesmos comandos do script.

## 3. DNS
Crie o registro A `office.suaempresa.com → Elastic IP`. Em alguns minutos o
Caddy emite o certificado sozinho e `https://office.suaempresa.com` abre.

## 4. Google
Com o domínio no ar, crie a credencial OAuth (redirect
`https://office.suaempresa.com/api/auth/google/callback`), preencha
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_MODE=google`,
`GOOGLE_ALLOWED_DOMAINS=suaempresa.com` em `/opt/gather-lite/.env` e rode:

```bash
cd /opt/gather-lite && docker compose -f deploy/docker-compose.yml up -d
```

## Operação
```bash
cd /opt/gather-lite
git pull && docker compose -f deploy/docker-compose.yml up -d --build   # atualizar
docker compose -f deploy/docker-compose.yml logs -f app                 # logs
docker run --rm -v gather-lite_gather-data:/data -v $PWD:/backup alpine tar czf /backup/backup.tgz /data   # backup do banco e uploads
```

Para escalar além de uma instância: `REDIS_URL` para várias réplicas do app atrás
de um ALB (sticky sessions não são necessárias para o WebSocket do Colyseus com
Redis), e trocar SQLite por Postgres na camada `src/server/spaces.ts`.
