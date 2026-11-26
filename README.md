# Gather Lite

Clone do [Gather](https://gather.town) sem a parte de vídeo/áudio: um escritório
virtual 2D multiplayer com chat por proximidade, zonas privadas, objetos
interativos, emotes, status, minimapa e modo construção. Tudo roda local com
um único comando e não depende de nenhum asset binário (tiles e avatares são
desenhados em canvas em tempo de execução).

## Rodando

```bash
npm install
npm run build     # compila o cliente para dist/
npm start         # sobe servidor + cliente em http://localhost:2567
```

Abra http://localhost:2567 em duas abas (ou dois navegadores) e entre com nomes
diferentes.

Para desenvolver com hot reload:

```bash
npm run dev       # servidor em :2567 (tsx watch) + Vite em :5173
```

Atalhos úteis para testes: `http://localhost:2567/?name=Alice&color=ef4444&skin=2&autojoin=1`.

## Testes

```bash
npm test                # unitários + end-to-end
npm run test:unit       # lógica do mapa (colisão, zonas, audição, pathfinding)
npm run test:e2e        # sobe o servidor e abre 2–3 navegadores headless (Playwright)
```

O e2e cobre: dois jogadores se vendo, movimento validado pelo servidor, click-to-move,
chat por proximidade / zona / todos / spotlight / DM, emotes, status, sentar em cadeiras,
objetos interativos, quadro compartilhado, modo construção sincronizado e persistido,
localizar jogador, foco do chat não mover o avatar, e reconexão após queda do socket.

## Funcionalidades

| Gather | Aqui |
|---|---|
| Mapa 2D em tiles, avatar anda em grade | ✅ setas / WASD, 1 tile por 130 ms, validado no servidor |
| Clique para andar | ✅ BFS pelo mapa, desvia de móveis, para ao lado do alvo |
| Ver outras pessoas em tempo real | ✅ Colyseus, estado delta a 20 Hz, interpolação no cliente |
| Chat por proximidade | ✅ raio de 4 tiles; quem está longe fica esmaecido |
| Zonas privadas | ✅ retângulos coloridos; só quem está dentro ouve, toast ao entrar/sair |
| Spotlight | ✅ tile do palco: a fala vai para todo mundo |
| Mensagem direta | ✅ pelo card do participante |
| Objetos interativos (X) | ✅ nota, iframe (TV, arcade), quadro compartilhado, emote (café, piano, fonte) |
| Emotes | ✅ teclas 1–9 ou barra de emotes, somem após 3 s |
| Status (disponível/ocupado/não perturbe) | ✅ |
| Sentar | ✅ cadeiras e bancos |
| Lista de participantes + "perto de você" | ✅ |
| Localizar pessoa | ✅ linha amarela até ela, recalculada enquanto anda |
| Minimapa | ✅ clique nele para andar até lá |
| Mapmaker | ✅ modo construção (B): piso e objetos, sincronizado e salvo em `data/office.json` |
| Reconexão | ✅ 20 s para voltar sem perder o avatar |
| Vídeo / áudio | ❌ de propósito |

## Arquitetura

```
src/shared/     tiles.ts (ids, colisão), map.ts (mapa padrão, zonas, pathfinding, canHear), messages.ts
src/server/     index.ts (Express + Colyseus), rooms/OfficeRoom.ts (regras), rooms/OfficeState.ts (schema)
src/client/     main.ts (login), net.ts (SDK Colyseus), scenes/OfficeScene.ts (Phaser), ui/ (DOM), textures/ (canvas)
tests/          unit/ (node:test) e e2e/ (Playwright)
```

O servidor é autoritativo: o cliente só envia intenção (`move {dir}`, `chat`,
`build`...). Posição, colisão, zona, quem ouve quem e cooldown de passo são
calculados em `OfficeRoom`. O mesmo módulo `shared/map.ts` roda nos dois lados,
então o cliente consegue prever caminhos e distâncias sem divergir do servidor.

## Quando quiser o "meet"

O ponto de encaixe já existe: `canHear()` define o grupo de conversa de cada
jogador (proximidade ou zona). Basta, no servidor, derivar um id de grupo a cada
mudança e, no cliente, entrar/sair de uma sala do LiveKit ou Daily quando esse id
mudar. Nada do resto precisa ser alterado.
