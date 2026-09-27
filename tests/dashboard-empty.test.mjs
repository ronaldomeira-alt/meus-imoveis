import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('dashboard shows actual inventory counts, including zero and more than four recent properties', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { calculateDashboardStats } = await server.ssrLoadModule('/src/lib/supabase.ts');
    const { SummaryCards } = await server.ssrLoadModule('/src/components/dashboard/SummaryCards.tsx');
    const { NeighborhoodsChart } = await server.ssrLoadModule('/src/components/dashboard/NeighborhoodsChart.tsx');
    const { PropertyTypesChart } = await server.ssrLoadModule('/src/components/dashboard/PropertyTypesChart.tsx');
    const { PriceRangeChart } = await server.ssrLoadModule('/src/components/dashboard/PriceRangeChart.tsx');
    const { RecentCarousel } = await server.ssrLoadModule('/src/components/dashboard/RecentCarousel.tsx');
    const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
    const noop = () => {};
    const empty = calculateDashboardStats([]);
    const summary = render(SummaryCards, { stats: empty, onSelectFilter: noop });
    assert.equal((summary.match(/>0<\/span>/g) || []).length, 4);
    assert.doesNotMatch(summary, /vs\. mês anterior|vs\. semana anterior/);
    const neighborhoods = render(NeighborhoodsChart, { data: empty.byNeighborhood, onSelectNeighborhood: noop });
    assert.match(neighborhoods, /Nenhum imóvel ativo/);
    assert.doesNotMatch(neighborhoods, /Bessa|Manaíra/);
    const types = render(PropertyTypesChart, { data: empty.byPropertyType, totalActive: 0, onSelectType: noop, onViewAll: noop });
    assert.match(types, /Nenhum tipo ativo/);
    const prices = render(PriceRangeChart, { data: empty.byPriceRange, totalActive: 0, onSelectRange: noop, onViewAll: noop });
    assert.match(prices, />0<\/span>/);
    assert.doesNotMatch(prices, /NaN|Infinity|stroke-dasharray/);
    assert.equal((prices.match(/<circle /g) || []).length, 1, 'Empty ring must not contain colored segments');
    assert.match(render(RecentCarousel, { properties: [], onSelectProperty: noop, onViewAll: noop }), /Nenhum imóvel ativo no estoque/);

    const properties = Array.from({ length: 7 }, (_, i) => ({
      id: String(i), status: 'Ativo', source_type: 'Próprio', created_at: new Date().toISOString(),
      neighborhood: 'Bessa', type: 'Apartamento', price: 350000,
    }));
    const stats = calculateDashboardStats(properties);
    assert.equal(stats.totalActive, 7);
    assert.equal(stats.addedThisWeekCount, 7);
    const populated = render(SummaryCards, { stats, onSelectFilter: noop });
    assert.equal((populated.match(/>7<\/span>/g) || []).length, 3);
    assert.equal((populated.match(/>0<\/span>/g) || []).length, 1);
    assert.equal(stats.byPriceRange.reduce((sum, range) => sum + range.count, 0), 7);
    const ring = render(PriceRangeChart, { data: stats.byPriceRange, totalActive: 7, onSelectRange: noop, onViewAll: noop });
    assert.equal((ring.match(/stroke-dasharray/g) || []).length, 1);
  } finally {
    await server.close();
  }
});
