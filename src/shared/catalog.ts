// Procedural object catalog: base shapes x colour palettes = 1000+ placeable objects.
// Shared between server (collision rules) and client (rendering, mapmaker).
// Legacy ids (O.*, 11..42) keep their meaning; catalog ids start at CATALOG_START.

export const CATALOG_START = 64;
export type Category = "moveis" | "escritorio" | "eletronicos" | "cozinha" | "decoracao" | "jardim" | "lazer" | "sinalizacao" | "estrutura" | "banheiro";
export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: "moveis", label: "Móveis", icon: "🛋️" },
  { id: "escritorio", label: "Escritório", icon: "🖥️" },
  { id: "eletronicos", label: "Eletrônicos", icon: "📺" },
  { id: "cozinha", label: "Cozinha", icon: "🍳" },
  { id: "banheiro", label: "Banheiro", icon: "🚿" },
  { id: "decoracao", label: "Decoração", icon: "🪴" },
  { id: "jardim", label: "Jardim", icon: "🌳" },
  { id: "lazer", label: "Lazer", icon: "🎮" },
  { id: "sinalizacao", label: "Sinalização", icon: "🪧" },
  { id: "estrutura", label: "Estrutura", icon: "🧱" },
];

export const PALETTES: Record<string, { name: string; hex: string }[]> = {
  wood: [{ name: "Carvalho", hex: "#b07a45" }, { name: "Nogueira", hex: "#7a4a2b" }, { name: "Pinho", hex: "#d9b382" }, { name: "Mogno", hex: "#8b3a2f" }, { name: "Ébano", hex: "#3b2a22" }, { name: "Branco", hex: "#e8e2d6" }],
  fabric: [{ name: "Vermelho", hex: "#dc2626" }, { name: "Laranja", hex: "#f97316" }, { name: "Amarelo", hex: "#eab308" }, { name: "Verde", hex: "#16a34a" }, { name: "Menta", hex: "#2dd4bf" }, { name: "Azul", hex: "#2563eb" }, { name: "Marinho", hex: "#1e3a8a" }, { name: "Roxo", hex: "#7c3aed" }, { name: "Rosa", hex: "#ec4899" }, { name: "Bege", hex: "#d6c3a5" }, { name: "Cinza", hex: "#6b7280" }, { name: "Preto", hex: "#1f2937" }, { name: "Branco", hex: "#f3f4f6" }, { name: "Marrom", hex: "#78350f" }],
  plastic: [{ name: "Vermelho", hex: "#ef4444" }, { name: "Laranja", hex: "#fb923c" }, { name: "Amarelo", hex: "#facc15" }, { name: "Verde", hex: "#22c55e" }, { name: "Ciano", hex: "#06b6d4" }, { name: "Azul", hex: "#3b82f6" }, { name: "Roxo", hex: "#a855f7" }, { name: "Rosa", hex: "#f472b6" }, { name: "Branco", hex: "#f9fafb" }, { name: "Preto", hex: "#111827" }],
  metal: [{ name: "Aço", hex: "#9ca3af" }, { name: "Grafite", hex: "#4b5563" }, { name: "Branco", hex: "#e5e7eb" }, { name: "Preto", hex: "#1f2937" }, { name: "Dourado", hex: "#d4a017" }, { name: "Cobre", hex: "#b87333" }],
  green: [{ name: "Verde", hex: "#16a34a" }, { name: "Verde claro", hex: "#4ade80" }, { name: "Verde escuro", hex: "#166534" }, { name: "Oliva", hex: "#84cc16" }, { name: "Azulado", hex: "#0d9488" }, { name: "Outono", hex: "#ea580c" }],
  flower: [{ name: "Rosa", hex: "#f472b6" }, { name: "Vermelha", hex: "#ef4444" }, { name: "Amarela", hex: "#facc15" }, { name: "Lilás", hex: "#a78bfa" }, { name: "Branca", hex: "#f9fafb" }, { name: "Laranja", hex: "#fb923c" }, { name: "Azul", hex: "#60a5fa" }],
  wall: [{ name: "Cinza", hex: "#9aa3b0" }, { name: "Branca", hex: "#e5e7eb" }, { name: "Creme", hex: "#f1e7d0" }, { name: "Tijolo", hex: "#b45309" }, { name: "Azul", hex: "#60a5fa" }, { name: "Verde", hex: "#86efac" }, { name: "Rosa", hex: "#f9a8d4" }, { name: "Preta", hex: "#374151" }, { name: "Madeira", hex: "#b07a45" }, { name: "Vidro", hex: "#bfdbfe" }],
  stone: [{ name: "Cinza", hex: "#9ca3af" }, { name: "Mármore", hex: "#e5e7eb" }, { name: "Granito", hex: "#4b5563" }, { name: "Arenito", hex: "#d6b98c" }],
  paper: [{ name: "Branco", hex: "#f9fafb" }, { name: "Amarelo", hex: "#fef08a" }, { name: "Azul", hex: "#bfdbfe" }, { name: "Verde", hex: "#bbf7d0" }, { name: "Rosa", hex: "#fbcfe8" }, { name: "Laranja", hex: "#fed7aa" }],
  sign: [{ name: "Verde", hex: "#16a34a" }, { name: "Vermelho", hex: "#dc2626" }, { name: "Azul", hex: "#2563eb" }, { name: "Amarelo", hex: "#eab308" }, { name: "Preto", hex: "#111827" }, { name: "Branco", hex: "#f9fafb" }],
};

