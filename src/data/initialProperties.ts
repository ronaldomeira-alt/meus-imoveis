import type { Property } from '../types/property';

export const initialProperties: Property[] = [
  // ── 1 a 4: Adicionados Recentemente (Carrossel - Idênticos à Imagem) ──
  {
    id: 'prop-01',
    type: 'Apartamento',
    neighborhood: 'Bessa',
    address: 'Av. Arthur Monteiro de Paiva, 620',
    number: '620',
    condominium_name: 'Residencial Infinity Coast',
    unit: '702',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 64,
    price: 497896, // Faixa 400-500k (#1)
    condo_fee: 450,
    iptu: 680,
    position: 'Nascente',
    condition: 'Novo',
    furnished: true,
    building_features: ['Piscina', 'Rooftop', 'Elevador', 'Portaria 24h', 'Academia'],
    apartment_features: ['Vista mar', 'Varanda gourmet', 'Móveis projetados', 'Ar-condicionado'],
    notes: 'Apartamento com vista mar privilegiada no Bessa, andar alto, finamente mobiliado.',
    source_type: 'Próprio', // Próprio #1
    owner_name: 'Roberto Meira Silva',
    owner_phone: '(83) 98844-1234',
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // Semana #1
    updated_at: new Date().toISOString(),
    photos: [
      { id: 'ph-01', property_id: 'prop-01', storage_path: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }
    ]
  },
  {
    id: 'prop-02',
    type: 'Apartamento',
    neighborhood: 'Manaíra',
    address: 'Av. Guarabira, 890',
    number: '890',
    condominium_name: 'Edifício Royal Sunset',
    unit: '1103',
    bedrooms: 3,
    suites: 2,
    bathrooms: 3,
    parking_spaces: 2,
    area_m2: 102,
    price: 690000, // Faixa 500-700k (#1)
    condo_fee: 620,
    iptu: 950,
    position: 'Nascente',
    condition: 'Novo',
    furnished: false,
    building_features: ['Piscina aquecida', 'Elevador', 'Academia completa', 'Salão de festas'],
    apartment_features: ['Varanda gourmet ampla', 'Lavabo'],
    source_type: 'Parceiro', // Parceiro #1
    partner_name: 'Imobiliária Litoral JP',
    partner_phone: '(83) 99123-5566',
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(), // Semana #2
    updated_at: new Date().toISOString(),
    photos: [
      { id: 'ph-02', property_id: 'prop-02', storage_path: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }
    ]
  },
  {
    id: 'prop-03',
    type: 'Studio',
    neighborhood: 'Intermares',
    address: 'Av. Mar Vermelho, 410',
    number: '410',
    condominium_name: 'Residencial Sunset Waves',
    unit: '304',
    bedrooms: 1,
    suites: 1,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 25,
    price: 297500, // Faixa Até 300k (#1)
    condo_fee: 280,
    iptu: 450,
    position: 'Nascente',
    condition: 'Novo',
    furnished: true,
    building_features: ['Piscina', 'Rooftop', 'Elevador', 'Portaria 24h', 'Lavanderia'],
    apartment_features: ['Móveis projetados', 'Ar-condicionado'],
    notes: 'Studio pronto para morar ou rentabilizar com locação por temporada.',
    source_type: 'Próprio', // Próprio #2
    owner_name: 'Carlos Albuquerque',
    owner_phone: '(83) 98844-9988',
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(), // Semana #3
    updated_at: new Date().toISOString(),
    photos: [
      { id: 'ph-03', property_id: 'prop-03', storage_path: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }
    ]
  },
  {
    id: 'prop-04',
    type: 'Apartamento',
    neighborhood: 'Cabo Branco',
    address: 'Av. Cabo Branco, 2140',
    number: '2140',
    condominium_name: 'Residencial Mare D’Oro',
    unit: '402',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 67,
    price: 610000, // Faixa 500-700k (#2)
    condo_fee: 520,
    iptu: 780,
    position: 'Nascente',
    condition: 'Novo',
    furnished: true,
    building_features: ['Piscina', 'Rooftop lounge', 'Elevador', 'Portaria virtual'],
    apartment_features: ['Vista mar', 'Varanda gourmet'],
    source_type: 'Parceiro', // Parceiro #2
    partner_name: 'Corretor Eduardo Santos',
    partner_phone: '(83) 99887-1122',
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(), // Semana #4
    updated_at: new Date().toISOString(),
    photos: [
      { id: 'ph-04', property_id: 'prop-04', storage_path: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }
    ]
  },

  // ── 5 a 7: Restante da Faixa Até R$ 300 mil (Total 4) ──
  {
    id: 'prop-05',
    type: 'Flat',
    neighborhood: 'Bessa',
    address: 'Rua Afonso Pena, 120',
    bedrooms: 1,
    suites: 1,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 32,
    price: 285000, // Faixa Até 300k (#2)
    building_features: ['Elevador', 'Piscina'],
    apartment_features: ['Varanda'],
    source_type: 'Próprio', // Próprio #3
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-05', property_id: 'prop-05', storage_path: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-06',
    type: 'Studio',
    neighborhood: 'Manaíra',
    address: 'Av. João Câncio, 450',
    bedrooms: 1,
    suites: 0,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 26,
    price: 290000, // Faixa Até 300k (#3)
    building_features: ['Elevador', 'Piscina', 'Academia'],
    apartment_features: ['Móveis planejados'],
    source_type: 'Parceiro', // Parceiro #3
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 18).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-06', property_id: 'prop-06', storage_path: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-07',
    type: 'Studio',
    neighborhood: 'Tambaú',
    address: 'Rua Olinda, 210',
    bedrooms: 1,
    suites: 1,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 24,
    price: 275000, // Faixa Até 300k (#4)
    building_features: ['Piscina', 'Elevador'],
    apartment_features: ['Vista mar'],
    source_type: 'Próprio', // Próprio #4
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-07', property_id: 'prop-07', storage_path: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },

  // ── 8 a 13: Faixa R$ 300 mil a 400 mil (Total 6) ──
  {
    id: 'prop-08',
    type: 'Apartamento',
    neighborhood: 'Bessa',
    address: 'Rua Arthur Monteiro de Paiva, 305',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 58,
    price: 380800, // Faixa 300-400k (#1)
    building_features: ['Piscina', 'Elevador', 'Salão de festas'],
    apartment_features: ['Varanda gourmet', 'Nascente'],
    source_type: 'Próprio', // Próprio #5
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-08', property_id: 'prop-08', storage_path: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-09',
    type: 'Apartamento',
    neighborhood: 'Cabo Branco',
    address: 'Rua Juarez Távora, 420',
    bedrooms: 1,
    suites: 1,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 30,
    price: 357000, // Faixa 300-400k (#2)
    building_features: ['Piscina', 'Elevador', 'Academia'],
    apartment_features: ['Vista mar', 'Móveis projetados'],
    source_type: 'Parceiro', // Parceiro #4
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-09', property_id: 'prop-09', storage_path: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-10',
    type: 'Apartamento',
    neighborhood: 'Manaíra',
    address: 'Av. João Maurício, 740',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 56,
    price: 395000, // Faixa 300-400k (#3)
    building_features: ['Piscina', 'Elevador', 'Salão de festas'],
    apartment_features: ['Varanda', 'Cozinha planejada'],
    source_type: 'Próprio', // Próprio #6
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 19).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-10', property_id: 'prop-10', storage_path: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-11',
    type: 'Apartamento',
    neighborhood: 'Intermares',
    address: 'Rua Golfo de Botnia, 180',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 55,
    price: 365000, // Faixa 300-400k (#4)
    building_features: ['Piscina', 'Elevador'],
    apartment_features: ['Varanda gourmet'],
    source_type: 'Próprio', // Próprio #7
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 22).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-11', property_id: 'prop-11', storage_path: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-12',
    type: 'Apartamento',
    neighborhood: 'Tambaú',
    address: 'Rua Nossa Senhora dos Navegantes, 500',
    bedrooms: 1,
    suites: 1,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 36,
    price: 340000, // Faixa 300-400k (#5)
    building_features: ['Piscina', 'Elevador'],
    apartment_features: ['Varanda'],
    source_type: 'Parceiro', // Parceiro #5
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-12', property_id: 'prop-12', storage_path: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-13',
    type: 'Apartamento',
    neighborhood: 'Aeroclube',
    address: 'Rua Poeta Luiz Raimundo de Oliveira, 150',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 54,
    price: 320000, // Faixa 300-400k (#6)
    building_features: ['Elevador', 'Playground'],
    apartment_features: ['Móveis na cozinha'],
    source_type: 'Próprio', // Próprio #8
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 28).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-13', property_id: 'prop-13', storage_path: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },

  // ── 14 a 20: Faixa R$ 400 mil a 500 mil (Total 7) ──
  // prop-01 já é Faixa 400-500k (#1)
  {
    id: 'prop-14',
    type: 'Apartamento',
    neighborhood: 'Bessa',
    address: 'Rua Francisco Leocádio Ribeiro Coutinho, 220',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 60,
    price: 450000, // Faixa 400-500k (#2)
    building_features: ['Piscina', 'Elevador'],
    apartment_features: ['Varanda gourmet'],
    source_type: 'Próprio', // Próprio #9
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 16).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-14', property_id: 'prop-14', storage_path: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-15',
    type: 'Apartamento',
    neighborhood: 'Manaíra',
    address: 'Rua Reinaldo Tavares de Melo, 310',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 62,
    price: 480000, // Faixa 400-500k (#3)
    building_features: ['Piscina', 'Elevador', 'Academia'],
    apartment_features: ['Varanda gourmet'],
    source_type: 'Parceiro', // Parceiro #6
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 17).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-15', property_id: 'prop-15', storage_path: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-16',
    type: 'Apartamento',
    neighborhood: 'Cabo Branco',
    address: 'Av. Monsenhor Odilon Pinto Coutinho, 180',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 58,
    price: 460000, // Faixa 400-500k (#4)
    building_features: ['Piscina', 'Elevador'],
    apartment_features: ['Vista mar'],
    source_type: 'Próprio', // Próprio #10
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 21).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-16', property_id: 'prop-16', storage_path: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-17',
    type: 'Apartamento',
    neighborhood: 'Intermares',
    address: 'Av. Oceano Atlântico, 950',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 63,
    price: 430000, // Faixa 400-500k (#5)
    building_features: ['Piscina', 'Elevador'],
    apartment_features: ['Varanda'],
    source_type: 'Parceiro', // Parceiro #7
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 23).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-17', property_id: 'prop-17', storage_path: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-18',
    type: 'Apartamento',
    neighborhood: 'Aeroclube',
    address: 'Rua Bacharel José de Oliveira Curchatuz, 600',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 2,
    area_m2: 70,
    price: 440000, // Faixa 400-500k (#6)
    building_features: ['Elevador', 'Academia'],
    apartment_features: ['Varanda gourmet'],
    source_type: 'Próprio', // Próprio #11
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 26).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-18', property_id: 'prop-18', storage_path: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-19',
    type: 'Apartamento',
    neighborhood: 'Bessa',
    address: 'Rua Miramar, 140',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 65,
    price: 485000, // Faixa 400-500k (#7)
    building_features: ['Piscina', 'Elevador'],
    apartment_features: ['Varanda gourmet', 'Nascente'],
    source_type: 'Próprio', // Próprio #12
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-19', property_id: 'prop-19', storage_path: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },

  // ── 21 e 22: Restante da Faixa R$ 500 mil a 700 mil (Total 4) ──
  // prop-02 e prop-04 já são Faixa 500-700k (#1 e #2)
  {
    id: 'prop-20',
    type: 'Apartamento',
    neighborhood: 'Jardim Oceania', // Bairro extra
    address: 'Av. Gov. Argemiro de Figueiredo, 1800',
    bedrooms: 3,
    suites: 2,
    bathrooms: 3,
    parking_spaces: 2,
    area_m2: 85,
    price: 580000, // Faixa 500-700k (#3)
    building_features: ['Piscina', 'Elevador', 'Academia'],
    apartment_features: ['Varanda gourmet'],
    source_type: 'Próprio', // Próprio #13
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 32).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-20', property_id: 'prop-20', storage_path: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-21',
    type: 'Apartamento',
    neighborhood: 'Miramar', // Bairro extra
    address: 'Av. Epitácio Pessoa, 3400',
    bedrooms: 3,
    suites: 2,
    bathrooms: 3,
    parking_spaces: 2,
    area_m2: 95,
    price: 650000, // Faixa 500-700k (#4)
    building_features: ['Piscina', 'Elevador', 'Salão de festas'],
    apartment_features: ['Varanda'],
    source_type: 'Parceiro', // Parceiro #8
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 35).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-21', property_id: 'prop-21', storage_path: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },

  // ── 23 e 24: Faixa R$ 700 mil a 1 mi (Total 2) ──
  {
    id: 'prop-22',
    type: 'Cobertura',
    neighborhood: 'Bessa',
    address: 'Av. Argemiro de Figueiredo, 2900',
    bedrooms: 3,
    suites: 3,
    bathrooms: 4,
    parking_spaces: 3,
    area_m2: 140,
    price: 850000, // Faixa 700k-1mi (#1)
    building_features: ['Piscina', 'Rooftop', 'Elevador'],
    apartment_features: ['Piscina privativa', 'Vista mar'],
    source_type: 'Próprio', // Próprio #14
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-22', property_id: 'prop-22', storage_path: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },
  {
    id: 'prop-23',
    type: 'Apartamento',
    neighborhood: 'Portal do Sol', // Bairro extra
    address: 'Rua Manoel Paulino Cavalcanti, 110',
    bedrooms: 4,
    suites: 3,
    bathrooms: 4,
    parking_spaces: 3,
    area_m2: 155,
    price: 920000, // Faixa 700k-1mi (#2)
    building_features: ['Piscina', 'Elevador', 'Academia'],
    apartment_features: ['Varanda gourmet'],
    source_type: 'Parceiro', // Parceiro #9
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-23', property_id: 'prop-23', storage_path: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  },

  // ── 24: Faixa Acima de R$ 1 mi (Total 1) ──
  {
    id: 'prop-24',
    type: 'Cobertura',
    neighborhood: 'Altiplano',
    address: 'Rua Poeta Targino Teixeira, 450',
    bedrooms: 4,
    suites: 4,
    bathrooms: 5,
    parking_spaces: 4,
    area_m2: 245,
    price: 1650000, // Faixa Acima 1mi (#1)
    building_features: ['Piscina de borda infinita', 'Rooftop', 'Elevador', 'Heliponto'],
    apartment_features: ['Vista mar panorâmica', 'Piscina privativa', 'Varanda gourmet'],
    source_type: 'Próprio', // Próprio #15
    status: 'Ativo',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 50).toISOString(),
    updated_at: new Date().toISOString(),
    photos: [{ id: 'ph-24', property_id: 'prop-24', storage_path: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80', sort_order: 0, is_cover: true }]
  }
];
