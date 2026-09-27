import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { normalizeInstagramPost, parseInstagramPostUrl } from '../api/_shared/instagram-import.js';

test('Instagram URL validation and carousel order', () => {
  const url = 'https://www.instagram.com/p/DbtQO6OnO1a/';
  assert.equal(parseInstagramPostUrl(`${url}?utm_source=ig_web_copy_link`), url);
  assert.equal(parseInstagramPostUrl('https://instagram.com/reel/ABC123/'), 'https://www.instagram.com/reel/ABC123/');
  assert.equal(parseInstagramPostUrl('https://instagram.com.evil.test/p/DbtQO6OnO1a/'), null);
  assert.equal(parseInstagramPostUrl('http://instagram.com/p/DbtQO6OnO1a/'), null);
  const post = normalizeInstagramPost({
    caption: 'Apartamento à venda', ownerUsername: 'parceiro',
    childPosts: [
      { displayUrl: 'https://scontent.cdninstagram.com/cover.jpg' },
      { displayUrl: 'https://scontent.cdninstagram.com/second.jpg' },
      { displayUrl: 'https://example.com/unsafe.jpg' },
    ],
  }, url, 'ronaldomeiracorretor');
  assert.deepEqual(post.images, [
    'https://scontent.cdninstagram.com/cover.jpg',
    'https://scontent.cdninstagram.com/second.jpg',
  ]);
  assert.equal(post.isOwnPost, false);
  assert.equal(normalizeInstagramPost({ username: 'ronaldomeiracorretor' }, url, 'ronaldomeiracorretor').isOwnPost, true);
});

test('caption fills only stated property values and rewrites the description', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { prepareInstagramProperty } = await server.ssrLoadModule('/src/lib/instagram-import.ts');
    const { extractPropertyWithGemini } = await server.ssrLoadModule('/src/lib/gemini.ts');
    const url = 'https://www.instagram.com/p/DbtQO6OnO1a/';
    const post = {
      url, username: 'corretorparceiro', ownerName: 'Corretor Parceiro', isOwnPost: false, images: [],
      caption: 'Oportunidade! Apartamento à venda em Cabo Branco, 47 m², 2 quartos, 1 vaga privativa. Porteira fechada. Condomínio: R$ 650. Valor de venda: R$ 750.000. Piscina, academia, brinquedoteca e mini mercado. Aluguel de curta temporada permitido.',
    };
    const data = prepareInstagramProperty(post, {
      type: 'Apartamento', neighborhood: 'Cabo Branco', area_m2: 47, bedrooms: 2,
      parking_spaces: 1, purpose: 'Locação', building_features: [], apartment_features: [],
    });
    assert.equal(data.purpose, 'Venda');
    assert.equal(data.price, 750000);
    assert.equal(data.condo_fee, 650);
    assert.equal(data.iptu, undefined);
    assert.equal(data.furnished, true);
    assert.equal(data.source_type, 'Parceiro');
    assert.equal(data.partner_name, 'Corretor Parceiro');
    assert.equal(data.instagram_source_url, url);
    assert.deepEqual(data.building_features, ['Piscina', 'Academia', 'Brinquedoteca', 'Mini mercado']);
    assert.match(data.notes, /Apartamento à venda em Cabo Branco/);
    assert.doesNotMatch(data.notes, /Oportunidade!/);
    assert.deepEqual(data.missing_mandatory, []);
    const fallback = prepareInstagramProperty(post, await extractPropertyWithGemini(post.caption));
    assert.equal(fallback.neighborhood, 'Cabo Branco');
    assert.equal(fallback.area_m2, 47);
    assert.equal(fallback.bedrooms, 2);
    assert.equal(fallback.parking_spaces, 1);
    assert.equal(fallback.price, 750000);
    const examplePost = {
      ...post,
      caption: 'BEIRA-MAR EM CABO BRANCO. Apartamento para locação de curta temporada. 47 m², 2 quartos (1 wc reversível), varanda, 1 vaga de garagem privativa. Porteira fechada. Academia, cinema, mini mercado, brinquedoteca, lavanderia, piscina, rooftop, portaria 24 hrs. 💰750.000. Condomínio 650,00 + água e gás.',
    };
    const example = prepareInstagramProperty(examplePost, await extractPropertyWithGemini(examplePost.caption));
    assert.equal(example.purpose, 'Venda');
    assert.equal(example.price, 750000);
    assert.equal(example.condo_fee, 650);
    assert.equal(example.bathrooms, 1);
    assert.ok(example.building_features.includes('Portaria 24h'));
    assert.ok(example.apartment_features.includes('Varanda'));
    assert.ok(!example.apartment_features.includes('Varanda gourmet'));
  } finally {
    await server.close();
  }
});
