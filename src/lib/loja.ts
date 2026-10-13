/**
 * O catálogo da loja de Rangify Coins. É a única fonte: a migração do Supabase
 * (0015_loja.sql, entre os marcadores) é gerada daqui com
 *
 *   node scripts/gerar-loja-sql.mjs
 *
 * O id de cada item é também a classe CSS que o desenha (src/cosmeticos.css).
 */
export type CategoriaLoja = 'borda' | 'efeito' | 'gif' | 'placa' | 'banner' | 'titulo' | 'cartao' | 'linha' | 'mvp'
export type Raridade = 'comum' | 'raro' | 'epico' | 'lendario'

export interface ItemLoja {
  id: string
  categoria: CategoriaLoja
  nome: string
  raridade: Raridade
  preco: number
  /** Só se ganha a jogar (não se compra). */
  conquista?: string
}

// prettier-ignore
export const ITENS_LOJA: ItemLoja[] = [
  { id: 'b-aro', categoria: 'borda', nome: 'Aro Laranja', raridade: 'comum', preco: 300 },
  { id: 'b-marfim', categoria: 'borda', nome: 'Aro Marfim', raridade: 'comum', preco: 300 },
  { id: 'b-tracejado', categoria: 'borda', nome: 'Tracejado', raridade: 'comum', preco: 350 },
  { id: 'b-duplo', categoria: 'borda', nome: 'Aro Duplo', raridade: 'comum', preco: 400 },
  { id: 'b-cantos', categoria: 'borda', nome: 'Cantos de Mira', raridade: 'raro', preco: 600 },
  { id: 'b-mira', categoria: 'borda', nome: 'Mira', raridade: 'raro', preco: 650 },
  { id: 'b-hex', categoria: 'borda', nome: 'Hexágono', raridade: 'raro', preco: 700 },
  { id: 'b-sol', categoria: 'borda', nome: 'Pôr do Sol', raridade: 'raro', preco: 750 },
  { id: 'b-chama', categoria: 'borda', nome: 'Anel de Chama', raridade: 'epico', preco: 1000 },
  { id: 'b-radar', categoria: 'borda', nome: 'Radar', raridade: 'epico', preco: 1100 },
  { id: 'b-pulso', categoria: 'borda', nome: 'Pulso', raridade: 'epico', preco: 1150 },
  { id: 'b-dentes', categoria: 'borda', nome: 'Engrenagem', raridade: 'epico', preco: 1250 },
  { id: 'b-ouro', categoria: 'borda', nome: 'Coroa de Ouro', raridade: 'lendario', preco: 1600 },
  { id: 'b-eclipse', categoria: 'borda', nome: 'Eclipse', raridade: 'lendario', preco: 1800 },
  { id: 'b-plasma', categoria: 'borda', nome: 'Plasma', raridade: 'lendario', preco: 2000 },
  { id: 'b-prisma', categoria: 'borda', nome: 'Prisma de Ouro', raridade: 'lendario', preco: 2200 },

  { id: 'e-halo', categoria: 'efeito', nome: 'Halo', raridade: 'comum', preco: 350 },
  { id: 'e-brilho', categoria: 'efeito', nome: 'Brilho Quente', raridade: 'comum', preco: 400 },
  { id: 'e-bate', categoria: 'efeito', nome: 'Batimento', raridade: 'comum', preco: 450 },
  { id: 'e-faiscas', categoria: 'efeito', nome: 'Faíscas', raridade: 'raro', preco: 700 },
  { id: 'e-orbita', categoria: 'efeito', nome: 'Órbita', raridade: 'raro', preco: 750 },
  { id: 'e-ondas', categoria: 'efeito', nome: 'Ondas', raridade: 'raro', preco: 800 },
  { id: 'e-brasas', categoria: 'efeito', nome: 'Brasas', raridade: 'raro', preco: 850 },
  { id: 'e-duas', categoria: 'efeito', nome: 'Duas Órbitas', raridade: 'epico', preco: 1100 },
  { id: 'e-raios', categoria: 'efeito', nome: 'Raios', raridade: 'epico', preco: 1200 },
  { id: 'e-cintila', categoria: 'efeito', nome: 'Cintilar', raridade: 'epico', preco: 1250 },
  { id: 'e-fumo', categoria: 'efeito', nome: 'Fumo de Brasa', raridade: 'lendario', preco: 1700 },
  { id: 'e-aura', categoria: 'efeito', nome: 'Aura de Ouro', raridade: 'lendario', preco: 2000 },

  { id: 'gif', categoria: 'gif', nome: 'Foto em GIF', raridade: 'lendario', preco: 2000 },

  { id: 'p-cinza', categoria: 'placa', nome: 'Cinza Quente', raridade: 'comum', preco: 300 },
  { id: 'p-pixel', categoria: 'placa', nome: 'Pixel', raridade: 'comum', preco: 400 },
  { id: 'p-riscas', categoria: 'placa', nome: 'Riscas', raridade: 'comum', preco: 400 },
  { id: 'p-grelha', categoria: 'placa', nome: 'Grelha', raridade: 'comum', preco: 450 },
  { id: 'p-brasa', categoria: 'placa', nome: 'Brasa', raridade: 'raro', preco: 750 },
  { id: 'p-fios', categoria: 'placa', nome: 'Fios do Rangify', raridade: 'raro', preco: 800 },
  { id: 'p-sol', categoria: 'placa', nome: 'Pôr do Sol', raridade: 'raro', preco: 850 },
  { id: 'p-topo', categoria: 'placa', nome: 'Topografia', raridade: 'raro', preco: 900 },
  { id: 'p-circuito', categoria: 'placa', nome: 'Circuito', raridade: 'epico', preco: 1100 },
  { id: 'p-neon', categoria: 'placa', nome: 'Linha Neon', raridade: 'epico', preco: 1150 },
  { id: 'p-solido', categoria: 'placa', nome: 'Laranja Sólido', raridade: 'epico', preco: 1200 },
  { id: 'p-calor', categoria: 'placa', nome: 'Ondas de Calor', raridade: 'epico', preco: 1250 },
  { id: 'p-supernova', categoria: 'placa', nome: 'Supernova', raridade: 'lendario', preco: 1800 },
  { id: 'p-aurora', categoria: 'placa', nome: 'Aurora', raridade: 'lendario', preco: 1900 },
  { id: 'p-constelacao', categoria: 'placa', nome: 'Constelação', raridade: 'lendario', preco: 2000 },
  { id: 'p-ouro', categoria: 'placa', nome: 'Ouro Fundido', raridade: 'lendario', preco: 2200 },

  { id: 'bn-grad', categoria: 'banner', nome: 'Gradiente Laranja', raridade: 'comum', preco: 400 },
  { id: 'bn-riscas', categoria: 'banner', nome: 'Riscas', raridade: 'comum', preco: 400 },
  { id: 'bn-grelha', categoria: 'banner', nome: 'Grelha', raridade: 'comum', preco: 450 },
  { id: 'bn-fios', categoria: 'banner', nome: 'Fios do Rangify', raridade: 'raro', preco: 800 },
  { id: 'bn-sol', categoria: 'banner', nome: 'Pôr do Sol', raridade: 'raro', preco: 850 },
  { id: 'bn-dunas', categoria: 'banner', nome: 'Dunas', raridade: 'raro', preco: 900 },
  { id: 'bn-infinita', categoria: 'banner', nome: 'Grelha Infinita', raridade: 'epico', preco: 1200 },
  { id: 'bn-cidade', categoria: 'banner', nome: 'Cidade à Noite', raridade: 'epico', preco: 1250 },
  { id: 'bn-estrelas', categoria: 'banner', nome: 'Céu Estrelado', raridade: 'epico', preco: 1300 },
  { id: 'bn-eclipse', categoria: 'banner', nome: 'Eclipse', raridade: 'lendario', preco: 1800 },
  { id: 'bn-supernova', categoria: 'banner', nome: 'Supernova', raridade: 'lendario', preco: 2000 },
  { id: 'bn-ouro', categoria: 'banner', nome: 'Ouro Fundido', raridade: 'lendario', preco: 2200 },

  { id: 't-recruta', categoria: 'titulo', nome: 'Recruta', raridade: 'comum', preco: 300 },
  { id: 't-fila', categoria: 'titulo', nome: 'Sempre na Fila', raridade: 'comum', preco: 350 },
  { id: 't-fiel', categoria: 'titulo', nome: 'Fiel ao Hub', raridade: 'comum', preco: 350 },
  { id: 't-equipa', categoria: 'titulo', nome: 'Jogador de Equipa', raridade: 'comum', preco: 400 },
  { id: 't-clutch', categoria: 'titulo', nome: 'O Clutch', raridade: 'raro', preco: 650 },
  { id: 't-entry', categoria: 'titulo', nome: 'Rei do Entry', raridade: 'raro', preco: 700 },
  { id: 't-capitao', categoria: 'titulo', nome: 'Capitão', raridade: 'raro', preco: 750 },
  { id: 't-ferro', categoria: 'titulo', nome: 'Mão de Ferro', raridade: 'raro', preco: 800 },
  { id: 't-ace', categoria: 'titulo', nome: 'Ace Ambulante', raridade: 'epico', preco: 1100 },
  { id: 't-piedade', categoria: 'titulo', nome: 'Sem Piedade', raridade: 'epico', preco: 1200 },
  { id: 't-lotus', categoria: 'titulo', nome: 'Dono do Lotus', raridade: 'epico', preco: 1250 },
  { id: 't-mvp', categoria: 'titulo', nome: 'MVP em Série', raridade: 'epico', preco: 0, conquista: 'Sê MVP em 10 partidas.' },
  { id: 't-lenda', categoria: 'titulo', nome: 'Lenda do Hub', raridade: 'lendario', preco: 1800 },
  { id: 't-imparavel', categoria: 'titulo', nome: 'Imparável', raridade: 'lendario', preco: 2000 },
  { id: 't-primeiro', categoria: 'titulo', nome: 'O Primeiro', raridade: 'lendario', preco: 0, conquista: 'Só para os 100 primeiros jogadores do Rangify.' },
  { id: 't-topo', categoria: 'titulo', nome: 'Topo da Tabela', raridade: 'lendario', preco: 0, conquista: 'Chega a #1 na tabela de pontos.' },

  { id: 'c-riscas', categoria: 'cartao', nome: 'Riscas de Mira', raridade: 'comum', preco: 500 },
  { id: 'c-grelha', categoria: 'cartao', nome: 'Grelha', raridade: 'comum', preco: 500 },
  { id: 'c-faixa', categoria: 'cartao', nome: 'Faixa Laranja', raridade: 'comum', preco: 550 },
  { id: 'c-brasa', categoria: 'cartao', nome: 'Brasa', raridade: 'raro', preco: 800 },
  { id: 'c-cantos', categoria: 'cartao', nome: 'Cantos de Mira', raridade: 'raro', preco: 850 },
  { id: 'c-dupla', categoria: 'cartao', nome: 'Moldura Dupla', raridade: 'raro', preco: 900 },
  { id: 'c-assinatura', categoria: 'cartao', nome: 'Assinatura', raridade: 'epico', preco: 1200 },
  { id: 'c-ponto', categoria: 'cartao', nome: 'Ponto de Luz', raridade: 'epico', preco: 1250 },
  { id: 'c-holo', categoria: 'cartao', nome: 'Holograma', raridade: 'epico', preco: 1300 },
  { id: 'c-noite', categoria: 'cartao', nome: 'Noite Estrelada', raridade: 'lendario', preco: 1800 },
  { id: 'c-supernova', categoria: 'cartao', nome: 'Supernova', raridade: 'lendario', preco: 1900 },
  { id: 'c-ouro', categoria: 'cartao', nome: 'Ouro de Campeão', raridade: 'lendario', preco: 2100 },

  { id: 'l-contorno', categoria: 'linha', nome: 'Contorno Laranja', raridade: 'comum', preco: 400 },
  { id: 'l-riscas', categoria: 'linha', nome: 'Riscas', raridade: 'comum', preco: 400 },
  { id: 'l-sub', categoria: 'linha', nome: 'Sublinhado', raridade: 'comum', preco: 450 },
  { id: 'l-varredura', categoria: 'linha', nome: 'Varredura', raridade: 'raro', preco: 700 },
  { id: 'l-brasa', categoria: 'linha', nome: 'Brasa', raridade: 'raro', preco: 750 },
  { id: 'l-vivo', categoria: 'linha', nome: 'Ponto Vivo', raridade: 'raro', preco: 800 },
  { id: 'l-ouro', categoria: 'linha', nome: 'Nome em Ouro', raridade: 'epico', preco: 1000 },
  { id: 'l-neon', categoria: 'linha', nome: 'Neon', raridade: 'epico', preco: 1150 },
  { id: 'l-chama', categoria: 'linha', nome: 'Rasto de Chama', raridade: 'epico', preco: 1300 },
  { id: 'l-holofote', categoria: 'linha', nome: 'Holofote', raridade: 'lendario', preco: 1700 },
  { id: 'l-supernova', categoria: 'linha', nome: 'Supernova', raridade: 'lendario', preco: 1900 },
  { id: 'l-coroa', categoria: 'linha', nome: 'Coroa', raridade: 'lendario', preco: 2100 },

  { id: 'm-classica', categoria: 'mvp', nome: 'Estrela Clássica', raridade: 'comum', preco: 300 },
  { id: 'm-carimbo', categoria: 'mvp', nome: 'Carimbo', raridade: 'comum', preco: 400 },
  { id: 'm-brilho', categoria: 'mvp', nome: 'Brilho', raridade: 'comum', preco: 450 },
  { id: 'm-rodar', categoria: 'mvp', nome: 'Estrela a Rodar', raridade: 'raro', preco: 700 },
  { id: 'm-varre', categoria: 'mvp', nome: 'Varredura', raridade: 'raro', preco: 750 },
  { id: 'm-faiscas', categoria: 'mvp', nome: 'Faíscas', raridade: 'raro', preco: 850 },
  { id: 'm-explosao', categoria: 'mvp', nome: 'Explosão', raridade: 'epico', preco: 1100 },
  { id: 'm-confetes', categoria: 'mvp', nome: 'Confetes', raridade: 'epico', preco: 1200 },
  { id: 'm-coroa', categoria: 'mvp', nome: 'Coroa a Cair', raridade: 'epico', preco: 1300 },
  { id: 'm-cometa', categoria: 'mvp', nome: 'Rasto de Cometa', raridade: 'lendario', preco: 1800 },
  { id: 'm-chamas', categoria: 'mvp', nome: 'Chamas', raridade: 'lendario', preco: 2000 },
  { id: 'm-ouro', categoria: 'mvp', nome: 'Ouro Líquido', raridade: 'lendario', preco: 2200 },
]

