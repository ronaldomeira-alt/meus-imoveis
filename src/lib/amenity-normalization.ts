/**
 * Normalização Semântica de Comodidades e Características Imobiliárias
 * Garante uma única fonte de verdade para a taxonomia e impede a criação de comodidades
 * duplicadas ou de texto livre quando já existe opção canônica estruturada.
 */

export const CANONICAL_AMENITIES = [
  'Academia',
  'Cinema',
  'Elevador',
  'Escada',
  'Espaço gourmet',
  'Lavanderia',
  'Minimercado',
  'Piscina',
  'Portaria física',
  'Portaria virtual',
  'Recepção',
  'Restaurante',
  'Rooftop',
  'Salão de festas',
  'Salão de jogos',
  'Sem área de lazer',
] as const;

export type CanonicalAmenity = typeof CANONICAL_AMENITIES[number];

/**
 * Normaliza uma string simples: remove acentos, múltiplos espaços e converte para minúsculas.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

interface NormalizationResult {
  buildingFeatures: string[];
  inferredParkingSpaces?: number;
  apartmentFeaturesToAdd?: string[];
}

/**
 * Mapeia variações comuns e expressões compostas para comodidades canônicas ou campos estruturados.
 */
export function normalizeAmenityInput(
  rawInput: string,
  existingAmenities: string[] = []
): NormalizationResult {
  const normalized = normalizeText(rawInput);
  if (!normalized) {
    return { buildingFeatures: existingAmenities };
  }

  const addedCanonical = new Set<string>();
  const customFeaturesToAdd: string[] = [];
  let inferredParking: number | undefined;
  const aptFeatures: string[] = [];

  // ── 1. REGRA: Vagas e Garagens pertencem aos campos estruturados ──
  if (
    normalized.includes('garagem') ||
    normalized.includes('vaga') ||
    normalized.includes('estacionamento')
  ) {
    // Se for garagem/vaga privativa ou coberta, pertence aos atributos de vaga, não a comodidades
    if (
      normalized.includes('coberta') ||
      normalized.includes('privativa') ||
      normalized.includes('garagem')
    ) {
      inferredParking = 1;
      // Não cria comodidade de condomínio para garagem privativa
      return {
        buildingFeatures: existingAmenities,
        inferredParkingSpaces: inferredParking,
      };
    }
  }

  // ── 2. CARACTERÍSTICAS COMPOSTAS: ex: "piscina na cobertura", "piscina no rooftop" ──
  if (
    normalized.includes('piscina') &&
    (normalized.includes('cobertura') || normalized.includes('rooftop'))
  ) {
    addedCanonical.add('Piscina');
    addedCanonical.add('Rooftop');
  }

  // ── 3. MAPAS DE SINÔNIMOS E EQUIVALÊNCIAS SEMÂNTICAS ──
  else if (
    /\belevador(es)?\b/.test(normalized) ||
    normalized.includes('elevador social') ||
    normalized.includes('elevador de servico')
  ) {
    addedCanonical.add('Elevador');
  } else if (
    normalized.includes('portaria 24') ||
    normalized.includes('porteiro 24') ||
    normalized.includes('portaria fisica') ||
    normalized.includes('portaria presencial') ||
    normalized.includes('guarita') ||
    normalized === 'portaria' ||
    normalized === 'porteiro'
  ) {
    // Portaria física
    addedCanonical.add('Portaria física');
  } else if (
    normalized.includes('portaria virtual') ||
    normalized.includes('portaria remota') ||
    normalized.includes('portaria eletronica') ||
    normalized.includes('portaria digital') ||
    normalized.includes('portaria inteligente')
  ) {
    // Portaria virtual (diferente de portaria física)
    addedCanonical.add('Portaria virtual');
  } else if (
    normalized.includes('academia') ||
    normalized.includes('fitness') ||
    normalized.includes('musculacao') ||
    normalized.includes('espaco fitness')
  ) {
    addedCanonical.add('Academia');
  } else if (
    normalized.includes('piscina') &&
    !normalized.includes('privativa')
  ) {
    addedCanonical.add('Piscina');
  } else if (
    normalized.includes('rooftop') ||
    normalized.includes('cobertura coletiva') ||
    normalized.includes('terraco coletivo')
  ) {
    addedCanonical.add('Rooftop');
  } else if (
    normalized.includes('salao de festa') ||
    normalized.includes('espaco de festa') ||
    normalized.includes('salao de festas')
  ) {
    addedCanonical.add('Salão de festas');
  } else if (
    normalized.includes('salao de jogo') ||
    normalized.includes('sala de jogos') ||
    normalized.includes('salao de jogos') ||
    normalized === 'jogos'
  ) {
    addedCanonical.add('Salão de jogos');
  } else if (
    normalized.includes('espaco gourmet') ||
    normalized.includes('area gourmet') ||
    normalized.includes('espaco por meio') // corrige erro comum de transcrição de áudio
  ) {
    addedCanonical.add('Espaço gourmet');
  } else if (
    normalized.includes('minimercado') ||
    normalized.includes('mini mercado') ||
    normalized.includes('market') ||
    normalized.includes('mercado autonomo') ||
    normalized.includes('conveniencia')
  ) {
    addedCanonical.add('Minimercado');
  } else if (
    normalized.includes('lavanderia') ||
    normalized.includes('lavanderia compartilhada') ||
    normalized.includes('lavanderia coletiva')
  ) {
    addedCanonical.add('Lavanderia');
  } else if (
    normalized.includes('cinema') ||
    normalized.includes('cine')
  ) {
    addedCanonical.add('Cinema');
  } else if (
    normalized.includes('recepcao') ||
    normalized.includes('lobby') ||
    normalized.includes('hall social')
  ) {
    addedCanonical.add('Recepção');
  } else if (
    normalized.includes('restaurante') ||
    normalized.includes('bistro')
  ) {
    addedCanonical.add('Restaurante');
  } else if (
    normalized.includes('escada') ||
    normalized.includes('sem elevador')
  ) {
    addedCanonical.add('Escada');
  } else if (
    normalized.includes('sem lazer') ||
    normalized.includes('sem area de lazer') ||
    normalized.includes('nao tem lazer') ||
    normalized.includes('nao possui lazer')
  ) {
    return {
      buildingFeatures: ['Sem área de lazer'],
    };
  }

  // ── 4. Atributos Privativos do Apartamento (se o usuário colocou no lugar errado) ──
  else if (normalized.includes('vista mar') || normalized.includes('vista para o mar')) {
    aptFeatures.push('Vista mar');
  } else if (normalized.includes('varanda gourmet')) {
    aptFeatures.push('Varanda gourmet');
  } else if (normalized.includes('movel projetado') || normalized.includes('planejado')) {
    aptFeatures.push('Móveis projetados');
  } else if (normalized.includes('ar condicionado')) {
    aptFeatures.push('Ar-condicionado');
  }

  // ── 5. Match direto com a lista canônica (caso acentos ou maiúsculas variem) ──
  else {
    const directCanonical = CANONICAL_AMENITIES.find(
      (c) => normalizeText(c) === normalized
    );
    if (directCanonical) {
      addedCanonical.add(directCanonical);
    } else {
      // É uma comodidade customizada legítima (ex: "Quadra de tênis", "Coworking")
      // Capitaliza primeira letra de cada palavra relevante
      const formatted = rawInput
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map((w, i) => (i === 0 || w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
        .join(' ');
      customFeaturesToAdd.push(formatted);
    }
  }

  // Merge das comodidades existentes com as novas
  const currentSet = new Set(existingAmenities);

  // Se 'Sem área de lazer' estiver presente e uma nova comodidade foi adicionada, remove 'Sem área de lazer'
  if (addedCanonical.size > 0 || customFeaturesToAdd.length > 0) {
    currentSet.delete('Sem área de lazer');
  }

  addedCanonical.forEach((item) => currentSet.add(item));

  // Adiciona customizadas evitando duplicatas normalizadas
  customFeaturesToAdd.forEach((customItem) => {
    const customNorm = normalizeText(customItem);
    const alreadyExists = Array.from(currentSet).some(
      (existing) => normalizeText(existing) === customNorm
    );
    if (!alreadyExists) {
      currentSet.add(customItem);
    }
  });

  return {
    buildingFeatures: Array.from(currentSet),
    inferredParkingSpaces: inferredParking,
    apartmentFeaturesToAdd: aptFeatures.length > 0 ? aptFeatures : undefined,
  };
}

/**
 * Normaliza uma lista completa de comodidades brutas (usada após extração de IA ou migração de dados).
 */
export function normalizeAmenityList(
  rawList: string[],
  contextData?: { parking_spaces?: number | null; apartment_features?: string[] }
): {
  building_features: string[];
  parking_spaces?: number;
  apartment_features?: string[];
} {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return { building_features: [] };
  }

  let currentFeatures: string[] = [];
  let inferredParking: number | undefined = contextData?.parking_spaces ?? undefined;
  const aptFeaturesSet = new Set<string>(contextData?.apartment_features || []);

  for (const item of rawList) {
    const result = normalizeAmenityInput(item, currentFeatures);
    currentFeatures = result.buildingFeatures;
    if (result.inferredParkingSpaces && (!inferredParking || inferredParking === 0)) {
      inferredParking = result.inferredParkingSpaces;
    }
    if (result.apartmentFeaturesToAdd) {
      result.apartmentFeaturesToAdd.forEach((f) => aptFeaturesSet.add(f));
    }
  }

  // Se 'Sem área de lazer' estiver junto com outras comodidades, as outras têm precedência
  if (currentFeatures.length > 1 && currentFeatures.includes('Sem área de lazer')) {
    currentFeatures = currentFeatures.filter((f) => f !== 'Sem área de lazer');
  }

  return {
    building_features: currentFeatures,
    parking_spaces: inferredParking,
    apartment_features: Array.from(aptFeaturesSet),
  };
}
