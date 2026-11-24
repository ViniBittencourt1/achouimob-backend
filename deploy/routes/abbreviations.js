export const ABBREVIATIONS = {
  // Tipos de imóvel
  "apto": "apartamento",
  "ap": "apartamento",
  "apartamento": "apartamento",
  "casa": "casa",
  "casas": "casa",
  "sobrado": "casa",
  "sobrados": "casa",
  "cobertura": "cobertura",
  "cob": "cobertura",
  "penthouse": "cobertura",
  "kitnet": "apartamento",
  "kit": "apartamento",
  "loft": "apartamento",
  "studio": "apartamento",
  "terreno": "terreno",
  "lote": "terreno",
  "chácara": "sitio",
  "sitio": "sitio",
  "sítio": "sitio",
  "apartamentos": "apartamento",
  "coberturas": "cobertura",
  "apertamentos": "apartamento",
  "terrenos": "terreno",
  "lotes": "terreno",
  "chácaras": "sitio",
  "sítios": "sitio",
  "granja": "sitio",
  "fazenda": "sitio",

  // Tipos de condomínio / local
  "cond.": "condominio",
  "condominio": "condominio",
  "residencial": "condominio",
  "resid.": "condominio",
  "bairro": "bairro",
  "vilas": "condominio",
  "vila": "condominio",

  // Localizações / bairros (já concatenados)
  "saopedro": "saopedro",
  "saomateus": "saomateus",
  "cascatinha": "cascatinha",
  "centro": "centro",
  "grama": "grama",
  "novagramado": "novagramado",

  // Quartos / dormitórios
  "dorm": "quarto",
  "dorm.": "quarto",
  "dormitorio": "quarto",
  "quarto": "quarto",
  "suite": "quarto",
  "suíte": "quarto",
  "suites": "quarto",
  "quartos": "quarto",

  // Banheiros
  "banheiro": "banheiro",
  "banheiros": "banheiro",
  "lavabo": "banheiro",
  "wc": "banheiro",

  // Vagas / garagem
  "vaga": "vaga",
  "vagas": "vaga",
  "garagem": "vaga",
  "garagens": "vaga",

  // Elevador
  "elevador": "elevador",
  "lift": "elevador",

  // Áreas / metragem
  "area": "area",
  "área": "area",
  "m2": "metragem",
  "metros": "metragem",
  "metragem": "metragem",

  // Mobilia
  "mobilia": "mobilia",
  "mobilado": "mobilia",
  "semi-mobiliado": "mobilia",
  "semimobiliado": "mobilia",
  "não mobiliado": "mobilia",

  // Preço / valores
  "preco": "preco",
  "preço": "preco",
  "valor": "preco",
  "aluguel": "preco",
  "condominio": "preco",

  // Comodidades / áreas comuns
  "piscina": "piscina",
  "churrasqueira": "churrasqueira",
  "academia": "academia",
  "playground": "playground",
  "portaria": "portaria",
  "seguranca": "seguranca",
  "segurança": "seguranca",
  "quadra": "quadra",
  "salao de festas": "salao de festas",
  "salão de festas": "salao de festas",
  "sala fitness": "academia",
  "salão de jogos": "salão de jogos",
  "sauna": "sauna",

  // Vistas / posição
  "vista": "vista",
  "frente": "frente",
  "fundos": "fundos",
  "lateral": "lateral",
  "corner": "frente",

  // Termos gerais
  "terraço": "terraco",
  "terraco": "terraco",
  "varanda": "varanda",
  "sacada": "varanda",
  "jardim": "jardim",
  "quintal": "quintal",
  "escritório": "escritorio",
  "office": "escritorio",
  "home office": "escritorio",
  "dep. empregada": "dependencia",
  "dependencia": "dependencia",
  "lavanderia": "lavanderia",
  "dep. serviço": "dependencia",
  "despensa": "despensa",

  // Sinônimos variados
  "condominio fechado": "condominio",
  "cond. fechado": "condominio",

  // Diversos
  "cozinha": "cozinha",
  "cozinha americana": "cozinha",
  "cozinha planejada": "cozinha",
  "closet": "closet",
  "garagem coberta": "garagem",
  "garagem descoberta": "garagem"
};

// 🔹 Normalização segura
export function normalizeAndExpand(str) {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map(word => ABBREVIATIONS[word] || word)
    .join(" ");
}

// 🔹 Retorna lista de palavras por categoria para filtros exatos
export function getAbbreviationList(category) {
  const mapping = {
    tipoImovel: ["apartamento","cobertura","casa","terreno","sitio","condominio"],
    dormitorio: ["quarto"],
    banheiro: ["banheiro"],
    vaga: ["vaga"],
    elevador: ["elevador"],
    localizacao: ["saopedro","saomateus","cascatinha","centro","grama","novagramado"]
  };

  return mapping[category] || [];
}