export const ITEM_POR_ID: Record<string, ItemLoja> = Object.fromEntries(ITENS_LOJA.map((i) => [i.id, i]))

/** As categorias pela ordem em que aparecem na loja. A GIF está sempre à venda. */
export const CATEGORIAS_LOJA: { id: CategoriaLoja; nome: [string, string]; uma: [string, string] }[] = [
  { id: 'borda', nome: ['Bordas', 'Borders'], uma: ['Borda', 'Border'] },
  { id: 'efeito', nome: ['Efeitos', 'Effects'], uma: ['Efeito', 'Effect'] },
  { id: 'placa', nome: ['Placas', 'Nameplates'], uma: ['Placa', 'Nameplate'] },
  { id: 'banner', nome: ['Banners', 'Banners'], uma: ['Banner', 'Banner'] },
  { id: 'titulo', nome: ['Títulos', 'Titles'], uma: ['Título', 'Title'] },
  { id: 'cartao', nome: ['Draft', 'Draft'], uma: ['Cartão do draft', 'Draft card'] },
  { id: 'linha', nome: ['Ranking', 'Leaderboard'], uma: ['Linha do ranking', 'Leaderboard row'] },
  { id: 'mvp', nome: ['MVP', 'MVP'], uma: ['Animação de MVP', 'MVP animation'] },
  { id: 'gif', nome: ['GIF', 'GIF'], uma: ['Foto de perfil', 'Profile picture'] },
]

