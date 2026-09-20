import React from 'react';
import { BarChart3, TrendingUp, DollarSign, Building2, MapPin, PieChart, ShieldCheck } from 'lucide-react';
import type { Property, DashboardStats } from '../../types/property';

interface ReportsViewProps {
  properties: Property[];
  stats: DashboardStats;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ properties, stats }) => {
  const activeProperties = properties.filter((p) => p.status === 'Ativo');

  // Cálculos de métricas
  const totalValue = activeProperties.reduce((acc, p) => acc + p.price, 0);
  const avgTicket = activeProperties.length > 0 ? totalValue / activeProperties.length : 0;
  const totalArea = activeProperties.reduce((acc, p) => acc + p.area_m2, 0);
  const avgM2Price = totalArea > 0 ? totalValue / totalArea : 0;

  // Por tipologia
  const typesMap: Record<string, number> = {};
  activeProperties.forEach((p) => {
    typesMap[p.type] = (typesMap[p.type] || 0) + 1;
  });

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in overflow-y-auto pr-1">
      {/* Topo: Título */}
      <div>
        <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          Composição Patrimonial & Relatórios
        </h2>
        <p className="text-xs text-slate-400">
          Visão consolidada de valor de mercado, valor médio por m² e distribuição do estoque
        </p>
      </div>

      {/* Grid de 4 Grandes Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="glass-kpi p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
            <span>Valor Total da Carteira</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-extrabold text-white">
            {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Estoque ativo consolidado
          </p>
        </div>

        <div className="glass-kpi p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
            <span>Ticket Médio por Unidade</span>
            <Building2 className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-xl font-extrabold text-white">
            {avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-cyan-400 mt-1">Média dos imóveis em catálogo</p>
        </div>

        <div className="glass-kpi p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
            <span>Preço Médio do m²</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-extrabold text-white">
            {avgM2Price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            <span className="text-xs text-slate-400 font-normal"> /m²</span>
          </p>
          <p className="text-[10px] text-amber-400 mt-1">Média ponderada da orla</p>
        </div>

        <div className="glass-kpi p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
            <span>Área Total em Carteira</span>
            <PieChart className="w-4 h-4 text-violet-400" />
          </div>
          <p className="text-xl font-extrabold text-white">
            {totalArea.toLocaleString('pt-BR')} <span className="text-xs text-slate-400 font-normal">m²</span>
          </p>
          <p className="text-[10px] text-violet-400 mt-1">{activeProperties.length} unidades cadastradas</p>
        </div>
      </div>

      {/* Grid de 2 Colunas: Distribuição por Tipo e Composição da Origem */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tipologias */}
        <div className="glass-panel p-5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Distribuição por Tipologia
          </h3>
          <div className="space-y-2.5 pt-1">
            {Object.entries(typesMap).map(([type, count]) => {
              const pct = Math.round((count / activeProperties.length) * 100);
              return (
                <div key={type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">{type}</span>
                    <span className="text-cyan-400 font-bold">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Origem: Próprio vs Parceiro */}
        <div className="glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            Composição da Carteira (Próprio vs. Parceria)
          </h3>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-400/30">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                Captações Próprias
              </span>
              <p className="text-2xl font-black text-white mt-1">{stats.ownCount}</p>
              <p className="text-[10px] text-slate-400 mt-1">
                {Math.round((stats.ownCount / (stats.totalActive || 1)) * 100)}% da carteira total
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-violet-500/10 border border-violet-400/30">
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider block">
                Parcerias com Corretores
              </span>
              <p className="text-2xl font-black text-white mt-1">{stats.partnerCount}</p>
              <p className="text-[10px] text-slate-400 mt-1">
                {Math.round((stats.partnerCount / (stats.totalActive || 1)) * 100)}% da carteira total
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
