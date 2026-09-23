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
import { AddPropertyPage } from './components/capture/AddPropertyPage';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { SettingsView } from './components/settings/SettingsView';
import { ReportsView } from './components/reports/ReportsView';
import { PilotoAutomaticoView } from './components/marketing/PilotoAutomaticoView';
import { MarketingCalendarView } from './components/marketing/MarketingCalendarView';
import { PostEditorModal } from './components/marketing/PostEditorModal';
import { initialProperties } from './data/initialProperties';
import { calculateDashboardStats } from './lib/supabase';
import { useCurrentUser } from './lib/currentUser';
import type { Property, NotificationItem } from './types/property';
import type { SummaryFilterType } from './components/dashboard/SummaryCards';
import type { PreferredAIProvider } from './lib/ai-provider';
import { PlusCircle, Building2, Users, Archive } from 'lucide-react';
import { InstagramIcon } from './components/ui/InstagramIcon';

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
  // ── Usuário Ativo (Ronaldo/Thatianna, trocado no dropdown do Header) ──
  const [currentUser, setCurrentUserId] = useCurrentUser();

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

  // ── Navegação Mobile (Sidebar em modo drawer abaixo do breakpoint md) ──
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // ── Modais e Visualização em Dois Níveis (Modal Resumo → Página Completa) ──
  const [summaryProperty, setSummaryProperty] = useState<Property | null>(null);
  const [viewingPropertyId, setViewingPropertyId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/imoveis\/([^/]+)$/);
      return match ? match[1] : null;
    }
    return null;
  });
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  // ── Marketing & Post Studio (Fase 13, 14, 15) ──
  const [marketingPostProperty, setMarketingPostProperty] = useState<Property | null>(null);
  const [savedPropertyPrompt, setSavedPropertyPrompt] = useState<Property | null>(null);



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
        const candidates = Array.from(
          document.querySelectorAll('input[placeholder*="Buscar"]')
        ) as HTMLInputElement[];
        const searchInput = candidates.find((el) => el.offsetParent !== null) || candidates[0];
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

    // Pergunta 1-Click: deseja agendar/criar publicação no Instagram para o imóvel?
    setSavedPropertyPrompt(newProperty);
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
    <div className="relative w-screen h-screen overflow-hidden flex bg-[var(--bg-base)] text-ink-primary select-none">
      {/* ── SIDEBAR (fixa em desktop, drawer off-canvas em mobile) ── */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={(section) => {
          handleBackToInventory();
          setActiveSection(section);
          setIsMobileNavOpen(false);
        }}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        currentUser={currentUser}
      />

      {/* ── ÁREA PRINCIPAL DO COCKPIT OU PÁGINA COMPLETA (NÍVEL 2) ── */}
      <main className="relative z-10 flex-1 flex flex-col h-full overflow-hidden py-3.5 pr-3.5 pl-3.5 sm:py-5 sm:pr-5 sm:pl-5 md:pl-[92px] lg:py-6 lg:pr-6 lg:pl-[96px] min-w-0">
        {activeSection === 'captar' ? (
          <AddPropertyPage
            onSaveProperty={(p) => {
              handleSaveNewProperty(p);
              setActiveSection('estoque');
            }}
            onBack={() => setActiveSection('dashboard')}
            geminiApiKey={geminiApiKey}
            groqApiKey={groqApiKey}
            preferredAIProvider={preferredAIProvider}
          />
        ) : viewingProperty ? (
          <PropertyDetailPage
            property={viewingProperty}
            onBack={handleBackToInventory}
            onEdit={(p) => setEditingProperty(p)}
            onUpdateProperty={handleUpdateProperty}
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
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          currentUser={currentUser}
          onChangeUser={setCurrentUserId}
        />

        {/* ── CORPO PRINCIPAL: ALTERNA ENTRE COCKPIT DASHBOARD E OUTRAS VIEWS ── */}
        {activeSection === 'dashboard' && (
          <div className="flex-1 flex flex-col md:justify-between min-h-0 gap-3 overflow-y-auto md:overflow-hidden no-scrollbar animate-fade-in">
            {/* 1. TOPO: 4 KPI Cards */}
            <div className="flex-shrink-0">
              <SummaryCards stats={stats} onSelectFilter={handleKpiCardClick} />
            </div>

            {/* Barra de Filtros Ativos Coordenados no Dashboard */}
            {(filters.neighborhood || filters.type || filters.minPrice || filters.maxPrice) && (
              <div className="flex-shrink-0 flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-accent/10 border border-accent/30 animate-fade-in text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-accent">Filtros no estoque:</span>
                  {filters.neighborhood && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/15 text-blue-200 border border-accent/30 text-[10.5px]">
                      Bairro: <strong className="text-ink-primary">{filters.neighborhood}</strong>
                      <button onClick={() => handleSelectNeighborhood(filters.neighborhood)} className="hover:text-ink-primary ml-0.5">✕</button>
                    </span>
                  )}
                  {filters.type && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/15 text-blue-200 border border-accent/30 text-[10.5px]">
                      Tipo: <strong className="text-ink-primary">{filters.type}</strong>
                      <button onClick={() => handleSelectPropertyType(filters.type)} className="hover:text-ink-primary ml-0.5">✕</button>
                    </span>
                  )}
                  {(filters.minPrice || filters.maxPrice) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/15 text-blue-200 border border-accent/30 text-[10.5px]">
                      Faixa de preço
                      <button onClick={() => setFilters((p) => ({ ...p, minPrice: '', maxPrice: '' }))} className="hover:text-ink-primary ml-0.5">✕</button>
                    </span>
                  )}
                  <span className="text-ink-secondary text-[11px] font-medium">
                    • {filteredProperties.length} {filteredProperties.length === 1 ? 'imóvel correspondente' : 'imóveis correspondentes'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setActiveSection('estoque')}
                    className="btn-primary px-2.5 py-1 rounded-lg text-[11px] cursor-pointer"
                  >
                    Ver no catálogo ({filteredProperties.length}) →
                  </button>
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="text-[10.5px] text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}

            {/* 2. MEIO: 3 Gráficos Coordenados (1. Bairros, 2. Tipos de Imóvel, 3. Faixas de Preço) */}
            <div className="md:flex-1 md:min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 flex-shrink-0">
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
            <div className="flex-shrink-0 sticky top-0 z-20 bg-[var(--bg-base)]/95 backdrop-blur-md pt-1 pb-2">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-xl font-extrabold text-ink-primary flex items-center gap-2">
                    {activeSection === 'estoque' && <Building2 className="w-5 h-5 text-accent" />}
                    {activeSection === 'parceiros' && <Users className="w-5 h-5 text-status-partner" />}
                    {activeSection === 'arquivados' && <Archive className="w-5 h-5 text-status-warning" />}
                    {activeSection === 'estoque' && 'Catálogo do Estoque'}
                    {activeSection === 'parceiros' && 'Imóveis em Parceria'}
                    {activeSection === 'arquivados' && 'Imóveis Vendidos e Arquivados'}
                  </h2>
                  <p className="text-xs text-ink-secondary">
                    {filteredProperties.length} imóveis encontrados com os critérios atuais
                  </p>
                </div>

                <button
                  onClick={() => setActiveSection('captar')}
                  className="btn-primary px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
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

            {/* Grid de Imóveis com Scroll Vertical e respiro aprimorado */}
            <div className="flex-1 overflow-y-auto pr-1">
              {filteredProperties.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-8 panel-surface">
                  <Building2 className="w-12 h-12 text-ink-muted mb-3" />
                  <h3 className="text-base font-bold text-ink-primary mb-1">Nenhum imóvel encontrado</h3>
                  <p className="text-xs text-ink-secondary max-w-sm mb-4">
                    Tente ajustar seus filtros de busca ou cadastre um novo imóvel no estoque inteligente.
                  </p>
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="btn-secondary px-4 py-2 rounded-xl text-xs font-semibold text-accent transition-colors"
                  >
                    Limpar Filtros
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-8">
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

        {/* ── VIEW PILOTO AUTOMÁTICO (INSTAGRAM) ── */}
        {activeSection === 'piloto' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <PilotoAutomaticoView
              properties={properties}
              onOpenProperty={(p) => handleOpenDetail(p)}
            />
          </div>
        )}

        {/* ── VIEW CALENDÁRIO EDITORIAL ── */}
        {activeSection === 'calendario' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <MarketingCalendarView
              properties={properties}
              onOpenPiloto={() => setActiveSection('piloto')}
            />
          </div>
        )}

        {/* ── VIEW CONFIGURAÇÕES ── */}
        {activeSection === 'configuracoes' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <SettingsView
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

      {/* ── MODAL 1-CLICK: CONFIRMAÇÃO APÓS SALVAR IMÓVEL (FASE 13) ── */}
      {savedPropertyPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-line-strong p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-pink-500/20">
              <InstagramIcon className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-ink-primary">
                Imóvel Salvo no Catálogo!
              </h3>
              <p className="text-xs text-ink-secondary mt-1">
                Deseja criar a publicação para o Instagram e agendar no piloto automático agora?
              </p>
              <div className="mt-3 p-3 rounded-xl bg-white/[0.03] border border-line-subtle text-left">
                <p className="text-xs font-bold text-ink-primary truncate">
                  {savedPropertyPrompt.type} · {savedPropertyPrompt.neighborhood}
                </p>
                <p className="text-[11px] text-accent">
                  R$ {savedPropertyPrompt.price.toLocaleString('pt-BR')} • {savedPropertyPrompt.area_m2}m²
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                onClick={() => setSavedPropertyPrompt(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-line-subtle text-xs font-semibold text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-colors"
              >
                Agora não
              </button>

              <button
                onClick={() => {
                  const targetProp = savedPropertyPrompt;
                  setSavedPropertyPrompt(null);
                  setMarketingPostProperty(targetProp);
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 text-white text-xs font-bold shadow-lg shadow-pink-500/20 hover:opacity-95 transition-all"
              >
                Criar Post com IA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL POST STUDIO (CRIAR / EDITAR POST) ── */}
      {marketingPostProperty && (
        <PostEditorModal
          isOpen={Boolean(marketingPostProperty)}
          onClose={() => setMarketingPostProperty(null)}
          property={marketingPostProperty}
          onSaved={() => {
            // Notifica atualização dos posts
            window.dispatchEvent(new CustomEvent('marketing-posts-updated'));
          }}
        />
      )}
    </div>
  );
};

export default App;