export interface BaseDef {
  base: string;        // painter key
  name: string;
  cat: Category;
  palette: keyof typeof PALETTES;
  solid?: boolean;
  sittable?: boolean;
  tall?: boolean;       // player standing above is drawn behind it
  wall?: boolean;       // wall-mounted (wall face behind)
  tags?: string[];      // extra search words
}

// ~60 base shapes. Variants = palette size.
export const BASES: BaseDef[] = [
  // móveis
  { base: "sofa", name: "Sofá", cat: "moveis", palette: "fabric", solid: true },
  { base: "sofaL", name: "Sofá de canto", cat: "moveis", palette: "fabric", solid: true },
  { base: "armchair", name: "Poltrona", cat: "moveis", palette: "fabric", sittable: true },
  { base: "chair", name: "Cadeira", cat: "moveis", palette: "wood", sittable: true },
  { base: "officeChair", name: "Cadeira de escritório", cat: "moveis", palette: "fabric", sittable: true },
  { base: "stool", name: "Banqueta", cat: "moveis", palette: "wood", sittable: true },
  { base: "pouf", name: "Puff", cat: "moveis", palette: "fabric", sittable: true },
  { base: "bench", name: "Banco", cat: "moveis", palette: "wood", sittable: true },
  { base: "table", name: "Mesa", cat: "moveis", palette: "wood", solid: true },
  { base: "roundTable", name: "Mesa redonda", cat: "moveis", palette: "wood", solid: true },
  { base: "coffeeTable", name: "Mesa de centro", cat: "moveis", palette: "wood", solid: true },
  { base: "desk", name: "Escrivaninha", cat: "moveis", palette: "wood", solid: true },
  { base: "bedSingle", name: "Cama de solteiro", cat: "moveis", palette: "fabric", solid: true },
  { base: "bedDouble", name: "Cama de casal", cat: "moveis", palette: "fabric", solid: true },
  { base: "wardrobe", name: "Guarda-roupa", cat: "moveis", palette: "wood", solid: true, tall: true },
  { base: "dresser", name: "Cômoda", cat: "moveis", palette: "wood", solid: true },
  { base: "bookshelf", name: "Estante", cat: "moveis", palette: "wood", solid: true, tall: true },
  { base: "shelf", name: "Prateleira", cat: "moveis", palette: "wood", solid: true, wall: true },
  { base: "counter", name: "Balcão", cat: "moveis", palette: "wood", solid: true },
  { base: "locker", name: "Armário", cat: "moveis", palette: "metal", solid: true, tall: true },
  // escritório
  { base: "computer", name: "Computador", cat: "escritorio", palette: "wood", solid: true, tags: ["pc", "mesa"] },
  { base: "laptop", name: "Notebook", cat: "escritorio", palette: "wood", solid: true },
  { base: "printer", name: "Impressora", cat: "escritorio", palette: "wood", solid: true },
  { base: "whiteboard", name: "Quadro branco", cat: "escritorio", palette: "metal", solid: true, wall: true },
  { base: "flipchart", name: "Flipchart", cat: "escritorio", palette: "metal", solid: true, tall: true },
  { base: "cabinet", name: "Arquivo", cat: "escritorio", palette: "metal", solid: true, tall: true },
  { base: "coffeeMachine", name: "Cafeteira", cat: "escritorio", palette: "metal", solid: true, tags: ["café"] },
  { base: "cooler", name: "Bebedouro", cat: "escritorio", palette: "metal", solid: true },
  { base: "bin", name: "Lixeira", cat: "escritorio", palette: "plastic", solid: true },
  { base: "boxes", name: "Caixas", cat: "escritorio", palette: "paper", solid: true },
  { base: "meetingTable", name: "Mesa de reunião", cat: "escritorio", palette: "wood", solid: true },
  // eletrônicos
  { base: "tvWall", name: "TV de parede", cat: "eletronicos", palette: "metal", solid: true, wall: true },
  { base: "tvStand", name: "TV com rack", cat: "eletronicos", palette: "wood", solid: true },
  { base: "speaker", name: "Caixa de som", cat: "eletronicos", palette: "plastic", solid: true },
  { base: "fridge", name: "Geladeira", cat: "eletronicos", palette: "metal", solid: true, tall: true },
  { base: "microwave", name: "Micro-ondas", cat: "eletronicos", palette: "metal", solid: true },
  { base: "stove", name: "Fogão", cat: "eletronicos", palette: "metal", solid: true },
  { base: "washer", name: "Máquina de lavar", cat: "eletronicos", palette: "metal", solid: true },
  { base: "ac", name: "Ar-condicionado", cat: "eletronicos", palette: "metal", solid: true, wall: true },
  { base: "fan", name: "Ventilador", cat: "eletronicos", palette: "plastic", solid: true },
  { base: "arcade", name: "Arcade", cat: "eletronicos", palette: "plastic", solid: true },
  { base: "console", name: "Videogame", cat: "eletronicos", palette: "plastic", solid: true },
  { base: "server", name: "Rack de servidor", cat: "eletronicos", palette: "metal", solid: true, tall: true },
  // cozinha
  { base: "sink", name: "Pia", cat: "cozinha", palette: "metal", solid: true },
  { base: "kitchenCounter", name: "Bancada", cat: "cozinha", palette: "stone", solid: true },
  { base: "kitchenCabinet", name: "Armário de cozinha", cat: "cozinha", palette: "wood", solid: true, wall: true },
  { base: "barTable", name: "Mesa de bar", cat: "cozinha", palette: "wood", solid: true },
  { base: "vending", name: "Máquina de lanches", cat: "cozinha", palette: "plastic", solid: true, tall: true },
  { base: "cake", name: "Mesa com bolo", cat: "cozinha", palette: "fabric", solid: true, tags: ["festa"] },
  // banheiro
  { base: "toilet", name: "Vaso sanitário", cat: "banheiro", palette: "metal", solid: true },
  { base: "bathSink", name: "Pia de banheiro", cat: "banheiro", palette: "stone", solid: true },
  { base: "shower", name: "Chuveiro", cat: "banheiro", palette: "metal", solid: true, tall: true },
  { base: "bathtub", name: "Banheira", cat: "banheiro", palette: "plastic", solid: true },
  { base: "mirror", name: "Espelho", cat: "banheiro", palette: "metal", solid: true, wall: true },
  // decoração
  { base: "plant", name: "Planta", cat: "decoracao", palette: "green", solid: true },
  { base: "tallPlant", name: "Planta alta", cat: "decoracao", palette: "green", solid: true, tall: true },
  { base: "flowerPot", name: "Vaso de flores", cat: "decoracao", palette: "flower", solid: true },
  { base: "painting", name: "Quadro", cat: "decoracao", palette: "fabric", solid: true, wall: true },
  { base: "poster", name: "Pôster", cat: "decoracao", palette: "paper", solid: true, wall: true },
  { base: "clock", name: "Relógio", cat: "decoracao", palette: "metal", solid: true, wall: true },
  { base: "floorLamp", name: "Luminária de chão", cat: "decoracao", palette: "fabric", solid: true, tall: true, tags: ["luz"] },
  { base: "lamp", name: "Abajur", cat: "decoracao", palette: "fabric", solid: true, tags: ["luz"] },
  { base: "rug", name: "Tapete", cat: "decoracao", palette: "fabric" },
  { base: "roundRug", name: "Tapete redondo", cat: "decoracao", palette: "fabric" },
  { base: "cushion", name: "Almofada", cat: "decoracao", palette: "fabric", sittable: true },
  { base: "statue", name: "Estátua", cat: "decoracao", palette: "stone", solid: true, tall: true },
  { base: "aquarium", name: "Aquário", cat: "decoracao", palette: "wood", solid: true },
  { base: "globe", name: "Globo", cat: "decoracao", palette: "wood", solid: true },
  { base: "curtain", name: "Cortina", cat: "decoracao", palette: "fabric", solid: true, wall: true },
  // jardim
  { base: "tree", name: "Árvore", cat: "jardim", palette: "green", solid: true, tall: true },
  { base: "bush", name: "Arbusto", cat: "jardim", palette: "green", solid: true },
  { base: "flowerBed", name: "Canteiro", cat: "jardim", palette: "flower" },
  { base: "gardenBench", name: "Banco de jardim", cat: "jardim", palette: "wood", sittable: true },
  { base: "fountain", name: "Fonte", cat: "jardim", palette: "stone", solid: true },
  { base: "fence", name: "Cerca", cat: "jardim", palette: "wood", solid: true },
  { base: "rock", name: "Pedra", cat: "jardim", palette: "stone", solid: true },
  { base: "lampPost", name: "Poste de luz", cat: "jardim", palette: "metal", solid: true, tall: true, tags: ["luz"] },
  { base: "umbrella", name: "Guarda-sol", cat: "jardim", palette: "fabric", solid: true, tall: true },
  { base: "picnic", name: "Mesa de piquenique", cat: "jardim", palette: "wood", solid: true },
  { base: "grill", name: "Churrasqueira", cat: "jardim", palette: "metal", solid: true },
  { base: "bike", name: "Bicicleta", cat: "jardim", palette: "plastic", solid: true },
  { base: "pool", name: "Piscina (borda)", cat: "jardim", palette: "plastic", solid: true },
  { base: "swing", name: "Balanço", cat: "jardim", palette: "wood", sittable: true },
  // lazer
  { base: "piano", name: "Piano", cat: "lazer", palette: "wood", solid: true },
  { base: "guitar", name: "Violão", cat: "lazer", palette: "wood", solid: true },
  { base: "pool_table", name: "Mesa de sinuca", cat: "lazer", palette: "fabric", solid: true },
  { base: "foosball", name: "Pebolim", cat: "lazer", palette: "plastic", solid: true },
  { base: "darts", name: "Alvo de dardos", cat: "lazer", palette: "metal", solid: true, wall: true },
  { base: "boardGame", name: "Jogo de tabuleiro", cat: "lazer", palette: "wood", solid: true },
  { base: "ball", name: "Bola", cat: "lazer", palette: "plastic" },
  { base: "trophy", name: "Troféu", cat: "lazer", palette: "metal", solid: true },
  { base: "stage", name: "Palco", cat: "lazer", palette: "wood" },
  { base: "dj", name: "Mesa de DJ", cat: "lazer", palette: "plastic", solid: true },
  // sinalização
  { base: "signWall", name: "Placa de parede", cat: "sinalizacao", palette: "sign", solid: true, wall: true },
  { base: "signStand", name: "Totem", cat: "sinalizacao", palette: "sign", solid: true, tall: true },
  { base: "arrow", name: "Seta no chão", cat: "sinalizacao", palette: "sign" },
  { base: "cone", name: "Cone", cat: "sinalizacao", palette: "plastic", solid: true },
  { base: "doormat", name: "Tapete de entrada", cat: "sinalizacao", palette: "fabric" },
  { base: "rope", name: "Pedestal com corda", cat: "sinalizacao", palette: "metal", solid: true },
  { base: "flag", name: "Bandeira", cat: "sinalizacao", palette: "sign", solid: true, tall: true },
  // estrutura
  { base: "wall", name: "Parede", cat: "estrutura", palette: "wall", solid: true, tall: true },
  { base: "window", name: "Janela", cat: "estrutura", palette: "wall", solid: true, wall: true },
  { base: "door", name: "Porta", cat: "estrutura", palette: "wood" },
  { base: "pillar", name: "Pilar", cat: "estrutura", palette: "stone", solid: true, tall: true },
  { base: "divider", name: "Divisória", cat: "estrutura", palette: "fabric", solid: true, tall: true },
  { base: "stairs", name: "Escada", cat: "estrutura", palette: "wood" },
  { base: "elevator", name: "Elevador", cat: "estrutura", palette: "metal", solid: true, tall: true },
  // mais móveis
  { base: "nightstand", name: "Criado-mudo", cat: "moveis", palette: "wood", solid: true },
  { base: "bunkBed", name: "Beliche", cat: "moveis", palette: "fabric", solid: true, tall: true },
  { base: "hammock", name: "Rede", cat: "moveis", palette: "fabric", sittable: true },
  { base: "coatRack", name: "Cabideiro", cat: "moveis", palette: "wood", solid: true, tall: true },
  { base: "barStool", name: "Banco alto", cat: "moveis", palette: "metal", sittable: true },
  { base: "sideboard", name: "Aparador", cat: "moveis", palette: "wood", solid: true },
  { base: "safe", name: "Cofre", cat: "moveis", palette: "metal", solid: true },
  { base: "shelfUnit", name: "Estante aberta", cat: "moveis", palette: "metal", solid: true, tall: true },
  { base: "beanbag", name: "Pufe gigante", cat: "moveis", palette: "fabric", sittable: true },
  // mais escritório
  { base: "lectern", name: "Púlpito", cat: "escritorio", palette: "wood", solid: true },
  { base: "projector", name: "Tela de projeção", cat: "escritorio", palette: "metal", solid: true, wall: true },
  { base: "easel", name: "Cavalete", cat: "escritorio", palette: "wood", solid: true, tall: true },
  { base: "bulletin", name: "Mural de cortiça", cat: "escritorio", palette: "paper", solid: true, wall: true },
  { base: "calendar", name: "Calendário", cat: "escritorio", palette: "paper", solid: true, wall: true },
  { base: "extinguisher", name: "Extintor", cat: "escritorio", palette: "sign", solid: true, wall: true },
  { base: "firstAid", name: "Kit de primeiros socorros", cat: "escritorio", palette: "sign", solid: true, wall: true },
  { base: "phoneBooth", name: "Cabine telefônica", cat: "escritorio", palette: "fabric", solid: true, tall: true },
  { base: "reception", name: "Balcão de recepção", cat: "escritorio", palette: "wood", solid: true },
  // mais eletrônicos
  { base: "jukebox", name: "Jukebox", cat: "eletronicos", palette: "plastic", solid: true, tall: true },
  { base: "slot", name: "Caça-níquel", cat: "eletronicos", palette: "plastic", solid: true, tall: true },
  { base: "atm", name: "Caixa eletrônico", cat: "eletronicos", palette: "metal", solid: true, tall: true },
  { base: "neon", name: "Letreiro neon", cat: "eletronicos", palette: "plastic", solid: true, wall: true },
  { base: "robot", name: "Robô", cat: "eletronicos", palette: "metal", solid: true },
  { base: "vr", name: "Estação VR", cat: "eletronicos", palette: "plastic", solid: true },
  // mais cozinha
  { base: "oven", name: "Forno", cat: "cozinha", palette: "metal", solid: true },
  { base: "dishwasher", name: "Lava-louças", cat: "cozinha", palette: "metal", solid: true },
  { base: "wineRack", name: "Adega", cat: "cozinha", palette: "wood", solid: true, tall: true },
  { base: "popcorn", name: "Pipoqueira", cat: "cozinha", palette: "plastic", solid: true },
  { base: "barCounter", name: "Balcão de bar", cat: "cozinha", palette: "wood", solid: true },
  { base: "fruitBowl", name: "Mesa com frutas", cat: "cozinha", palette: "wood", solid: true },
  // mais banheiro
  { base: "towelRack", name: "Toalheiro", cat: "banheiro", palette: "fabric", solid: true, wall: true },
  { base: "laundryBasket", name: "Cesto de roupa", cat: "banheiro", palette: "plastic", solid: true },
  // mais decoração
  { base: "vase", name: "Vaso decorativo", cat: "decoracao", palette: "plastic", solid: true },
  { base: "candle", name: "Velas", cat: "decoracao", palette: "fabric", solid: true },
  { base: "hangingPlant", name: "Planta pendurada", cat: "decoracao", palette: "green", solid: true, wall: true },
  { base: "banner", name: "Bandeirola", cat: "decoracao", palette: "fabric", solid: true, wall: true },
  { base: "cactusBig", name: "Cacto", cat: "decoracao", palette: "green", solid: true },
  { base: "bonsai", name: "Bonsai", cat: "decoracao", palette: "green", solid: true },
  { base: "fireplace", name: "Lareira", cat: "decoracao", palette: "stone", solid: true, tall: true },
  { base: "pedestal", name: "Pedestal", cat: "decoracao", palette: "stone", solid: true },
  { base: "balloons", name: "Balões", cat: "decoracao", palette: "plastic", solid: true, tall: true, tags: ["festa"] },
  // mais jardim
  { base: "mailbox", name: "Caixa de correio", cat: "jardim", palette: "plastic", solid: true },
  { base: "hydrant", name: "Hidrante", cat: "jardim", palette: "sign", solid: true },
  { base: "trashOut", name: "Lixeira de rua", cat: "jardim", palette: "metal", solid: true },
  { base: "tent", name: "Barraca", cat: "jardim", palette: "fabric", solid: true, tall: true },
  { base: "campfire", name: "Fogueira", cat: "jardim", palette: "stone", solid: true },
  { base: "sandbox", name: "Caixa de areia", cat: "jardim", palette: "wood" },
  { base: "slide", name: "Escorregador", cat: "jardim", palette: "plastic", solid: true, tall: true },
  { base: "seesaw", name: "Gangorra", cat: "jardim", palette: "plastic", solid: true },
  { base: "hoop", name: "Cesta de basquete", cat: "jardim", palette: "metal", solid: true, tall: true },
  { base: "scooter", name: "Patinete", cat: "jardim", palette: "plastic", solid: true },
  { base: "wheelbarrow", name: "Carrinho de mão", cat: "jardim", palette: "metal", solid: true },
  { base: "birdbath", name: "Bebedouro de pássaros", cat: "jardim", palette: "stone", solid: true },
  { base: "palm", name: "Palmeira", cat: "jardim", palette: "green", solid: true, tall: true },
  { base: "pine", name: "Pinheiro", cat: "jardim", palette: "green", solid: true, tall: true },
  { base: "snowman", name: "Boneco de neve", cat: "jardim", palette: "plastic", solid: true },
  // mais lazer
  { base: "pingpong", name: "Mesa de ping-pong", cat: "lazer", palette: "fabric", solid: true },
  { base: "chessTable", name: "Mesa de xadrez", cat: "lazer", palette: "wood", solid: true },
  { base: "drums", name: "Bateria", cat: "lazer", palette: "plastic", solid: true },
  { base: "microphone", name: "Microfone de pé", cat: "lazer", palette: "metal", solid: true },
  { base: "treadmill", name: "Esteira", cat: "lazer", palette: "metal", solid: true },
  { base: "weights", name: "Pesos", cat: "lazer", palette: "metal", solid: true },
  { base: "yogaMat", name: "Tapete de yoga", cat: "lazer", palette: "fabric" },
  { base: "bookPile", name: "Pilha de livros", cat: "lazer", palette: "paper", solid: true },
  { base: "telescope", name: "Telescópio", cat: "lazer", palette: "metal", solid: true, tall: true },
  // mais sinalização
  { base: "barrier", name: "Barreira", cat: "sinalizacao", palette: "sign", solid: true },
  { base: "exit", name: "Placa de saída", cat: "sinalizacao", palette: "sign", solid: true, wall: true },
  { base: "numberPlate", name: "Número de sala", cat: "sinalizacao", palette: "sign", solid: true, wall: true },
  { base: "floorTape", name: "Faixa no chão", cat: "sinalizacao", palette: "sign" },
  { base: "qr", name: "Placa com QR", cat: "sinalizacao", palette: "paper", solid: true, tall: true },
  // mais estrutura
  { base: "glassWall", name: "Parede de vidro", cat: "estrutura", palette: "wall", solid: true, tall: true },
  { base: "halfWall", name: "Meia parede", cat: "estrutura", palette: "wall", solid: true },
  { base: "archway", name: "Arco", cat: "estrutura", palette: "wall" },
  { base: "turnstile", name: "Catraca", cat: "estrutura", palette: "metal", solid: true },
  { base: "ramp", name: "Rampa", cat: "estrutura", palette: "stone" },
];

