import type {
  LeadSearchProfile,
  PropertyProjection,
  MatchEvaluationResult,
  MatchScoreBreakdown,
} from './types';

function normalizeString(val: string): string {
  return val
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Motor determinístico de Match entre Lead e Imóvel.
 * Baseado puramente em regras de negócio, dados estruturados e pesos definidos no contrato.
 * "IA entende pessoas. Regras fazem o Match."
 */
export function evaluateMatch(
  profile: LeadSearchProfile,
  property: PropertyProjection
): MatchEvaluationResult {
  const breakdown: MatchScoreBreakdown = {
    price: 0,
    location: 0,
    propertyType: 0,
    bedrooms: 0,
    purpose: 0,
    delivery: 0,
    area: 0,
    penalties: [],
    reasons: [],
  };

  // ------------------------------------------------------------
  // 0. AVALIAÇÃO DE TIPOLOGIAS (PARA EMPREENDIMENTOS)
  // Previne falsos positivos entre extremos (ex: lead de 3 quartos e 400k dando match em empreendimento com studio de 270k e 3Q de 790k)
  // ------------------------------------------------------------
  let activeEntryPrice = property.priceMin > 0 ? property.priceMin : property.priceMax;
  let activeBedroomsMin = property.bedroomsMin;
  let activeBedroomsMax = property.bedroomsMax;
  let activeAreaMin = property.areaMin;
  let activeAreaMax = property.areaMax;

  if (property.typologies && property.typologies.length > 0) {
    const validTypologies = property.typologies.filter((t) => {
      // 1. Tipologia de imóvel restrita
      if (profile.propertyTypeStrict && profile.propertyTypes.length > 0) {
        const normType = normalizeString(t.type);
        const matchType = profile.propertyTypes.some((pt) => {
          const normPt = normalizeString(pt);
          return normType.includes(normPt) || normPt.includes(normType);
        });
        if (!matchType) return false;
      }

      // 2. Quartos simultâneos com preço
      if (profile.bedrooms.length > 0) {
        if (profile.bedroomsStrict) {
          const minRequiredBedrooms = Math.min(...profile.bedrooms);
          if (t.bedrooms < minRequiredBedrooms) return false;
        } else {
          const hasBedroomFit = profile.bedrooms.some((b) => b === t.bedrooms || Math.abs(b - t.bedrooms) <= 1);
          if (!hasBedroomFit) return false;
        }
      }

      // 3. Preço da tipologia específica
      if (profile.priceMax !== null && profile.priceMax > 0 && t.priceFrom > 0) {
        const budgetLimit = profile.priceStrictMax ? profile.priceMax : profile.priceMax * 1.1;
        if (t.priceFrom > budgetLimit) return false;
      }

      return true;
    });

    if (validTypologies.length === 0) {
      if (profile.bedrooms.length > 0 && profile.priceMax !== null && profile.priceMax > 0) {
        const matchingBedTypologies = property.typologies.filter((t) => {
          if (profile.bedroomsStrict) return t.bedrooms >= Math.min(...profile.bedrooms);
          return profile.bedrooms.includes(t.bedrooms);
        });
        if (matchingBedTypologies.length > 0) {
          const lowestMatchingPrice = Math.min(...matchingBedTypologies.map((t) => t.priceFrom));
          return eliminated(
            `Unidades com ${matchingBedTypologies[0].bedrooms} quarto(s) iniciam em R$ ${lowestMatchingPrice.toLocaleString('pt-BR')}, acima do orçamento de R$ ${profile.priceMax.toLocaleString('pt-BR')}`,
            breakdown
          );
        }
      }
      return eliminated(
        'Nenhuma tipologia do empreendimento atende simultaneamente aos requisitos de quartos, tipo e orçamento do cliente',
        breakdown
      );
    }

    // Se há tipologias válidas, calibra os valores ativos com base na tipologia mais aderente
    let bestTypology = validTypologies[0];
    if (profile.bedrooms.length > 0) {
      const exactBedTyp = validTypologies.find((t) => profile.bedrooms.includes(t.bedrooms));
      if (exactBedTyp) bestTypology = exactBedTyp;
    }

    activeEntryPrice = bestTypology.priceFrom;
    activeBedroomsMin = bestTypology.bedrooms;
    activeBedroomsMax = bestTypology.bedrooms;
    activeAreaMin = bestTypology.areaMin;
    activeAreaMax = bestTypology.areaMax ?? bestTypology.areaMin;
    breakdown.reasons.push(
      `Tipologia compatível: ${bestTypology.title || `${bestTypology.type} (${bestTypology.bedrooms === 0 ? 'Studio' : `${bestTypology.bedrooms}Q`})`} a partir de R$ ${bestTypology.priceFrom.toLocaleString('pt-BR')}`
    );
  }

  // ------------------------------------------------------------
  // 1. CRITÉRIOS ELIMINATÓRIOS INEQUÍVOCOS (FASE 6)
  // ------------------------------------------------------------

  // 1.1 Venda vs Locação
  if (profile.isShortStayOnly) {
    return eliminated('Cliente busca exclusivamente hospedagem/temporada — incompatível com estoque comum', breakdown);
  }

  if (profile.operation && property.operation) {
    const profOp = normalizeString(profile.operation);
    const propOp = normalizeString(property.operation);
    const isRentLead = profOp.includes('loca') || profOp.includes('alug');
    const isSaleLead = profOp.includes('vend') || profOp.includes('comp');
    const isRentProp = propOp.includes('loca') || propOp.includes('alug');
    const isSaleProp = propOp.includes('vend') || propOp.includes('comp');

    if (isRentLead && isSaleProp && !isRentProp) {
      return eliminated('Cliente procura aluguel e imóvel é somente para venda', breakdown);
    }
    if (isSaleLead && isRentProp && !isSaleProp) {
      return eliminated('Cliente procura compra e imóvel é somente para locação', breakdown);
    }
  }

  // 1.2 Tipologia Obrigatória ("Somente X")
  const propTypeNorm = normalizeString(property.propertyType);
  if (profile.propertyTypeStrict && profile.propertyTypes.length > 0) {
    const acceptedTypes = profile.propertyTypes.map(normalizeString);
    if (!acceptedTypes.some((t) => propTypeNorm.includes(t) || t.includes(propTypeNorm))) {
      return eliminated(
        `Cliente exige restritamente ${profile.propertyTypes.join(', ')} e imóvel é ${property.propertyType}`,
        breakdown
      );
    }
  }

  // 1.3 Localização Obrigatória ("Somente Bessa")
  const propNeighborhoodNorm = normalizeString(property.neighborhood);
  if (profile.locationStrict && profile.locations.length > 0) {
    const acceptedLocs = profile.locations.map(normalizeString);
    if (!acceptedLocs.some((l) => propNeighborhoodNorm.includes(l) || l.includes(propNeighborhoodNorm))) {
      return eliminated(
        `Cliente exige restritamente localização em ${profile.locations.join(', ')} e imóvel fica no ${property.neighborhood}`,
        breakdown
      );
    }
  }

  // 1.4 Pronto vs Planta Obrigatório ("Só quero pronto")
  const propDelivery = property.deliveryStatus;
  if (profile.deliveryStrict && profile.deliveryStatus.length > 0) {
    if (!profile.deliveryStatus.includes(propDelivery)) {
      return eliminated(
        `Cliente exige entrega ${profile.deliveryStatus.join(', ')} e imóvel está ${property.deliveryStatus}`,
        breakdown
      );
    }
  }

  // 1.5 Prazo de Entrega Impossível
  if (profile.maxDeliveryYear && property.deliveryDeadline) {
    const deadlineYear = new Date(property.deliveryDeadline).getFullYear();
    if (!isNaN(deadlineYear) && deadlineYear > profile.maxDeliveryYear) {
      return eliminated(
        `Previsão de entrega (${deadlineYear}) excede o prazo limite do cliente (${profile.maxDeliveryYear})`,
        breakdown
      );
    }
  }

  // 1.6 Quartos Obrigatórios ("Preciso de X quartos")
  const isResidential = !['terreno', 'lote', 'comercial', 'sala'].includes(propTypeNorm);
  if (isResidential && profile.bedroomsStrict && profile.bedrooms.length > 0) {
    const minRequiredBedrooms = Math.min(...profile.bedrooms);
    const propMaxBedrooms = activeBedroomsMax ?? activeBedroomsMin ?? property.bedroomsMax ?? property.bedroomsMin ?? 0;
    if (propMaxBedrooms < minRequiredBedrooms) {
      return eliminated(
        `Cliente exige no mínimo ${minRequiredBedrooms} quarto(s) e imóvel possui no máximo ${propMaxBedrooms}`,
        breakdown
      );
    }
  }

  // 1.7 Características Obrigatórias (Elevador, Acessibilidade, etc.)
  if (profile.requiredFeatures && profile.requiredFeatures.length > 0) {
    const propFeaturesNorm = property.features.map(normalizeString);
    for (const reqFeat of profile.requiredFeatures) {
      const reqNorm = normalizeString(reqFeat);
      const hasFeat = propFeaturesNorm.some((pf) => pf.includes(reqNorm) || reqNorm.includes(pf));
      if (!hasFeat) {
        return eliminated(
          `Imóvel não possui a característica obrigatória: ${reqFeat}`,
          breakdown
        );
      }
    }
  }

  // 1.8 Preço e Orçamento (com interseção de faixas e tolerância de 10%)
  const entryPrice = activeEntryPrice;
  if (profile.priceMax !== null && profile.priceMax > 0 && entryPrice > 0) {
    const clientBudget = profile.priceMax;
    // Se o cliente declarou limite absoluto (FASE 6: não ultrapassar sequer 1 real)
    if (profile.priceStrictMax) {
      if (entryPrice > clientBudget) {
        return eliminated(
          `Preço de entrada (R$ ${entryPrice.toLocaleString('pt-BR')}) excede o limite financeiro absoluto de R$ ${clientBudget.toLocaleString('pt-BR')}`,
          breakdown
        );
      }
    } else {
      // Tolerância normal de até +10%
      const toleranceMax = clientBudget * 1.1;
      if (entryPrice > toleranceMax) {
        return eliminated(
          `Preço de entrada (R$ ${entryPrice.toLocaleString('pt-BR')}) excede a tolerância máxima (+10%) de R$ ${toleranceMax.toLocaleString('pt-BR')}`,
          breakdown
        );
      }
    }
  }

  // ------------------------------------------------------------
  // 2. PESOS E NORMALIZAÇÃO ADAPTATIVA (FASE 5)
  // ------------------------------------------------------------
  // Pesos Base:
  // Preço: 25, Localização: 20, Tipologia: 15, Quartos: 15, Finalidade: 10, Prazo: 10, Metragem: 5 (Soma = 100)
  const isApplicableBedrooms = isResidential;
  const isApplicableArea = isResidential;

  let totalAvailableWeights = 100;
  if (!isApplicableBedrooms) totalAvailableWeights -= 15;
  if (!isApplicableArea) totalAvailableWeights -= 5;

  const scale = 100 / totalAvailableWeights;
  const weightPrice = 25 * scale;
  const weightLocation = 20 * scale;
  const weightType = 15 * scale;
  const weightBedrooms = isApplicableBedrooms ? 15 * scale : 0;
  const weightPurpose = 10 * scale;
  const weightDelivery = 10 * scale;
  const weightArea = isApplicableArea ? 5 * scale : 0;

  // ------------------------------------------------------------
  // 3. PONTUAÇÃO POR CRITÉRIO
  // ------------------------------------------------------------

  // 3.1 Preço (Base 25%)
  if (profile.priceMax === null || profile.priceMax <= 0 || entryPrice <= 0) {
    // Sem restrição de preço declarada pelo cliente: pontuação neutra proporcional
    breakdown.price = Math.round(weightPrice * 0.8 * 10) / 10;
    breakdown.reasons.push('Preço compatível (sem restrição financeira estrita informada)');
  } else {
    const clientBudget = profile.priceMax;
    if (entryPrice <= clientBudget) {
      // 100% de aderência financeira: tudo abaixo do orçamento é elegível com pontuação integral
      breakdown.price = Math.round(weightPrice * 10) / 10;
      breakdown.reasons.push(
        `Preço dentro do orçamento do cliente (R$ ${entryPrice.toLocaleString('pt-BR')} <= R$ ${clientBudget.toLocaleString('pt-BR')})`
      );
    } else {
      // Entre clientBudget e clientBudget * 1.1: perda progressiva de pontos
      const overRatio = (entryPrice - clientBudget) / (clientBudget * 0.1); // 0 a 1
      const fraction = Math.max(0, 1 - overRatio);
      breakdown.price = Math.round(weightPrice * fraction * 10) / 10;
      breakdown.penalties.push(`Preço ligeiramente acima do orçamento (+${Math.round(overRatio * 10)}% da margem)`);
    }
  }

  // 3.2 Localização (Base 20% - FASE 7)
  let locationNeverMentioned = false;
  if (profile.locations.length === 0) {
    // Cliente não citou bairros
    breakdown.location = Math.round(weightLocation * 0.7 * 10) / 10;
    breakdown.reasons.push(`Localização em ${property.neighborhood}, ${property.city}`);
  } else {
    const acceptedLocs = profile.locations.map(normalizeString);
    const matchedLoc = acceptedLocs.find(
      (l) => propNeighborhoodNorm.includes(l) || l.includes(propNeighborhoodNorm)
    );

    if (matchedLoc) {
      breakdown.location = Math.round(weightLocation * 10) / 10;
      breakdown.reasons.push(`Bairro desejado pelo cliente: ${property.neighborhood}`);
    } else {
      locationNeverMentioned = true;
      breakdown.location = Math.round(weightLocation * 0.3 * 10) / 10;
      breakdown.penalties.push(`Bairro (${property.neighborhood}) não foi mencionado pelo cliente`);
    }
  }

  // 3.3 Tipologia (Base 15%)
  if (profile.propertyTypes.length === 0) {
    breakdown.propertyType = Math.round(weightType * 0.8 * 10) / 10;
  } else {
    const acceptedTypes = profile.propertyTypes.map(normalizeString);
    const matchedType = acceptedTypes.find(
      (t) => propTypeNorm.includes(t) || t.includes(propTypeNorm)
    );
    if (matchedType) {
      breakdown.propertyType = Math.round(weightType * 10) / 10;
      breakdown.reasons.push(`Tipologia exata: ${property.propertyType}`);
    } else {
      // Tipologia diferente, mas não estrita ("prefiro casa")
      breakdown.propertyType = Math.round(weightType * 0.3 * 10) / 10;
      breakdown.penalties.push(`Tipologia ${property.propertyType} diverge da preferência inicial`);
    }
  }

  // 3.4 Quartos / Configuração (Base 15% - FASE 3 & 6)
  if (isApplicableBedrooms) {
    if (profile.bedrooms.length === 0) {
      breakdown.bedrooms = Math.round(weightBedrooms * 0.8 * 10) / 10;
    } else {
      const propMinBed = activeBedroomsMin ?? property.bedroomsMin ?? 1;
      const propMaxBed = activeBedroomsMax ?? property.bedroomsMax ?? propMinBed;
      const hasIntersection = profile.bedrooms.some((b) => b >= propMinBed && b <= propMaxBed);

      if (hasIntersection) {
        breakdown.bedrooms = Math.round(weightBedrooms * 10) / 10;
        breakdown.reasons.push(`Configuração de quartos compatível (${propMinBed === propMaxBed ? propMinBed : `${propMinBed} a ${propMaxBed}`} quartos)`);
      } else {
        // Sem interseção, mas não era requisito eliminatório
        const closestDiff = Math.min(...profile.bedrooms.map((b) => Math.min(Math.abs(b - propMinBed), Math.abs(b - propMaxBed))));
        const factor = closestDiff === 1 ? 0.5 : 0.2;
        breakdown.bedrooms = Math.round(weightBedrooms * factor * 10) / 10;
        breakdown.penalties.push(`Quantidade de quartos diferente da preferência informada`);
      }
    }
  }

  // 3.5 Finalidade (Base 10%)
  if (profile.purpose.length === 0) {
    breakdown.purpose = Math.round(weightPurpose * 0.8 * 10) / 10;
  } else {
    breakdown.purpose = Math.round(weightPurpose * 10) / 10;
    breakdown.reasons.push(`Finalidade adequada (${profile.purpose.join(', ')})`);
  }

  // 3.6 Pronto / Planta / Prazo (Base 10%)
  if (profile.deliveryStatus.length === 0) {
    breakdown.delivery = Math.round(weightDelivery * 0.8 * 10) / 10;
  } else {
    if (profile.deliveryStatus.includes(property.deliveryStatus)) {
      breakdown.delivery = Math.round(weightDelivery * 10) / 10;
      breakdown.reasons.push(`Momento da obra compatível: ${property.deliveryStatus}`);
    } else {
      breakdown.delivery = Math.round(weightDelivery * 0.4 * 10) / 10;
      breakdown.penalties.push(`Estágio da obra (${property.deliveryStatus}) difere da preferência`);
    }
  }

  // 3.7 Metragem (Base 5% - FASE 3)
  if (isApplicableArea) {
    breakdown.area = Math.round(weightArea * 10) / 10;
  }

  // Soma bruta de compatibilidade
  let rawScore =
    breakdown.price +
    breakdown.location +
    breakdown.propertyType +
    breakdown.bedrooms +
    breakdown.purpose +
    breakdown.delivery +
    breakdown.area;

  rawScore = Math.min(100, Math.max(0, Math.round(rawScore)));

  // REGRA DE LOCALIZAÇÃO (FASE 7):
  // Se o imóvel estiver em bairro que o cliente NUNCA mencionou,
  // o Match TOTAL fica limitado a no máximo 69% (não pode virar Bom Match ou Match Forte).
  if (locationNeverMentioned && rawScore > 69) {
    rawScore = 69;
    breakdown.penalties.push('Pontuação limitada a 69% por estar em localização não mencionada pelo lead');
  }

  const isStrong = rawScore >= 85;
  const isGood = rawScore >= 70 && rawScore < 85;
  const isManual = rawScore < 70;

  return {
    eligible: true,
    matchScore: rawScore,
    scoreBreakdown: breakdown,
    commercialPriority: 0,
    isStrongMatch: isStrong,
    isGoodMatch: isGood,
    isManualOnly: isManual,
  };
}

function eliminated(reason: string, breakdown: MatchScoreBreakdown): MatchEvaluationResult {
  breakdown.penalties.push(reason);
  return {
    eligible: false,
    eliminatedReason: reason,
    matchScore: 0,
    scoreBreakdown: breakdown,
    commercialPriority: 0,
    isStrongMatch: false,
    isGoodMatch: false,
    isManualOnly: true,
  };
}
