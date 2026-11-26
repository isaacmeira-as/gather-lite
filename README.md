# Gather Lite

Clone do [Gather](https://gather.town) sem a parte de vídeo/áudio: espaços
virtuais 2D multiplayer com contas, convites, papéis, várias salas ligadas por
portais, chat por proximidade com histórico, objetos interativos (quadro,
enquete, timer, iframe…), mapmaker completo, avatares customizáveis, minimapa,
mobile e moderação. Tudo roda local com um comando; o banco é SQLite (módulo
nativo do Node, sem dependências nativas) e não há nenhum asset binário.

## Rodando

```bash
npm install
npm run build     # compila o cliente para dist/
npm start         # servidor + cliente em http://localhost:2567
```

Crie uma conta, crie um espaço e compartilhe o link `/s/<slug>`. Espaços
públicos aceitam visitantes sem cadastro; privados exigem link de convite.

Desenvolvimento com hot reload:

```bash
npm run dev       # servidor em :2567 (tsx watch) + Vite em :5173
```

Variáveis de ambiente: veja `.env.example`. Em produção `JWT_SECRET` é obrigatório.

## Testes

```bash
npm test                # unitários + end-to-end
npm run test:unit       # mapa, auth, espaços/convites/histórico (SQLite em memória)
npm run test:e2e        # sobe o servidor com DB temporário e abre vários navegadores headless
```

O e2e cobre: cadastro e login pela tela inicial, criação de espaço, visitante em
espaço público, movimento validado e previsto no cliente, colisão entre avatares
e modo fantasma, click-to-move, chat perto/todos/zona/spotlight, rate limit,
mensagem direta, acenar, "chamar aqui", seguir, emotes, status, sentar, edição de
perfil/avatar, nota, quadro compartilhado, enquete, timer, imagem, histórico
após reload, permissões de visitante, promoção a moderador, mapmaker (zonas,
objetos, spawn, formulário da UI) com persistência, portais e troca de sala pelo
seletor, criar/renomear/importar/apagar salas, kick e ban, espaço privado com
convite (conta e visitante), painel de membros/convites, localizar, reconexão e
joystick mobile.

## Funcionalidades

| Gather | Aqui |
|---|---|
| Contas | ✅ e-mail + senha (scrypt), token assinado, visitante sem cadastro |
| Espaços com URL própria | ✅ `/s/<slug>`, público ou privado, vários por conta |
| Papéis | ✅ dono, moderador, membro, visitante; promoção pelo card ou painel |
| Convites | ✅ links com papel, validade e limite de usos; `/invite/<token>` |
| Moderação | ✅ remover, banir/desbanir, ao vivo e pela API |
| Várias salas por espaço | ✅ mapas no SQLite, portais entre salas, seletor no topo |
| Mapmaker | ✅ piso e objetos, zonas (arrastar), objetos interativos, portais, spawn, criar/renomear/apagar salas, importar/exportar JSON |
| Objetos | ✅ nota, link, iframe, imagem, quadro compartilhado, enquete, timer compartilhado, emote |
| Chat | ✅ proximidade (raio 4), zonas privadas, spotlight, todos, DM; histórico por usuário no banco; rate limit |
| Social | ✅ localizar, seguir, acenar, "chamar aqui", aviso quando alguém chega perto, badge no título, sons |
| Avatares | ✅ pele, cabelo, cor, camisa, calça, acessório; editor na home e no jogo |
| Movimento | ✅ grade, previsão no cliente, colisão entre avatares, modo fantasma (G), sentar |
| Mobile | ✅ joystick virtual, layout responsivo |
| Reconexão | ✅ 20 s para voltar sem perder o avatar; segunda aba substitui a primeira |
| Relógio e clima | ✅ hora local do espaço, clima real por cidade (Open-Meteo, sem chave) com chuva, neve, neblina, nuvens e tempestade; ciclo dia/noite pelo nascer e pôr do sol; dono pode fixar clima e hora |
| Visual | ✅ paredes com face e topo, objetos altos com profundidade, tiles animados (água, fonte, telas), iluminação com luminárias e janelas, sombras, contorno nos avatares, ciclo de caminhada em 4 quadros, partículas, transições entre salas, sons sintetizados |
| Onboarding | ✅ tour de 4 passos na primeira visita, dicas nos botões |
| Vídeo / áudio | ❌ de propósito |

Sem internet o clima cai num modo simulado (indicado no relógio). Em automação (Playwright) os efeitos pesados ficam desligados, a não ser com `?fx=1`.

## Arquitetura

```
src/shared/     tiles.ts, map.ts (mapa, zonas, portais, pathfinding, canHear), avatar.ts, messages.ts
src/server/     index.ts (Express + Colyseus), db.ts (node:sqlite), auth.ts, spaces.ts (regras de negócio),
                api.ts (REST), rooms/OfficeRoom.ts (uma sala Colyseus por mapa), rooms/OfficeState.ts
src/client/     main.ts (rotas /, /s/:slug, /invite/:token), pages/home.ts, net.ts, api.ts,
                scenes/OfficeScene.ts (Phaser), ui/* (DOM), textures/* (tileset e avatares em canvas)
tests/          unit/ (node:test) e e2e/ (Playwright)
```

- **Servidor autoritativo.** O cliente envia intenções; posição, colisão, zona,
  audição, portais e permissões são decididos em `OfficeRoom`. O cliente prevê o
  passo localmente e o servidor confirma ou corrige.
- **Uma sala Colyseus por (espaço, mapa)**, via `filterBy`. Trocar de mapa é sair
  de uma sala e entrar em outra com um spawn específico.
- **Persistência:** `users`, `spaces`, `maps` (JSON do mapa), `memberships`,
  `invites`, `bans`, `messages`, `object_state` (notas, enquetes, timers).
- **Auth no WebSocket:** `OfficeRoom.onAuth` valida o token e resolve o papel.

## Deploy (AWS)

O app é um único processo Node com estado em SQLite, então o caminho mais
simples é uma instância só (EC2, Lightsail ou ECS com um volume EFS/EBS):

```bash
docker build -t gather-lite .
docker run -p 2567:2567 -e JWT_SECRET=... -v gather-data:/data gather-lite
```

Coloque um ALB ou Nginx com HTTPS na frente (WebSocket passa direto). Para
mais de um processo, troque o `presence`/`driver` do Colyseus por Redis e o
SQLite por Postgres; a camada `spaces.ts` concentra todo o SQL.

## Quando quiser o "meet"

`canHear()` define o grupo de conversa de cada jogador. Derive um id de grupo
no servidor a cada mudança e, no cliente, entre e saia de uma sala do LiveKit
ou Daily quando esse id mudar.
