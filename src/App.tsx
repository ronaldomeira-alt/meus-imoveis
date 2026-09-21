import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar, NavSection } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { SummaryCards } from './components/dashboard/SummaryCards';
import { NeighborhoodsChart } from './components/dashboard/NeighborhoodsChart';
import { PropertyTypesChart } from './components/dashboard/PropertyTypesChart';
import { PriceRangeChart } from './components/dashboard/PriceRangeChart';
import { RecentCarousel } from './components/dashboard/RecentCarousel';
import { PropertyCard } from './components/properties/PropertyCard';
import { PropertyFilters, FilterState } from './components/properties/PropertyFilters';
import { PropertySummaryModal } from './components/properties/PropertySummaryModal';
import { PropertyDetailPage } from './components/properties/PropertyDetailPage';
import { PropertyEditModal } from './components/properties/PropertyEditModal';
import { CaptureModal } from './components/capture/CaptureModal';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { SettingsView } from './components/settings/SettingsView';
import { ReportsView } from './components/reports/ReportsView';
import { initialProperties } from './data/initialProperties';
import { calculateDashboardStats } from './lib/supabase';
import type { Property, AppearanceSettings, NotificationItem } from './types/property';
import type { SummaryFilterType } from './components/dashboard/SummaryCards';
import type { PreferredAIProvider } from './lib/ai-provider';
import { PlusCircle, Building2, Users, Archive } from 'lucide-react';

const DEFAULT_APPEARANCE: AppearanceSettings = {
  bgImage: null,
  bgBlur: 16,
  bgOpacity: 1.0,
  bgDarkness: 0.25,
  bgBrightness: 1.0,
  bgSaturation: 1.1,
  cardOpacity: 0.18,
  glassIntensity: 1.0,
};

const DEFAULT_FILTERS: FilterState = {
  neighborhood: '',
  type: '',
  bedrooms: '',
  minPrice: '',
  maxPrice: '',
  sourceType: '',
  status: 'Ativo',
  sortBy: 'recent',
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Novo Imóvel no Bessa',
    body: 'Apartamento de 64m² com varanda gourmet cadastrado no catálogo.',
    property_id: 'prop-1',
    read: false,
    created_at: 'Há 15 min',
  },
  {
    id: 'n2',
    title: 'Captação Parceria Recebida',
    body: 'Studio em Tambaú adicionado através de corretor parceiro.',
    property_id: 'prop-7',
    read: false,
    created_at: 'Há 2 horas',
  },
  {
    id: 'n3',
    title: 'Preço Atualizado',
    body: 'Cobertura Duplex no Altiplano ajustada para R$ 1.650.000.',
    property_id: 'prop-4',
    read: true,
    created_at: 'Ontem',
  },
];