export const NOME_RARIDADE: Record<Raridade, [string, string]> = {
  comum: ['Comum', 'Common'], raro: ['Raro', 'Rare'], epico: ['Épico', 'Epic'], lendario: ['Lendário', 'Legendary'],
}

/** Cor do texto de cada raridade (com contraste no fundo escuro). */
export const COR_RARIDADE: Record<Raridade, string> = {
  comum: 'text-suave', raro: 'text-pessego', epico: 'text-laranja-claro', lendario: 'text-ouro',
}

/** O que cada jogador tem equipado, por categoria. Na GIF vai o link da imagem. */
export type Cosmeticos = Partial<Record<CategoriaLoja, string>>

export function formatarCoins(n: number) {
  return Math.round(n).toLocaleString('pt-PT').replace(/\./g, ' ')
}

/** Como as coins se ganham (a mesma conta do Supabase, em _moedas_ganhas). */
export const COINS_POR_NIVEL = 150
export const COINS_POR_MARCO = 500
export const COINS_POR_SEMANAL = 40
export const COINS_POR_MVP = 25

export function coinsDoNivel(nivel: number) {
  return COINS_POR_NIVEL * Math.max(0, nivel - 1) + COINS_POR_MARCO * Math.floor(nivel / 5)
}

/** O link de uma GIF de perfil: https, até 500 caracteres, a acabar em .gif ou .webp (ou de um sítio de GIFs conhecido). */
export function gifValida(url: string) {
  const u = url.trim()
  if (u.length > 500 || !/^https:\/\/[^\s"'<>]+$/i.test(u)) return false
  return /\.(gif|webp)(\?[^\s]*)?$/i.test(u) || /^https:\/\/(media\d*\.giphy\.com|i\.giphy\.com|media\.tenor\.com|c\.tenor\.com|cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(u)
}
