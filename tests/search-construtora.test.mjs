import assert from 'node:assert';

// Lógica de busca extraída de App.tsx
function filterProperties(properties, searchQuery) {
  return properties.filter((p) => {
    if (searchQuery.trim()) {
      const normalize = (str = '') =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

      const q = normalize(searchQuery);
      const qTerms = q.split(/\s+/).filter(Boolean);

      const construtora = p.construtora || p.origem_nome || (p.source_type === 'Construtora' ? p.partner_name : '') || '';
      const partner = p.partner_name || '';
      const condo = p.condominium_name || '';
      const title = p.title || '';
      const internalName = p.internal_name || '';
      const neighborhood = p.neighborhood || '';
      const type = p.type || '';
      const address = p.address || '';
      const notes = p.notes || '';
      const unit = p.unit || '';
      const sourceType = p.source_type || '';

      const allFields = [
        construtora,
        partner,
        condo,
        title,
        internalName,
        neighborhood,
        type,
        `${type} ${neighborhood}`,
        address,
        notes,
        unit,
        sourceType,
      ].map(normalize);

      const combinedText = allFields.join(' ');

      const matchesExact = combinedText.includes(q);
      const matchesAllTerms = qTerms.length > 0 && qTerms.every((term) => combinedText.includes(term));

      if (!matchesExact && !matchesAllTerms) {
        return false;
      }
    }
    return true;
  });
}

const mockProperties = [
  {
    id: '1',
    condominium_name: 'Unigreen',
    type: 'Apartamento',
    neighborhood: 'Manaíra',
    source_type: 'Construtora',
    construtora: 'Alliance Empreendimentos',
    partner_name: 'Alliance Empreendimentos',
  },
  {
    id: '2',
    condominium_name: 'Ilha de Maui',
    type: 'Apartamento',
    neighborhood: 'Camboinha',
    source_type: 'Construtora',
    construtora: 'Setai Construtora',
    partner_name: 'Setai Construtora',
  },
  {
    id: '3',
    condominium_name: 'Makar',
    type: 'Apartamento',
    neighborhood: 'Ponta de Campina',
    source_type: 'Construtora',
    construtora: 'Massai Construções',
    partner_name: 'Massai Construções',
  },
  {
    id: '4',
    condominium_name: 'Bless Compactos',
    type: 'Studio',
    neighborhood: 'Intermares',
    source_type: 'Próprio',
    construtora: null,
  },
];

console.log('Testando busca por construtora...');

// 1. Busca por nome da construtora exato
const res1 = filterProperties(mockProperties, 'Alliance');
assert.strictEqual(res1.length, 1);
assert.strictEqual(res1[0].condominium_name, 'Unigreen');
console.log('✓ Busca por "Alliance" retornou Unigreen');

// 2. Busca por construtora minúscula / sem acento
const res2 = filterProperties(mockProperties, 'setai');
assert.strictEqual(res2.length, 1);
assert.strictEqual(res2[0].condominium_name, 'Ilha de Maui');
console.log('✓ Busca por "setai" retornou Ilha de Maui');

// 3. Busca por construtora com acentuação e cedilha ("Construções" vs "construcoes")
const res3 = filterProperties(mockProperties, 'massai construcoes');
assert.strictEqual(res3.length, 1);
assert.strictEqual(res3[0].condominium_name, 'Makar');
console.log('✓ Busca por "massai construcoes" (sem acento) retornou Makar');

// 4. Busca combinada: Construtora + Bairro ("Alliance Manaíra" e "alliance manaira")
const res4 = filterProperties(mockProperties, 'Alliance manaira');
assert.strictEqual(res4.length, 1);
assert.strictEqual(res4[0].condominium_name, 'Unigreen');
console.log('✓ Busca combinada "Alliance manaira" retornou Unigreen');

// 5. Busca por condomínio existente continua funcionando
const res5 = filterProperties(mockProperties, 'Bless');
assert.strictEqual(res5.length, 1);
assert.strictEqual(res5[0].condominium_name, 'Bless Compactos');
console.log('✓ Busca tradicional por condomínio "Bless" funcionou');

console.log('\nTodos os testes de busca passaram com sucesso!');