export const App: React.FC = () => {
  // ── Navegação Ativa ──
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');

  // ── Dados do Catálogo de Imóveis ──
  const [properties, setProperties] = useState<Property[]>(() => {
    const saved = localStorage.getItem('meus_imoveis_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao ler dados salvos:', e);
      }
    }
    return initialProperties;
  });

  // Salva no localStorage quando alterado
  useEffect(() => {
    localStorage.setItem('meus_imoveis_data', JSON.stringify(properties));
  }, [properties]);

  // ── Configurações de Aparência (Background & Luzes) ──
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
    const saved = localStorage.getItem('meus_imoveis_appearance');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_APPEARANCE,
          ...parsed,
          bgDarkness: parsed.bgDarkness ?? DEFAULT_APPEARANCE.bgDarkness,
          bgBrightness: parsed.bgBrightness ?? DEFAULT_APPEARANCE.bgBrightness,
          cardOpacity: parsed.cardOpacity ?? DEFAULT_APPEARANCE.cardOpacity,
          glassIntensity: parsed.glassIntensity ?? DEFAULT_APPEARANCE.glassIntensity,
        };
      } catch (e) {
        console.error('Erro ao ler aparência:', e);
      }
    }
    return DEFAULT_APPEARANCE;
  });

  useEffect(() => {
    localStorage.setItem('meus_imoveis_appearance', JSON.stringify(appearance));

    // Atualiza as variáveis CSS globais no :root para preview imediato em tempo real
    const root = document.documentElement;
    const cardOpacity = appearance.cardOpacity ?? 0.18;
    const glassIntensity = appearance.glassIntensity ?? 1.0;

    root.style.setProperty('--card-opacity', `${cardOpacity}`);
    root.style.setProperty('--glass-intensity', `${glassIntensity}`);
    root.style.setProperty('--glass-panel', `rgba(8, 14, 28, ${cardOpacity})`);
    root.style.setProperty('--glass-kpi', `rgba(8, 14, 28, ${cardOpacity})`);
    root.style.setProperty('--glass-card', `rgba(8, 14, 28, ${Math.min(0.95, cardOpacity * 1.25)})`);
    root.style.setProperty('--glass-sidebar', `rgba(6, 11, 22, ${Math.min(0.95, cardOpacity * 1.5 + 0.12)})`);
    root.style.setProperty('--border-glass', `rgba(255, 255, 255, ${0.10 * glassIntensity})`);
    root.style.setProperty('--border-glass-top', `rgba(255, 255, 255, ${0.24 * glassIntensity})`);
    root.style.setProperty('--border-glass-left', `rgba(255, 255, 255, ${0.15 * glassIntensity})`);
    root.style.setProperty('--glass-specular-opacity', `${0.20 * glassIntensity}`);
    root.style.setProperty('--glass-blur', `${20 * glassIntensity}px`);
    root.style.setProperty('--bg-blur', `${appearance.bgBlur}px`);
    root.style.setProperty('--bg-opacity', `${appearance.bgOpacity}`);
    root.style.setProperty('--bg-darkness', `${appearance.bgDarkness}`);
    root.style.setProperty('--bg-brightness', `${appearance.bgBrightness ?? 1.0}`);
    root.style.setProperty('--bg-saturation', `${appearance.bgSaturation}`);
  }, [appearance]);

  // ── Configurações de IA (Groq & Gemini) ──
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('meus_imoveis_gemini_key') || (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
  });

  const [groqApiKey, setGroqApiKey] = useState<string>(() => {
    return localStorage.getItem('meus_imoveis_groq_key') || (import.meta.env.VITE_GROQ_API_KEY as string) || '';
  });

  const [preferredAIProvider, setPreferredAIProvider] = useState<PreferredAIProvider>(() => {
    return (localStorage.getItem('meus_imoveis_ai_provider') as PreferredAIProvider) || 'auto';
  });

  const handleUpdateGeminiKey = (key: string) => {
    setGeminiApiKey(key);
    localStorage.setItem('meus_imoveis_gemini_key', key);
  };

  const handleUpdateGroqKey = (key: string) => {
    setGroqApiKey(key);
    localStorage.setItem('meus_imoveis_groq_key', key);
  };

  const handleUpdateAIProvider = (provider: PreferredAIProvider) => {
    setPreferredAIProvider(provider);
    localStorage.setItem('meus_imoveis_ai_provider', provider);
  };

  // ── Notificações ──
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);

  // ── Modais e Visualização em Dois Níveis (Modal Resumo → Página Completa) ──
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [summaryProperty, setSummaryProperty] = useState<Property | null>(null);
  const [viewingPropertyId, setViewingPropertyId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/imoveis\/([^/]+)$/);
      return match ? match[1] : null;
    }
    return null;
  });
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  const viewingProperty = useMemo(() => {
    if (!viewingPropertyId) return null;
    return properties.find((p) => p.id === viewingPropertyId) || null;
  }, [properties, viewingPropertyId]);

  // ── Sincronização de Rota SPA (/imoveis/:id) e Histórico do Navegador ──
  useEffect(() => {
    const parseUrl = () => {
      const match = window.location.pathname.match(/^\/imoveis\/([^/]+)$/);
      if (match && match[1]) {
        setViewingPropertyId(match[1]);
      } else {
        setViewingPropertyId(null);
      }
    };

    parseUrl();

    window.addEventListener('popstate', parseUrl);
    return () => window.removeEventListener('popstate', parseUrl);
  }, []);

  const handleOpenSummary = (property: Property) => {
    setSummaryProperty(property);
  };

  const handleOpenDetail = (property: Property) => {
    setSummaryProperty(null);
    setViewingPropertyId(property.id);
    window.history.pushState({ propertyId: property.id }, '', `/imoveis/${property.id}`);
  };

  const handleBackToInventory = () => {
    setViewingPropertyId(null);
    if (window.location.pathname.startsWith('/imoveis/')) {
      window.history.pushState(null, '', '/');
    }
  };

  const handleUpdateProperty = (updatedProperty: Property) => {
    setProperties((prev) =>
      prev.map((p) => (p.id === updatedProperty.id ? updatedProperty : p))
    );
  };

  // ── Filtros e Busca Global ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // ── Atalho Global ⌘K para Busca ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Buscar"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Estatísticas do Dashboard ──
  const stats = useMemo(() => {
    return calculateDashboardStats(properties);
  }, [properties]);

  // ── Lista de Bairros Únicos Disponíveis ──
  const availableNeighborhoods = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((p) => {
      if (p.neighborhood) set.add(p.neighborhood);
    });
    return Array.from(set).sort();
  }, [properties]);

  // ── Filtragem de Imóveis para a View de Estoque / Catálogo ──
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      // Se estiver na seção "parceiros", filtra automaticamente apenas parceiros
      if (activeSection === 'parceiros' && p.source_type !== 'Parceiro') return false;

      // Se estiver na seção "arquivados", filtra arquivados e vendidos
      if (activeSection === 'arquivados' && p.status === 'Ativo') return false;

      // Se estiver no estoque normal, filtra status do filtro (default 'Ativo')
      if (activeSection === 'estoque' && filters.status && p.status !== filters.status) {
        return false;
      }

      // Busca textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (p.type + ' ' + p.neighborhood).toLowerCase().includes(q);
        const matchCondo = (p.condominium_name || '').toLowerCase().includes(q);
        const matchAddress = (p.address || '').toLowerCase().includes(q);
        const matchNotes = (p.notes || '').toLowerCase().includes(q);
        if (!matchTitle && !matchCondo && !matchAddress && !matchNotes) {
          return false;
        }
      }

      // Filtro de Bairro
      if (filters.neighborhood && p.neighborhood !== filters.neighborhood) {
        return false;
      }

      // Filtro de Tipologia
      if (filters.type && p.type !== filters.type) {
        return false;
      }

      // Filtro de Quartos
      if (filters.bedrooms) {
        const minBeds = parseInt(filters.bedrooms, 10);
        if (p.bedrooms < minBeds) return false;
      }

      // Filtro de Preço Mínimo
      if (filters.minPrice) {
        const minP = parseFloat(filters.minPrice);
        if (p.price < minP) return false;
      }

      // Filtro de Preço Máximo
      if (filters.maxPrice) {
        const maxP = parseFloat(filters.maxPrice);
        if (p.price > maxP) return false;
      }

      // Filtro de Origem
      if (filters.sourceType && p.source_type !== filters.sourceType) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (filters.sortBy === 'price_asc') return a.price - b.price;
      if (filters.sortBy === 'price_desc') return b.price - a.price;
      if (filters.sortBy === 'area_asc') return a.area_m2 - b.area_m2;
      if (filters.sortBy === 'area_desc') return b.area_m2 - a.area_m2;
      // Default: recent
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [properties, activeSection, filters, searchQuery]);

  // ── Ações de Imóveis ──
  const handleSaveNewProperty = (newProperty: Property) => {
    setProperties((prev) => [newProperty, ...prev]);

    // Notificação automática
    const newNotification: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Novo ${newProperty.type} Adicionado`,
      body: `${newProperty.neighborhood} • ${newProperty.area_m2}m² • R$ ${newProperty.price.toLocaleString('pt-BR')}`,
      property_id: newProperty.id,
      read: false,
      created_at: 'Agora mesmo',
    };
    setNotifications((prev) => [newNotification, ...prev]);
  };

  const handleArchiveProperty = async (id: string) => {
    setProperties((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const nextStatus = p.status === 'Arquivado' ? 'Ativo' : 'Arquivado';
          return { ...p, status: nextStatus, updated_at: new Date().toISOString() };
        }
        return p;
      })
    );
    setSummaryProperty(null);
  };

  const handleMarkAsSold = async (id: string) => {
    setProperties((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'Vendido', updated_at: new Date().toISOString() } : p))
    );
    setSummaryProperty(null);
  };

  const handleDeleteProperty = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este imóvel do catálogo?')) {
      setProperties((prev) => prev.filter((p) => p.id !== id));
      setSummaryProperty(null);
      if (viewingPropertyId === id) {
        handleBackToInventory();
      }
    }
  };

  // ── Filtros Coordenados por Gráficos do Dashboard ──
  const handleSelectPropertyType = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      type: prev.type === type ? '' : type,
    }));
  };

  const handleSelectNeighborhood = (neighborhood: string) => {
    setFilters((prev) => ({
      ...prev,
      neighborhood: prev.neighborhood === neighborhood ? '' : neighborhood,
    }));
  };

  const handleSelectPriceRange = (min: number, max: number) => {
    const minStr = min > 0 ? min.toString() : '';
    const maxStr = max < Infinity ? max.toString() : '';
    setFilters((prev) => {
      const isSame = prev.minPrice === minStr && prev.maxPrice === maxStr;
      return {
        ...prev,
        minPrice: isSame ? '' : minStr,
        maxPrice: isSame ? '' : maxStr,
      };
    });
  };

  const handleKpiCardClick = (filter: SummaryFilterType) => {
    if (filter === 'own') {
      setFilters({ ...DEFAULT_FILTERS, sourceType: 'Próprio' });
    } else if (filter === 'partner') {
      setFilters({ ...DEFAULT_FILTERS, sourceType: 'Parceiro' });
    } else {
      setFilters(DEFAULT_FILTERS);
    }
    setActiveSection('estoque');
  };

  // ── Exportação de Dados ──
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(properties, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `meus-imoveis-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Tipo', 'Bairro', 'Preço', 'Quartos', 'Suítes', 'Área m²', 'Origem', 'Status'];
    const rows = properties.map((p) => [
      p.id,
      p.type,
      `"${p.neighborhood}"`,
      p.price,
      p.bedrooms,
      p.suites,
      p.area_m2,
      p.source_type,
      p.status,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `meus-imoveis-catalogo-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative w-screen h-screen overflow-hidden flex bg-[#030611] text-slate-100 select-none">
      {/* ── ATMOSPHERE BASE: Wallpaper Crepuscular com Palmeiras + Luzes Atmosféricas ── */}
      <div className="app-atmosphere">
        {/* Imagem de Fundo (Padrão Crepúsculo ou Imagem Customizada) */}
        <div
          className="app-wallpaper-bg"
          style={
            appearance.bgImage
              ? {
                  backgroundImage: `url(${appearance.bgImage})`,
                  filter: `blur(${appearance.bgBlur}px) saturate(${appearance.bgSaturation}) brightness(${appearance.bgBrightness ?? 1.0})`,
                  opacity: appearance.bgOpacity,
                }
              : undefined
          }
        />
        <div
          className="app-wallpaper-overlay"
          style={{
            opacity: appearance.bgDarkness,
          }}
        />
      </div>

      {/* ── ATMOSPHERE LAYER 4: Noise Texture ── */}
      <div className="app-noise" />

      {/* ── SIDEBAR FIXA LATERAL (220px a 235px) ── */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={(section) => {
          handleBackToInventory();
          setActiveSection(section);
        }}
        onOpenCapture={() => setIsCaptureOpen(true)}
      />

      {/* ── ÁREA PRINCIPAL DO COCKPIT OU PÁGINA COMPLETA DO IMÓVEL (NÍVEL 2) ── */}
      <main className="relative z-10 flex-1 flex flex-col h-full overflow-hidden p-3.5 sm:p-5 lg:p-6 min-w-0">
        {viewingProperty ? (
          <PropertyDetailPage
            property={viewingProperty}
            onBack={handleBackToInventory}
            onEdit={(p) => setEditingProperty(p)}
            onArchive={handleArchiveProperty}
            onMarkAsSold={handleMarkAsSold}
            onDelete={handleDeleteProperty}
          />
        ) : (
          <>
            {/* Header Superior */}
            <Header
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            if (activeSection === 'dashboard' && q.trim()) {
              setActiveSection('estoque');
            }
          }}
          unreadNotificationsCount={unreadCount}
          onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
          onOpenSettings={() => setActiveSection('configuracoes')}
          currentUser={{ name: 'Ronaldo Meira', email: 'ronaldomeira@gmail.com' }}
        />

        {/* ── CORPO PRINCIPAL: ALTERNA ENTRE COCKPIT DASHBOARD E OUTRAS VIEWS ── */}
        {activeSection === 'dashboard' && (
          <div className="flex-1 flex flex-col justify-between min-h-0 gap-3 overflow-hidden animate-fade-in">
            {/* 1. TOPO: 4 KPI Cards (Glassmorphism Puro, Sem fotos) */}
            <div className="flex-shrink-0">
              <SummaryCards stats={stats} onSelectFilter={handleKpiCardClick} />
            </div>

            {/* Barra de Filtros Ativos Coordenados no Dashboard */}
            {(filters.neighborhood || filters.type || filters.minPrice || filters.maxPrice) && (
              <div className="flex-shrink-0 flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 backdrop-blur-md animate-fade-in text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-cyan-400">Filtros no estoque:</span>
                  {filters.neighborhood && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 text-[10.5px]">
                      Bairro: <strong className="text-white">{filters.neighborhood}</strong>
                      <button onClick={() => handleSelectNeighborhood(filters.neighborhood)} className="hover:text-white ml-0.5">✕</button>
                    </span>
                  )}
                  {filters.type && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 text-[10.5px]">
                      Tipo: <strong className="text-white">{filters.type}</strong>
                      <button onClick={() => handleSelectPropertyType(filters.type)} className="hover:text-white ml-0.5">✕</button>
                    </span>
                  )}
                  {(filters.minPrice || filters.maxPrice) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 text-[10.5px]">
                      Faixa de preço
                      <button onClick={() => setFilters((p) => ({ ...p, minPrice: '', maxPrice: '' }))} className="hover:text-white ml-0.5">✕</button>
                    </span>
                  )}
                  <span className="text-slate-400 text-[11px] font-medium">
                    • {filteredProperties.length} {filteredProperties.length === 1 ? 'imóvel correspondente' : 'imóveis correspondentes'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setActiveSection('estoque')}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500 text-slate-950 font-bold text-[11px] hover:bg-cyan-400 transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                  >
                    Ver no catálogo ({filteredProperties.length}) →
                  </button>
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="text-[10.5px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}

            {/* 2. MEIO: 3 Gráficos Coordenados (1. Bairros, 2. Tipos de Imóvel, 3. Faixas de Preço) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* 1. Imóveis por bairro */}
              <div className="h-full min-h-[210px] lg:min-h-0">
                <NeighborhoodsChart
                  data={stats.byNeighborhood}
                  selectedNeighborhood={filters.neighborhood}
                  onSelectNeighborhood={handleSelectNeighborhood}
                  onViewAll={() => setActiveSection('estoque')}
                />
              </div>

              {/* 2. Tipos de imóvel (EXATAMENTE NO MEIO) */}
              <div className="h-full min-h-[210px] lg:min-h-0">
                <PropertyTypesChart
                  data={stats.byPropertyType}
                  totalActive={stats.totalActive}
                  selectedType={filters.type}
                  onSelectType={handleSelectPropertyType}
                  onViewAll={() => setActiveSection('estoque')}
                />
              </div>

              {/* 3. Faixas de preço */}
              <div className="h-full min-h-[210px] lg:min-h-0 md:col-span-2 lg:col-span-1">
                <PriceRangeChart
                  data={stats.byPriceRange}
                  totalActive={stats.totalActive}
                  selectedMinPrice={filters.minPrice}
                  selectedMaxPrice={filters.maxPrice}
                  onSelectRange={handleSelectPriceRange}
                  onViewAll={() => setActiveSection('estoque')}
                />
              </div>
            </div>

            {/* 3. RODAPÉ: Carrossel Horizontal de Adicionados Recentemente */}
            <div className="flex-shrink-0">
              <RecentCarousel
                properties={properties.filter((p) => p.status === 'Ativo')}
                onSelectProperty={(prop) => handleOpenSummary(prop)}
                onViewAll={() => setActiveSection('estoque')}
              />
            </div>
          </div>
        )}

        {/* ── VIEW ESTOQUE / PARCEIROS / ARQUIVADOS ── */}
        {(activeSection === 'estoque' || activeSection === 'parceiros' || activeSection === 'arquivados') && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden animate-fade-in">
            {/* Barra de Filtros Sticky */}
            <div className="flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                    {activeSection === 'estoque' && <Building2 className="w-5 h-5 text-cyan-400" />}
                    {activeSection === 'parceiros' && <Users className="w-5 h-5 text-violet-400" />}
                    {activeSection === 'arquivados' && <Archive className="w-5 h-5 text-amber-400" />}
                    {activeSection === 'estoque' && 'Catálogo do Estoque'}
                    {activeSection === 'parceiros' && 'Imóveis em Parceria'}
                    {activeSection === 'arquivados' && 'Imóveis Vendidos e Arquivados'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {filteredProperties.length} imóveis encontrados com os critérios atuais
                  </p>
                </div>

                <button
                  onClick={() => setIsCaptureOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #00E5FF 0%, #38BDF8 100%)',
                    boxShadow: '0 0 16px rgba(0, 229, 255, 0.35)',
                  }}
                >
                  <PlusCircle className="w-4 h-4" />
                  Adicionar Imóvel
                </button>
              </div>

              <PropertyFilters
                filters={filters}
                onFilterChange={(newFilters) => setFilters(newFilters)}
                availableNeighborhoods={availableNeighborhoods}
                totalResults={filteredProperties.length}
              />
            </div>

            {/* Grid de Imóveis com Scroll Vertical */}
            <div className="flex-1 overflow-y-auto pr-1">
              {filteredProperties.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-8 glass-panel">
                  <Building2 className="w-12 h-12 text-slate-600 mb-3" />
                  <h3 className="text-base font-bold text-white mb-1">Nenhum imóvel encontrado</h3>
                  <p className="text-xs text-slate-400 max-w-sm mb-4">
                    Tente ajustar seus filtros de busca ou cadastre um novo imóvel no estoque inteligente.
                  </p>
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-cyan-400 border border-cyan-400/30 transition-colors"
                  >
                    Limpar Filtros
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-8">
                  {filteredProperties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      onClick={() => handleOpenSummary(property)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── VIEW RELATÓRIOS ── */}
        {activeSection === 'relatorios' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReportsView properties={properties} stats={stats} />
          </div>
        )}

        {/* ── VIEW CONFIGURAÇÕES ── */}
        {activeSection === 'configuracoes' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <SettingsView
              appearance={appearance}
              onUpdateAppearance={(newApp) => setAppearance(newApp)}
              geminiApiKey={geminiApiKey}
              onUpdateGeminiKey={handleUpdateGeminiKey}
              groqApiKey={groqApiKey}
              onUpdateGroqKey={handleUpdateGroqKey}
              preferredAIProvider={preferredAIProvider}
              onUpdateAIProvider={handleUpdateAIProvider}
              onExportJSON={handleExportJSON}
              onExportCSV={handleExportCSV}
            />
          </div>
        )}
          </>
        )}
      </main>

      {/* ── MODAL DE RESUMO DO IMÓVEL (NÍVEL 1) ── */}
      {summaryProperty && (
        <PropertySummaryModal
          property={summaryProperty}
          onClose={() => setSummaryProperty(null)}
          onOpenDetail={handleOpenDetail}
        />
      )}

      {/* ── MODAL DE EDIÇÃO DO IMÓVEL ── */}
      <PropertyEditModal
        isOpen={Boolean(editingProperty)}
        property={editingProperty}
        onClose={() => setEditingProperty(null)}
        onSaveProperty={handleUpdateProperty}
      />

      {/* ── MODAL COMPOSER IA DE CAPTAÇÃO ── */}
      <CaptureModal
        isOpen={isCaptureOpen}
        onClose={() => setIsCaptureOpen(false)}
        onSaveProperty={handleSaveNewProperty}
        geminiApiKey={geminiApiKey}
        groqApiKey={groqApiKey}
        preferredAIProvider={preferredAIProvider}
      />

      {/* ── DRAWER LATERAL DE NOTIFICAÇÕES ── */}
      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={() =>
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        }
        onSelectProperty={(propId) => {
          const found = properties.find((p) => p.id === propId);
          if (found) {
            handleOpenSummary(found);
            setIsNotificationDrawerOpen(false);
          }
        }}
        onClearNotifications={() => setNotifications([])}
      />
    </div>
  );
};

export default App;
