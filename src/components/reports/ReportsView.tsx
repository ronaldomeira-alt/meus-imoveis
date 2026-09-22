import React from 'react';
import { BarChart3, TrendingUp, DollarSign, Building2, PieChart, ShieldCheck } from 'lucide-react';
import type { Property, DashboardStats } from '../../types/property';

interface ReportsViewProps {
  properties: Property[];
  stats: DashboardStats;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ properties, stats }) => {
  const activeProperties = properties.filter((p) => p.status === 'Ativo');

  const totalValue = activeProperties.reduce((acc, p) => acc + p.price, 0);
  const avgTicket = activeProperties.length > 0 ? totalValue / activeProperties.length : 0;
  const totalArea = activeProperties.reduce((acc, p) => acc + p.area_m2, 0);
  const avgM2Price = totalArea > 0 ? totalValue / totalArea : 0;

  const typesMap: Record<string, number> = {};
  activeProperties.forEach((p) => {
    typesMap[p.type] = (typesMap[p.type] || 0) + 1;
  });

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in overflow-y-auto pr-1">
      {/* Topo: Título */}
      <div>
        <h2 className="text-xl font-extrabold text-ink-primary flex items-center gap-2.5">
          <BarChart3 className="w-5 h-5 text-accent" />
          Composição Patrimonial & Relatórios
        </h2>
        <p className="text-xs text-ink-secondary">
          Visão consolidada de valor de mercado, valor médio por m² e distribuição do estoque
        </p>
      </div>

      {/* Grid de 4 Grandes Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="card-surface p-4">
          <div className="flex items-center justify-between text-xs text-ink-secondary font-semibold mb-2">
            <span>Valor Total da Carteira</span>
            <DollarSign className="w-4 h-4 text-status-success" />
          </div>
          <p className="text-xl font-extrabold text-ink-primary">
            {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-status-success mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Estoque ativo consolidado
          </p>
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center justify-between text-xs text-ink-secondary font-semibold mb-2">
            <span>Ticket Médio por Unidade</span>
            <Building2 className="w-4 h-4 text-accent" />
          </div>
          <p className="text-xl font-extrabold text-ink-primary">
            {avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-accent mt-1">Média dos imóveis em catálogo</p>
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center justify-between text-xs text-ink-secondary font-semibold mb-2">
            <span>Preço Médio do m²</span>
            <TrendingUp className="w-4 h-4 text-status-warning" />
          </div>
          <p className="text-xl font-extrabold text-ink-primary">
            {avgM2Price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            <span className="text-xs text-ink-secondary font-normal"> /m²</span>
          </p>
          <p className="text-[10px] text-status-warning mt-1">Média ponderada da orla</p>
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center justify-between text-xs text-ink-secondary font-semibold mb-2">
            <span>Área Total em Carteira</span>
            <PieChart className="w-4 h-4 text-status-partner" />
          </div>
          <p className="text-xl font-extrabold text-ink-primary">
            {totalArea.toLocaleString('pt-BR')} <span className="text-xs text-ink-secondary font-normal">m²</span>
          </p>
          <p className="text-[10px] text-status-partner mt-1">{activeProperties.length} unidades cadastradas</p>
        </div>
      </div>

      {/* Grid de 2 Colunas: Distribuição por Tipo e Composição da Origem */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tipologias */}
        <div className="panel-surface p-5 space-y-3">
          <h3 className="text-sm font-bold text-ink-primary flex items-center gap-2">
            <Building2 className="w-4 h-4 text-accent" />
            Distribuição por Tipologia
          </h3>
          <div className="space-y-2.5 pt-1">
            {Object.entries(typesMap).map(([type, count]) => {
              const pct = Math.round((count / activeProperties.length) * 100);
              return (
                <div key={type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-secondary font-medium">{type}</span>
                    <span className="text-accent font-bold">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Origem: Próprio vs Parceiro */}
        <div className="panel-surface p-5 space-y-4">
          <h3 className="text-sm font-bold text-ink-primary flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
            Composição da Carteira (Próprio vs. Parceria)
          </h3>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-xl bg-accent-soft border border-accent/30">
              <span className="text-[10px] font-bold text-accent uppercase tracking-wider block">
                Captações Próprias
              </span>
              <p className="text-2xl font-black text-ink-primary mt-1">{stats.ownCount}</p>
              <p className="text-[10px] text-ink-secondary mt-1">
                {Math.round((stats.ownCount / (stats.totalActive || 1)) * 100)}% da carteira total
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-status-partner/10 border border-status-partner/30">
              <span className="text-[10px] font-bold text-status-partner uppercase tracking-wider block">
                Parcerias com Corretores
              </span>
              <p className="text-2xl font-black text-ink-primary mt-1">{stats.partnerCount}</p>
              <p className="text-[10px] text-ink-secondary mt-1">
                {Math.round((stats.partnerCount / (stats.totalActive || 1)) * 100)}% da carteira total
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