export interface CatalogItem { id: number; base: string; name: string; cat: Category; color: string; colorName: string; solid: boolean; sittable: boolean; tall: boolean; wall: boolean; search: string }

export const CATALOG: CatalogItem[] = [];
export const CATALOG_BY_ID = new Map<number, CatalogItem>();
{
  let id = CATALOG_START;
  for (const b of BASES) {
    for (const c of PALETTES[b.palette]) {
      const item: CatalogItem = { id, base: b.base, name: `${b.name} ${c.name.toLowerCase()}`, cat: b.cat, color: c.hex, colorName: c.name, solid: !!b.solid, sittable: !!b.sittable, tall: !!b.tall, wall: !!b.wall, search: `${b.name} ${c.name} ${b.cat} ${(b.tags ?? []).join(" ")}`.toLowerCase() };
      CATALOG.push(item);
      CATALOG_BY_ID.set(id, item);
      id++;
    }
  }
}
export const CATALOG_END = CATALOG_START + CATALOG.length; // first free id after the catalog
export const isCatalogId = (id: number) => id >= CATALOG_START && id < CATALOG_END;

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function searchCatalog(q: string, cat?: Category | "all", colorName?: string) {
  const words = strip(q).split(/\s+/).filter(Boolean);
  return CATALOG.filter((i) => (!cat || cat === "all" || i.cat === cat) && (!colorName || i.colorName === colorName) && words.every((w) => strip(i.search).includes(w)));
}
