import React, { useState } from 'react';
import {
  Save,
  Plus,
  Trash2,
  Edit2,
  AlertCircle,
  Check,
  Clock,
  Shield,
  Layers,
  Info,
  DollarSign,
  Building2,
  KeyRound,
  X,
  MessageSquare,
  Lock,
} from 'lucide-react';
import type {
  BotSettings,
  BotCampaign,
  BotMessageTemplate,
} from '../../types/bot-captador';

interface ConfiguracoesTabProps {
  settings: BotSettings | null;
  campaigns: BotCampaign[];
  templates: BotMessageTemplate[];
  onSaveCampaign: (campaign: BotCampaign) => Promise<void>;
  onSaveSettings: (settings: Partial<BotSettings>) => Promise<void>;
  onCreateTemplate: (title: string, content: string) => Promise<void>;
  onUpdateTemplate: (id: string, title: string, content: string) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

export const ConfiguracoesTab: React.FC<ConfiguracoesTabProps> = ({
  settings,
  campaigns,
  templates,
  onSaveCampaign,
  onSaveSettings,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'venda' | 'locacao' | 'mensagens' | 'horarios' | 'retencao'>('venda');

  // Estado local para campanhas
  const vendaCampaign = campaigns.find((c) => c.type === 'venda') || {
    id: '',
    account_id: '',
    type: 'venda',
    is_active: true,
    neighborhoods: ['Bessa', 'Manaíra', 'Tambaú', 'Cabo Branco', 'Altiplano'],
    min_price: 250000,
    max_price: 1500000,
    min_bedrooms: 2,
    max_bedrooms: 4,
    min_area: 50,
    max_area: 250,
    only_private: true,
    rounds_per_day: 2,
    schedule_times: ['09:00', '19:00'],
    max_contacts_per_round: 10,
    created_at: '',
    updated_at: '',
  };

  const locacaoCampaign = campaigns.find((c) => c.type === 'locacao') || {
    id: '',
    account_id: '',
    type: 'locacao',
    is_active: false,
    neighborhoods: ['Bessa', 'Manaíra', 'Tambaú', 'Cabo Branco', 'Intermares'],
    min_price: 1500,
    max_price: 6000,
    min_bedrooms: 1,
    max_bedrooms: 3,
    min_area: 30,
    max_area: 150,
    only_private: true,
    rounds_per_day: 2,
    schedule_times: ['09:00', '19:00'],
    max_contacts_per_round: 10,
    created_at: '',
    updated_at: '',
  };

  const [localVenda, setLocalVenda] = useState<BotCampaign>(vendaCampaign);
  const [localLocacao, setLocalLocacao] = useState<BotCampaign>(locacaoCampaign);
  const [newNeighborhoodInput, setNewNeighborhoodInput] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string | null>(null);

  // Estado local para CRUD de mensagens
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const handleSaveActiveCampaign = async (campaign: BotCampaign) => {
    setSavingCampaign(true);
    setSavedSuccessMessage(null);
    try {
      await onSaveCampaign(campaign);
      setSavedSuccessMessage(`Configurações de ${campaign.type === 'venda' ? 'Venda' : 'Locação'} salvas com sucesso!`);
      setTimeout(() => setSavedSuccessMessage(null), 3000);
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar campanha.');
    } finally {
      setSavingCampaign(false);
    }
  };

  const addNeighborhood = (type: 'venda' | 'locacao') => {
    const val = newNeighborhoodInput.trim();
    if (!val) return;
    if (type === 'venda') {
      if (!localVenda.neighborhoods.includes(val)) {
        setLocalVenda({ ...localVenda, neighborhoods: [...localVenda.neighborhoods, val] });
      }
    } else {
      if (!localLocacao.neighborhoods.includes(val)) {
        setLocalLocacao({ ...localLocacao, neighborhoods: [...localLocacao.neighborhoods, val] });
      }
    }
    setNewNeighborhoodInput('');
  };

  const removeNeighborhood = (type: 'venda' | 'locacao', name: string) => {
    if (type === 'venda') {
      setLocalVenda({ ...localVenda, neighborhoods: localVenda.neighborhoods.filter((n) => n !== name) });
    } else {
      setLocalLocacao({ ...localLocacao, neighborhoods: localLocacao.neighborhoods.filter((n) => n !== name) });
    }
  };

  const openNewTemplateModal = () => {
    setEditingTemplateId(null);
    setTemplateTitle('');
    setTemplateContent('');
    setTemplateError(null);
    setIsTemplateModalOpen(true);
  };

  const openEditTemplateModal = (t: BotMessageTemplate) => {
    setEditingTemplateId(t.id);
    setTemplateTitle(t.title);
    setTemplateContent(t.content);
    setTemplateError(null);
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateTitle.trim() || !templateContent.trim()) {
      setTemplateError('Preencha o título e o texto da mensagem.');
      return;
    }
    try {
      if (editingTemplateId) {
        await onUpdateTemplate(editingTemplateId, templateTitle, templateContent);
      } else {
        await onCreateTemplate(templateTitle, templateContent);
      }
      setIsTemplateModalOpen(false);
    } catch (err: any) {
      setTemplateError(err?.message || 'Erro ao salvar mensagem.');
    }
  };

  const handleDeleteTemplateClick = async (id: string) => {
    if (templates.length <= 1) {
      alert('O Bot Captador precisa ter pelo menos uma mensagem de abordagem cadastrada.');
      return;
    }
    if (confirm('Tem certeza que deseja excluir esta mensagem de abordagem?')) {
      await onDeleteTemplate(id);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-16">
      {/* ── Submenu de Configurações ── */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-surface-1 border border-line-subtle overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('venda')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'venda'
              ? 'bg-accent text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Campanha Venda
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('locacao')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'locacao'
              ? 'bg-accent text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          Campanha Locação
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('mensagens')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'mensagens'
              ? 'bg-accent text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Mensagens de Abordagem
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('horarios')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'horarios'
              ? 'bg-accent text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Horários e Frequência
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('retencao')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
            activeSubTab === 'retencao'
              ? 'bg-accent text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Retenção & Segurança
        </button>
      </div>

      {savedSuccessMessage && (
        <div className="p-3 rounded-xl bg-status-success/10 border border-status-success/25 text-status-success text-xs flex items-center gap-2">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{savedSuccessMessage}</span>
        </div>
      )}

      {/* ── ABA 1: CONFIGURAÇÃO DE VENDA ── */}
      {activeSubTab === 'venda' && (
        <div className="panel-surface rounded-2xl p-5 border border-line-subtle space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink-primary">Campanha de Venda</h3>
              <p className="text-xs text-ink-secondary">
                Filtros e limites exclusivos para prospecção de imóveis à venda
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-semibold text-ink-secondary">
                {localVenda.is_active ? 'Campanha Ativa' : 'Campanha Pausada'}
              </span>
              <input
                type="checkbox"
                checked={localVenda.is_active}
                onChange={(e) => setLocalVenda({ ...localVenda, is_active: e.target.checked })}
                className="w-4 h-4 rounded text-accent bg-surface-1 border-line-subtle"
              />
            </label>
          </div>

          {/* Faixa de Preço */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-line-subtle">
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Preço Mínimo (R$)
              </label>
              <input
                type="number"
                value={localVenda.min_price || ''}
                onChange={(e) => setLocalVenda({ ...localVenda, min_price: Number(e.target.value) || null })}
                placeholder="Ex: 250000"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Preço Máximo (R$)
              </label>
              <input
                type="number"
                value={localVenda.max_price || ''}
                onChange={(e) => setLocalVenda({ ...localVenda, max_price: Number(e.target.value) || null })}
                placeholder="Ex: 1500000"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>

          {/* Quartos e Área */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">Quartos Mín.</label>
              <input
                type="number"
                value={localVenda.min_bedrooms || ''}
                onChange={(e) => setLocalVenda({ ...localVenda, min_bedrooms: Number(e.target.value) || null })}
                placeholder="Ex: 2"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">Quartos Máx.</label>
              <input
                type="number"
                value={localVenda.max_bedrooms || ''}
                onChange={(e) => setLocalVenda({ ...localVenda, max_bedrooms: Number(e.target.value) || null })}
                placeholder="Ex: 4"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">Área Mín. (m²)</label>
              <input
                type="number"
                value={localVenda.min_area || ''}
                onChange={(e) => setLocalVenda({ ...localVenda, min_area: Number(e.target.value) || null })}
                placeholder="Ex: 50"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">Área Máx. (m²)</label>
              <input
                type="number"
                value={localVenda.max_area || ''}
                onChange={(e) => setLocalVenda({ ...localVenda, max_area: Number(e.target.value) || null })}
                placeholder="Ex: 250"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>

          {/* Bairros */}
          <div className="pt-2 border-t border-line-subtle">
            <label className="block text-xs font-semibold text-ink-primary mb-2">
              Bairros Configurados
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {localVenda.neighborhoods.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface-1 text-ink-primary border border-line-subtle text-xs"
                >
                  {n}
                  <button
                    type="button"
                    onClick={() => removeNeighborhood('venda', n)}
                    className="text-ink-secondary hover:text-status-danger"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 max-w-sm">
              <input
                type="text"
                placeholder="Adicionar bairro..."
                value={newNeighborhoodInput}
                onChange={(e) => setNewNeighborhoodInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNeighborhood('venda'); } }}
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
              <button
                type="button"
                onClick={() => addNeighborhood('venda')}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-ink-primary border border-line-subtle flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          </div>

          {/* Filtro Particular e Limite */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-line-subtle">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-1 border border-line-subtle">
              <input
                type="checkbox"
                id="only_private_venda"
                checked={localVenda.only_private}
                onChange={(e) => setLocalVenda({ ...localVenda, only_private: e.target.checked })}
                className="w-4 h-4 rounded text-accent bg-surface-2 border-line-subtle"
              />
              <label htmlFor="only_private_venda" className="text-xs text-ink-primary font-semibold cursor-pointer">
                Somente proprietários particulares
                <span className="block text-[11px] font-normal text-ink-secondary mt-0.5">
                  Ignora automaticamente anúncios identificados como imobiliárias ou corretores
                </span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Limite por Rodada (Padrão: 10)
              </label>
              <input
                type="number"
                value={localVenda.max_contacts_per_round || 10}
                onChange={(e) => setLocalVenda({ ...localVenda, max_contacts_per_round: Number(e.target.value) || 10 })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
              <span className="text-[10px] text-ink-secondary mt-1 block">
                Itens além do limite permanecem na fila para a próxima rodada (FIFO).
              </span>
            </div>
          </div>

          {/* Botão Salvar Venda */}
          <div className="pt-3 border-t border-line-subtle flex justify-end">
            <button
              type="button"
              disabled={savingCampaign}
              onClick={() => handleSaveActiveCampaign(localVenda)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover text-white flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Configurações de Venda
            </button>
          </div>
        </div>
      )}

      {/* ── ABA 2: CONFIGURAÇÃO DE LOCAÇÃO ── */}
      {activeSubTab === 'locacao' && (
        <div className="panel-surface rounded-2xl p-5 border border-line-subtle space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink-primary">Campanha de Locação</h3>
              <p className="text-xs text-ink-secondary">
                Configurações financeiras e filtros 100% independentes de Venda
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-semibold text-ink-secondary">
                {localLocacao.is_active ? 'Campanha Ativa' : 'Campanha Pausada'}
              </span>
              <input
                type="checkbox"
                checked={localLocacao.is_active}
                onChange={(e) => setLocalLocacao({ ...localLocacao, is_active: e.target.checked })}
                className="w-4 h-4 rounded text-accent bg-surface-1 border-line-subtle"
              />
            </label>
          </div>

          {/* Faixa Financeira de Locação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-line-subtle">
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Aluguel Mínimo (R$/mês)
              </label>
              <input
                type="number"
                value={localLocacao.min_price || ''}
                onChange={(e) => setLocalLocacao({ ...localLocacao, min_price: Number(e.target.value) || null })}
                placeholder="Ex: 1200"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Aluguel Máximo (R$/mês)
              </label>
              <input
                type="number"
                value={localLocacao.max_price || ''}
                onChange={(e) => setLocalLocacao({ ...localLocacao, max_price: Number(e.target.value) || null })}
                placeholder="Ex: 5000"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>

          {/* Quartos e Área */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">Quartos Mín.</label>
              <input
                type="number"
                value={localLocacao.min_bedrooms || ''}
                onChange={(e) => setLocalLocacao({ ...localLocacao, min_bedrooms: Number(e.target.value) || null })}
                placeholder="Ex: 1"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">Quartos Máx.</label>
              <input
                type="number"
                value={localLocacao.max_bedrooms || ''}
                onChange={(e) => setLocalLocacao({ ...localLocacao, max_bedrooms: Number(e.target.value) || null })}
                placeholder="Ex: 3"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">Área Mín. (m²)</label>
              <input
                type="number"
                value={localLocacao.min_area || ''}
                onChange={(e) => setLocalLocacao({ ...localLocacao, min_area: Number(e.target.value) || null })}
                placeholder="Ex: 30"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">Área Máx. (m²)</label>
              <input
                type="number"
                value={localLocacao.max_area || ''}
                onChange={(e) => setLocalLocacao({ ...localLocacao, max_area: Number(e.target.value) || null })}
                placeholder="Ex: 150"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>

          {/* Bairros de Locação */}
          <div className="pt-2 border-t border-line-subtle">
            <label className="block text-xs font-semibold text-ink-primary mb-2">
              Bairros de Locação
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {localLocacao.neighborhoods.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface-1 text-ink-primary border border-line-subtle text-xs"
                >
                  {n}
                  <button
                    type="button"
                    onClick={() => removeNeighborhood('locacao', n)}
                    className="text-ink-secondary hover:text-status-danger"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 max-w-sm">
              <input
                type="text"
                placeholder="Adicionar bairro..."
                value={newNeighborhoodInput}
                onChange={(e) => setNewNeighborhoodInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNeighborhood('locacao'); } }}
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
              <button
                type="button"
                onClick={() => addNeighborhood('locacao')}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-ink-primary border border-line-subtle flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          </div>

          {/* Botão Salvar Locação */}
          <div className="pt-3 border-t border-line-subtle flex justify-end">
            <button
              type="button"
              disabled={savingCampaign}
              onClick={() => handleSaveActiveCampaign(localLocacao)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover text-white flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Configurações de Locação
            </button>
          </div>
        </div>
      )}

      {/* ── ABA 3: MENSAGENS DE ABORDAGEM ── */}
      {activeSubTab === 'mensagens' && (
        <div className="panel-surface rounded-2xl p-5 border border-line-subtle space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-ink-primary">Mensagens de Abordagem</h3>
              <p className="text-xs text-ink-secondary">
                O bot seleciona uma das mensagens cadastradas para a abordagem inicial única
              </p>
            </div>
            <button
              type="button"
              onClick={openNewTemplateModal}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover text-white flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Mensagem
            </button>
          </div>

          <div className="space-y-3 pt-2 border-t border-line-subtle">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-4 rounded-xl bg-surface-1 border border-line-subtle flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h4 className="text-xs font-bold text-ink-primary">{tpl.title}</h4>
                  <p className="text-xs text-ink-secondary leading-relaxed bg-black/20 p-2.5 rounded-lg border border-line-subtle/40 italic">
                    "{tpl.content}"
                  </p>
                  {/* Métricas por Mensagem */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-secondary pt-1">
                    <span>
                      Abordagens: <strong className="text-ink-primary">{tpl.sent_count ?? 0}</strong>
                    </span>
                    <span>
                      Respostas: <strong className="text-emerald-400">{tpl.responses_count ?? 0} ({tpl.response_rate?.toFixed(1) ?? '0.0'}%)</strong>
                    </span>
                    <span>
                      Conversões: <strong className="text-accent">{tpl.imported_count ?? 0} ({tpl.conversion_rate?.toFixed(1) ?? '0.0'}%)</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => openEditTemplateModal(tpl)}
                    className="p-2 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]"
                    title="Editar mensagem"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplateClick(tpl.id)}
                    className="p-2 rounded-lg text-ink-secondary hover:text-status-danger hover:bg-rose-500/10"
                    title="Excluir mensagem"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ABA 4: HORÁRIOS E FREQUÊNCIA ── */}
      {activeSubTab === 'horarios' && (
        <div className="panel-surface rounded-2xl p-5 border border-line-subtle space-y-5">
          <div>
            <h3 className="text-sm font-bold text-ink-primary">Horários das Rodadas</h3>
            <p className="text-xs text-ink-secondary">
              Configure 1 ou 2 rodadas diárias de busca. Frequência não significa mensagens repetidas ao mesmo anúncio.
            </p>
          </div>

          <div className="space-y-4 pt-2 border-t border-line-subtle max-w-md">
            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-2">
                Frequência de Rodadas
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setLocalVenda({ ...localVenda, rounds_per_day: 1 })}
                  className={`p-3 rounded-xl border text-left font-semibold transition-all ${
                    localVenda.rounds_per_day === 1
                      ? 'bg-accent/15 border-accent text-accent'
                      : 'bg-surface-1 border-line-subtle text-ink-secondary'
                  }`}
                >
                  1 Rodada por dia
                </button>
                <button
                  type="button"
                  onClick={() => setLocalVenda({ ...localVenda, rounds_per_day: 2 })}
                  className={`p-3 rounded-xl border text-left font-semibold transition-all ${
                    localVenda.rounds_per_day === 2
                      ? 'bg-accent/15 border-accent text-accent'
                      : 'bg-surface-1 border-line-subtle text-ink-secondary'
                  }`}
                >
                  2 Rodadas por dia
                </button>
              </div>
            </div>

            {/* Seleção de Horários */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-primary mb-1">
                  1º Horário da Rodada
                </label>
                <input
                  type="time"
                  value={localVenda.schedule_times[0] || '09:00'}
                  onChange={(e) => {
                    const times = [...localVenda.schedule_times];
                    times[0] = e.target.value;
                    setLocalVenda({ ...localVenda, schedule_times: times });
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary"
                />
              </div>

              {localVenda.rounds_per_day === 2 && (
                <div>
                  <label className="block text-xs font-semibold text-ink-primary mb-1">
                    2º Horário da Rodada
                  </label>
                  <input
                    type="time"
                    value={localVenda.schedule_times[1] || '19:00'}
                    onChange={(e) => {
                      const times = [...localVenda.schedule_times];
                      times[1] = e.target.value;
                      setLocalVenda({ ...localVenda, schedule_times: times });
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary"
                  />
                </div>
              )}
            </div>

            <p className="text-[11px] text-ink-secondary flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              Timezone ativo: Horário Oficial de Brasília (GMT-3)
            </p>

            <button
              type="button"
              disabled={savingCampaign}
              onClick={() => handleSaveActiveCampaign(localVenda)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover text-white flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Horários
            </button>
          </div>
        </div>
      )}

      {/* ── ABA 5: RETENÇÃO E SEGURANÇA (INFORMATIVA) ── */}
      {activeSubTab === 'retencao' && (
        <div className="panel-surface rounded-2xl p-5 border border-line-subtle space-y-4">
          <div className="flex items-center gap-2.5 text-accent">
            <Shield className="w-5 h-5" />
            <h3 className="text-sm font-bold text-ink-primary">Política de Retenção & Deduplicação</h3>
          </div>

          <div className="space-y-3 text-xs text-ink-secondary leading-relaxed pt-2 border-t border-line-subtle">
            <div className="p-3.5 rounded-xl bg-surface-1 border border-line-subtle space-y-1">
              <h4 className="font-bold text-ink-primary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Histórico Operacional Completo: 40 dias
              </h4>
              <p>
                Os detalhes operacionais da fila e logs de rodadas são mantidos por 40 dias. Registros concluídos ou expirados mais antigos são limpos automaticamente pelo banco.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-1 border border-line-subtle space-y-1">
              <h4 className="font-bold text-ink-primary flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-accent" />
                Tombstone Perpétuo de Deduplicação
              </h4>
              <p>
                A assinatura mínima (fingerprint e URL) de qualquer imóvel que já recebeu abordagem é guardada permanentemente em <code>bot_capture_tombstones</code>. Mesmo que a captação seja arquivada ou o histórico antigo seja purgado, o Bot Captador NUNCA abordará o mesmo anúncio uma segunda vez.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-1 border border-line-subtle space-y-1">
              <h4 className="font-bold text-ink-primary flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-emerald-400" />
                Validade da Fila: 7 dias
              </h4>
              <p>
                Itens na fila não abordados em até 7 dias são expirados automaticamente para evitar que oportunidades antigas sejam contatadas caso o sistema fique pausado.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição de Mensagem */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in">
          <form
            onSubmit={handleSaveTemplateSubmit}
            className="modal-surface rounded-2xl max-w-lg w-full p-5 border border-line-strong shadow-modal animate-scale-in space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-primary">
                {editingTemplateId ? 'Editar Mensagem' : 'Nova Mensagem de Abordagem'}
              </h3>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {templateError && (
              <div className="p-2.5 rounded-xl bg-status-danger/10 text-status-danger text-xs">
                {templateError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Identificação Interna da Mensagem
              </label>
              <input
                type="text"
                placeholder="Ex: Abordagem Consultiva - Bairros Nobres"
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-primary mb-1">
                Texto da Mensagem (Abordagem Única)
              </label>
              <textarea
                rows={4}
                placeholder="Digite a mensagem pré-aprovada que será enviada ao proprietário..."
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary focus:outline-none focus:border-accent/50 resize-none"
              />
              <span className="text-[10px] text-ink-secondary mt-1 block">
                O bot nunca inventa texto dinâmico via IA. Ele enviará estritamente esta mensagem cadastrada.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-ink-secondary hover:text-ink-primary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover text-white shadow-sm"
              >
                Salvar Mensagem
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
