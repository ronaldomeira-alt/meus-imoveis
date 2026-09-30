import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar, NavSection, type AppTheme } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { SummaryCards } from './components/dashboard/SummaryCards';
import { NeighborhoodsChart } from './components/dashboard/NeighborhoodsChart';
import { PropertyTypesChart } from './components/dashboard/PropertyTypesChart';
import { PriceRangeChart } from './components/dashboard/PriceRangeChart';
import { RecentCarousel } from './components/dashboard/RecentCarousel';
import { PropertyCard } from './components/properties/PropertyCard';
import { PropertyFilters, FilterState } from './components/properties/PropertyFilters';
import { PropertyDetailPage } from './components/properties/PropertyDetailPage';
import { PropertyEditModal } from './components/properties/PropertyEditModal';
import { AddPropertyPage } from './components/capture/AddPropertyPage';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { SettingsView } from './components/settings/SettingsView';
import { ReportsView } from './components/reports/ReportsView';
import { PilotoAutomaticoView } from './components/marketing/PilotoAutomaticoView';
import { MarketingCalendarView } from './components/marketing/MarketingCalendarView';
import { PostEditorModal } from './components/marketing/PostEditorModal';
import { calculateDashboardStats, supabase } from './lib/supabase';
import { useCurrentUser } from './lib/currentUser';
import type { Property, NotificationItem } from './types/property';
import type { SummaryFilterType } from './components/dashboard/SummaryCards';
import type { PreferredAIProvider } from './lib/ai-provider';
import { Building2, Sparkles } from 'lucide-react';
import { InstagramIcon } from './components/ui/InstagramIcon';
import { getSavedPublicAdminToken, setPublicPage } from './lib/publicProperties';
import { AuthProvider, useAuth } from './lib/auth';
import { AuthGuard } from './components/auth/AuthGuard';
import { MatchView } from './components/match/MatchView';
import { syncPropertyToMatch, deletePropertyFromMatch } from './lib/match/service';
import { isMatchRelevantPropertyChange } from './lib/match/property-adapter';
import type { InventorySnapshot } from './lib/inventorySync';
import { deleteInventoryProperty, fetchInventorySnapshot, mergeInventoryProperties, syncInventoryProperties } from './lib/inventorySync';

const DEFAULT_FILTERS: FilterState = {
  neighborhood: '',
  type: '',
  bedrooms: '',
  minPrice: '',
  maxPrice: '',
  sourceType: '',
  status: 'Ativo',
  sortBy: 'recent',
  onlyThisWeek: false,
};

const SECTION_TO_PATH: Record<NavSection, string> = {
  dashboard: '/dashboard',
  estoque: '/estoque',
  match: '/match',
  captar: '/adicionar-imovel',
  piloto: '/piloto-automatico',
  calendario: '/calendario',
  parceiros: '/parceiros',
  arquivados: '/arquivados',
  relatorios: '/relatorios',
  configuracoes: '/configuracoes',
};

const PATH_TO_SECTION: Record<string, NavSection> = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/estoque': 'estoque',
  '/match': 'match',
  '/adicionar-imovel': 'captar',
  '/captar': 'captar',
  '/piloto': 'piloto',
  '/piloto-automatico': 'piloto',
  '/calendario': 'calendario',
  '/parceiros': 'parceiros',
  '/arquivados': 'arquivados',
  '/relatorios': 'relatorios',
  '/configuracoes': 'configuracoes',
  '/config': 'configuracoes',
};

const getSectionFromPathname = (pathname: string): NavSection => {
  const clean = pathname.toLowerCase().replace(/\/$/, '') || '/';
  if (clean.startsWith('/match')) return 'match';
  return PATH_TO_SECTION[clean] || 'dashboard';
};

const PENDING_INVENTORY_DELETES_KEY = 'meus_imoveis_pending_deletes';

const readPendingInventoryDeletes = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_INVENTORY_DELETES_KEY) || '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Apartamento no Brisamar',
    body: 'Apartamento de 57m² com 2 quartos cadastrado no catálogo.',
    property_id: 'prop-1790537804954',
    read: false,
    created_at: 'Hoje',
  },
  {
    id: 'n2',
    title: 'Studio em Intermares',
    body: 'Studio de 22m² cadastrado no catálogo.',
    property_id: 'prop-1790536332004',
    read: false,
    created_at: 'Hoje',
  },
];

const CrmAppContent: React.FC<{ theme: AppTheme; onToggleTheme: () => void }> = ({ theme, onToggleTheme }) => {
  const { signOut, user } = useAuth();
  const [currentUser] = useCurrentUser();

  // ── Navegação Ativa (inicializada a partir da URL) ──
  const [activeSection, setActiveSection] = useState<NavSection>(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (!pathname.startsWith('/imoveis/')) {
        return getSectionFromPathname(pathname);
      }
    }
    return 'dashboard';
  });

  const navigateToSection = (section: NavSection, replace = false) => {
    setViewingPropertyId(null);
    setActiveSection(section);
    setIsMobileNavOpen(false);
    const targetPath = SECTION_TO_PATH[section] || '/dashboard';
    if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      if (replace) {
        window.history.replaceState({ section }, '', targetPath);
      } else {
        window.history.pushState({ section }, '', targetPath);
      }
    }
  };

  // ── Dados do Catálogo de Imóveis ──
  const [properties, setProperties] = useState<Property[]>(() => {
    const saved = localStorage.getItem('meus_imoveis_data');
    let loaded: Property[] = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Purga imóveis fictícios legados (ex: prop-01 a prop-24 ou fotos de unsplash)
          loaded = parsed.filter((p: Property) => {
            const isLegacySeedId = /^prop-(?:0?[1-9]|1[0-9]|2[0-4])$/.test(p.id);
            const hasUnsplash = p.photos?.some(
              (ph) => typeof ph?.storage_path === 'string' && ph.storage_path.includes('unsplash.com')
            );
            return !isLegacySeedId && !hasUnsplash;
          });
        }
      } catch (e) {
        console.error('Erro ao ler dados salvos:', e);
      }
    }

    return loaded;
  });

  const [inventoryReady, setInventoryReady] = useState(() => !supabase);
  const inventorySnapshotRef = React.useRef<InventorySnapshot>({ properties: [], deletedIds: [] });

  // O Supabase é a fonte compartilhada; o localStorage mantém o app utilizável offline.
  useEffect(() => {
    const client = supabase;
    if (!client || !user) {
      return;
    }

    let disposed = false;
    const flushPendingDeletes = async (): Promise<string[]> => {
      const pending = readPendingInventoryDeletes();
      const failed: string[] = [];
      for (const id of pending) {
        try {
          await deletePropertyFromMatch(id);
          await deleteInventoryProperty(id);
        } catch {
          failed.push(id);
        }
      }
      localStorage.setItem(PENDING_INVENTORY_DELETES_KEY, JSON.stringify(failed));
      return failed;
    };
    const bootstrap = async () => {
      try {
        const pendingDeletes = await flushPendingDeletes();
        const snapshot = await fetchInventorySnapshot();
        if (disposed) return;
        snapshot.deletedIds = [...new Set([...snapshot.deletedIds, ...pendingDeletes])];
        inventorySnapshotRef.current = snapshot;
        const local = JSON.parse(localStorage.getItem('meus_imoveis_data') || '[]') as Property[];
        const merged = mergeInventoryProperties(local, snapshot);
        setProperties(merged);
        await syncInventoryProperties(merged.filter((property) => !snapshot.deletedIds.includes(property.id)));
      } catch (error) {
        console.error('[Estoque] Não foi possível carregar a cópia compartilhada:', error);
      } finally {
        if (!disposed) setInventoryReady(true);
      }
    };

    void bootstrap();

    const refresh = async () => {
      try {
        const pendingDeletes = await flushPendingDeletes();
        const snapshot = await fetchInventorySnapshot();
        if (disposed) return;
        snapshot.deletedIds = [...new Set([...snapshot.deletedIds, ...pendingDeletes])];
        inventorySnapshotRef.current = snapshot;
        setProperties((current) => {
          const merged = mergeInventoryProperties(current, snapshot);
          return JSON.stringify(merged) === JSON.stringify(current) ? current : merged;
        });
      } catch (error) {
        console.error('[Estoque] Falha ao atualizar a sincronização:', error);
      }
    };
    const channel = client
      .channel('inventory-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_properties' }, () => void refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_property_tombstones' }, () => void refresh())
      .subscribe();
    const onResume = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      disposed = true;
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onResume);
      void client.removeChannel(channel);
    };
  }, [user]);

  // Salva no localStorage quando alterado
  useEffect(() => {
    localStorage.setItem('meus_imoveis_data', JSON.stringify(properties));
    if (inventoryReady && supabase && user) {
      const deletedIds = new Set(inventorySnapshotRef.current.deletedIds);
      void syncInventoryProperties(properties.filter((property) => !deletedIds.has(property.id)))
        .catch((error) => console.error('[Estoque] Falha ao salvar a cópia compartilhada:', error));
    }
  }, [properties, inventoryReady, user]);

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
  const [matchToast, setMatchToast] = useState<{ title: string; count: number } | null>(null);

  // Sincronização inicial de imóveis ativos com a projeção do Match
  const initialMatchSyncStarted = React.useRef(false);
  useEffect(() => {
    if (!inventoryReady || initialMatchSyncStarted.current) return;
    initialMatchSyncStarted.current = true;
    const activeProps = properties.filter((p) => p.status === 'Ativo');
    // Executa em segundo plano de forma silenciosa e não-bloqueante
    activeProps.forEach((p) => {
      syncPropertyToMatch(p).catch(() => {});
    });
  }, [inventoryReady, properties]);



  const viewingProperty = useMemo(() => {
    if (!viewingPropertyId) return null;
    return properties.find((p) => p.id === viewingPropertyId) || null;
  }, [properties, viewingPropertyId]);

  // ── Sincronização de Rotas SPA (/imoveis/:id, seções) e Histórico do Navegador ──
  useEffect(() => {
    const parseUrl = () => {
      const pathname = window.location.pathname;
      const match = pathname.match(/^\/imoveis\/([^/]+)$/);
      if (match && match[1]) {
        setViewingPropertyId(match[1]);
      } else {
        setViewingPropertyId(null);
        const section = getSectionFromPathname(pathname);
        setActiveSection(section);
      }
    };

    parseUrl();

    // Normaliza URL inicial '/' para '/dashboard' sem quebrar histórico
    if (window.location.pathname === '/') {
      window.history.replaceState({ section: 'dashboard' }, '', '/dashboard');
    }

    window.addEventListener('popstate', parseUrl);
    return () => window.removeEventListener('popstate', parseUrl);
  }, []);

  const handleOpenDetail = (property: Property) => {
    setViewingPropertyId(property.id);
    if (typeof window !== 'undefined') {
      window.history.pushState(
        { propertyId: property.id, section: activeSection },
        '',
        `/imoveis/${property.id}`
      );
    }
  };

  const handleBackToInventory = () => {
    setViewingPropertyId(null);
    if (typeof window !== 'undefined') {
      const targetPath = SECTION_TO_PATH[activeSection] || '/estoque';
      window.history.pushState({ section: activeSection }, '', targetPath);
    }
  };

  const handleUpdateProperty = (updatedProperty: Property) => {
    const syncedProperty = { ...updatedProperty, updated_at: new Date().toISOString() };
    const currentProperty = properties.find((property) => property.id === updatedProperty.id);
    if (currentProperty?.public_page_active) {
      const token = getSavedPublicAdminToken();
      if (token) {
        void setPublicPage(syncedProperty, syncedProperty.status === 'Ativo' && currentProperty.status === 'Ativo', token)
          .then((result) => setProperties((prev) => prev.map((property) => property.id === updatedProperty.id
            ? { ...syncedProperty, public_page_id: result.id, public_page_active: result.active }
            : property)))
          .catch((error) => console.error('Não foi possível atualizar a página pública do imóvel:', error));
      }
    }
    setProperties((prev) =>
      prev.map((p) => (p.id === syncedProperty.id ? syncedProperty : p))
    );

    // FASE 9 & 28: Recalcula Matches apenas se campos relevantes mudaram
    if (currentProperty && isMatchRelevantPropertyChange(currentProperty, syncedProperty)) {
      syncPropertyToMatch(syncedProperty)
        .then((res) => {
          if (res.strongMatchesCount > 0) {
            setMatchToast({
              title: syncedProperty.title || syncedProperty.condominium_name || 'Imóvel atualizado',
              count: res.strongMatchesCount,
            });
          }
        })
        .catch((err) => console.error('[Match] Erro ao recalcular imóvel atualizado:', err));
    }
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
        const matchInternalName = (p.internal_name || '').toLowerCase().includes(q);
        const matchCondo = (p.condominium_name || '').toLowerCase().includes(q);
        const matchAddress = (p.address || '').toLowerCase().includes(q);
        const matchNotes = (p.notes || '').toLowerCase().includes(q);
        if (!matchTitle && !matchInternalName && !matchCondo && !matchAddress && !matchNotes) {
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

      // Filtro de Adicionados Esta Semana
      if (filters.onlyThisWeek) {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        if (new Date(p.created_at) < oneWeekAgo) return false;
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
    const savedProperty = { ...newProperty, updated_at: new Date().toISOString() };
    setProperties((prev) => [savedProperty, ...prev]);

    // Notificação automática
    const newNotification: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Novo ${savedProperty.type} Adicionado`,
      body: `${savedProperty.neighborhood} • ${savedProperty.area_m2 || 0}m² • R$ ${(Number(savedProperty.price) || 0).toLocaleString('pt-BR')}`,
      property_id: savedProperty.id,
      read: false,
      created_at: 'Agora mesmo',
    };
    setNotifications((prev) => [newNotification, ...prev]);

    // FASE 9 & 10: Evento property.created -> Roda Match com leads elegíveis
    syncPropertyToMatch(savedProperty)
      .then((res) => {
        if (res.strongMatchesCount > 0) {
          const strongNotif: NotificationItem = {
            id: `match-strong-${Date.now()}`,
            title: 'Matches Fortes Encontrados 🎯',
            body: `${savedProperty.title || savedProperty.condominium_name || 'Novo imóvel'} gerou ${res.strongMatchesCount} Matches fortes (${res.matchesCount} no total)!`,
            property_id: savedProperty.id,
            read: false,
            created_at: 'Agora mesmo',
          };
          setNotifications((prev) => [strongNotif, ...prev]);
          setMatchToast({
            title: savedProperty.title || savedProperty.condominium_name || 'Novo imóvel',
            count: res.strongMatchesCount,
          });
        }
      })
      .catch((err) => console.error('[Match] Erro ao sincronizar novo imóvel:', err));

    // Pergunta 1-Click: deseja agendar/criar publicação no Instagram para o imóvel?
    setSavedPropertyPrompt(savedProperty);
  };

  const handleArchiveProperty = async (id: string) => {
    const property = properties.find((item) => item.id === id);
    if (property?.public_page_active) {
      const token = getSavedPublicAdminToken();
      if (token) void setPublicPage(property, false, token)
        .then((result) => setProperties((prev) => prev.map((item) => item.id === id ? { ...item, public_page_id: result.id, public_page_active: result.active } : item)))
        .catch((error) => console.error('Não foi possível atualizar a página pública do imóvel:', error));
    }
    const nextStatus = property?.status === 'Arquivado' ? 'Ativo' : 'Arquivado';
    if (property) {
      syncPropertyToMatch({ ...property, status: nextStatus }).catch(console.error);
    }
    setProperties((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, status: nextStatus, updated_at: new Date().toISOString() };
        }
        return p;
      })
    );
  };

  const handleMarkAsSold = async (id: string) => {
    const property = properties.find((item) => item.id === id);
    if (property?.public_page_active) {
      const token = getSavedPublicAdminToken();
      if (token) void setPublicPage(property, false, token)
        .then((result) => setProperties((prev) => prev.map((item) => item.id === id ? { ...item, public_page_id: result.id, public_page_active: result.active } : item)))
        .catch((error) => console.error('Não foi possível atualizar a página pública do imóvel:', error));
    }
    if (property) {
      syncPropertyToMatch({ ...property, status: 'Vendido' }).catch(console.error);
    }
    setProperties((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'Vendido', updated_at: new Date().toISOString() } : p))
    );
  };

  const handleDeleteProperty = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este imóvel do catálogo?')) {
      try {
        await deletePropertyFromMatch(id);
      } catch (error) {
        const pending = new Set(readPendingInventoryDeletes());
        pending.add(id);
        localStorage.setItem(PENDING_INVENTORY_DELETES_KEY, JSON.stringify([...pending]));
        inventorySnapshotRef.current.deletedIds = [...new Set([...inventorySnapshotRef.current.deletedIds, id])];
        console.warn('[Match] Exclusão será reenviada quando houver conexão:', error);
      }
      try {
        await deleteInventoryProperty(id);
      } catch (error) {
        const pending = new Set(readPendingInventoryDeletes());
        pending.add(id);
        localStorage.setItem(PENDING_INVENTORY_DELETES_KEY, JSON.stringify([...pending]));
        inventorySnapshotRef.current.deletedIds = [...new Set([...inventorySnapshotRef.current.deletedIds, id])];
        console.warn('[Estoque] Exclusão compartilhada será reenviada quando houver conexão:', error);
      }
      const property = properties.find((item) => item.id === id);
      const token = getSavedPublicAdminToken();
      if (property?.public_page_active && token) void setPublicPage(property, false, token)
        .catch((error) => console.error('Não foi possível desativar a página pública do imóvel:', error));
      setProperties((prev) => prev.filter((p) => p.id !== id));
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
    setSearchQuery('');
    if (filter === 'own') {
      setFilters({ ...DEFAULT_FILTERS, sourceType: 'Próprio' });
    } else if (filter === 'partner') {
      setFilters({ ...DEFAULT_FILTERS, sourceType: 'Parceiro' });
    } else if (filter === 'this_week') {
      setFilters({ ...DEFAULT_FILTERS, onlyThisWeek: true });
    } else {
      setFilters(DEFAULT_FILTERS);
    }
    navigateToSection('estoque');
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
          navigateToSection(section);
        }}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {/* ── ÁREA PRINCIPAL DO COCKPIT OU PÁGINA COMPLETA (NÍVEL 2) ── */}
      <main
        data-detail-view={Boolean(viewingProperty)}
        className={`app-main relative z-10 flex-1 flex flex-col h-full overflow-hidden min-w-0 ${
          viewingProperty
            ? 'pt-0 pb-0 px-0 md:pl-[72px]'
            : 'py-3.5 sm:py-5 lg:py-6 pr-3.5 pl-3.5 sm:pr-5 sm:pl-5 md:pl-[92px] lg:pr-6 lg:pl-[96px]'
        }`}
      >
        {activeSection === 'captar' ? (
          <AddPropertyPage
            onSaveProperty={(p) => {
              handleSaveNewProperty(p);
              navigateToSection('estoque');
            }}
            onBack={() => navigateToSection('dashboard')}
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
          showGreeting={activeSection === 'dashboard'}
          sectionTitle={activeSection === 'estoque' ? 'Estoque' : activeSection === 'parceiros' ? 'Imóveis em Parceria' : activeSection === 'arquivados' ? 'Imóveis Vendidos e Arquivados' : undefined}
          sectionCount={activeSection === 'estoque' || activeSection === 'parceiros' || activeSection === 'arquivados' ? filteredProperties.length : undefined}
          onAddProperty={activeSection === 'estoque' || activeSection === 'parceiros' || activeSection === 'arquivados' ? () => navigateToSection('captar') : undefined}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            if (activeSection === 'dashboard' && q.trim()) {
              navigateToSection('estoque');
            }
          }}
          unreadNotificationsCount={unreadCount}
          onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
          onOpenSettings={() => navigateToSection('configuracoes')}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          currentUser={currentUser}
          onLogout={signOut}
        />

        {/* ── CORPO PRINCIPAL: ALTERNA ENTRE COCKPIT DASHBOARD E OUTRAS VIEWS ── */}
        {activeSection === 'dashboard' && (
          <div className="dashboard-scroll flex-1 flex flex-col min-h-0 gap-3 overflow-y-auto no-scrollbar animate-fade-in">
            {/* 1. TOPO: 4 KPI Cards */}
            <div className="flex-shrink-0">
              <SummaryCards
                stats={stats}
                activeFilter={
                  filters.onlyThisWeek
                    ? 'this_week'
                    : filters.sourceType === 'Próprio'
                    ? 'own'
                    : filters.sourceType === 'Parceiro'
                    ? 'partner'
                    : undefined
                }
                onSelectFilter={handleKpiCardClick}
              />
            </div>

            {/* Barra de Filtros Ativos Coordenados no Dashboard */}
            {(filters.neighborhood || filters.type || filters.minPrice || filters.maxPrice || filters.sourceType || filters.onlyThisWeek) && (
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
                  {filters.sourceType && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/15 text-blue-200 border border-accent/30 text-[10.5px]">
                      Origem: <strong className="text-ink-primary">{filters.sourceType}</strong>
                      <button onClick={() => setFilters((p) => ({ ...p, sourceType: '' }))} className="hover:text-ink-primary ml-0.5">✕</button>
                    </span>
                  )}
                  {filters.onlyThisWeek && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/15 text-blue-200 border border-accent/30 text-[10.5px]">
                      Cadastrados: <strong className="text-ink-primary">Esta semana</strong>
                      <button onClick={() => setFilters((p) => ({ ...p, onlyThisWeek: false }))} className="hover:text-ink-primary ml-0.5">✕</button>
                    </span>
                  )}
                  <span className="text-ink-secondary text-[11px] font-medium">
                    • {filteredProperties.length} {filteredProperties.length === 1 ? 'imóvel correspondente' : 'imóveis correspondentes'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigateToSection('estoque')}
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
            <div className="dashboard-charts grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-[300px] lg:auto-rows-[clamp(260px,36vh,380px)] gap-3.5 flex-shrink-0">
              {/* 1. Imóveis por bairro */}
              <div className="h-full min-h-[210px] lg:min-h-0">
                <NeighborhoodsChart
                  data={stats.byNeighborhood}
                  selectedNeighborhood={filters.neighborhood}
                  onSelectNeighborhood={handleSelectNeighborhood}
                  onViewAll={() => navigateToSection('estoque')}
                />
              </div>

              {/* 2. Tipos de imóvel (EXATAMENTE NO MEIO) */}
              <div className="h-full min-h-[210px] lg:min-h-0">
                <PropertyTypesChart
                  data={stats.byPropertyType}
                  totalActive={stats.totalActive}
                  selectedType={filters.type}
                  onSelectType={handleSelectPropertyType}
                  onViewAll={() => navigateToSection('estoque')}
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
                  onViewAll={() => navigateToSection('estoque')}
                />
              </div>
            </div>

            {/* 3. RODAPÉ: Carrossel Horizontal de Adicionados Recentemente */}
            <div className="flex-shrink-0">
              <RecentCarousel
                properties={properties.filter((p) => p.status === 'Ativo')}
                onSelectProperty={(prop) => handleOpenDetail(prop)}
                onViewAll={() => navigateToSection('estoque')}
              />
            </div>
          </div>
        )}

        {/* ── VIEW ESTOQUE / PARCEIROS / ARQUIVADOS ── */}
        {(activeSection === 'estoque' || activeSection === 'parceiros' || activeSection === 'arquivados') && (
          <div className="flex-1 flex flex-col min-h-0 gap-2 overflow-hidden animate-fade-in">
            {/* Barra de Filtros Sticky */}
            <div className="flex-shrink-0 sm:sticky sm:top-0 z-20 bg-[var(--bg-base)]/95">
              <PropertyFilters
                filters={filters}
                onFilterChange={(newFilters) => setFilters(newFilters)}
                availableNeighborhoods={availableNeighborhoods}
                availablePriceBounds={{
                  min: Math.min(...properties.map((property) => property.price), 0),
                  max: Math.max(...properties.map((property) => property.price), 0),
                }}
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
                <div className="grid w-full max-w-[1570px] mx-auto grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-5 pb-8">
                  {filteredProperties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      onClick={() => handleOpenDetail(property)}
                      onUpdateProperty={handleUpdateProperty}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── VIEW MATCH (Fase 11) ── */}
        {activeSection === 'match' && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col h-full">
              <MatchView searchQuery={searchQuery} />
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
              onOpenPiloto={() => navigateToSection('piloto')}
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
            handleOpenDetail(found);
            setIsNotificationDrawerOpen(false);
          }
        }}
        onClearNotifications={() => setNotifications([])}
      />

      {/* ── MODAL 1-CLICK: CONFIRMAÇÃO APÓS SALVAR IMÓVEL (FASE 13) ── */}
      {savedPropertyPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-surface-3 border border-line-strong p-6 shadow-modal space-y-4 text-center">
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
              <div className="mt-3 p-3 rounded-xl bg-surface-1 border border-line-subtle text-left">
                <p className="text-xs font-bold text-ink-primary truncate">
                  {savedPropertyPrompt.type} · {savedPropertyPrompt.neighborhood}
                </p>
                <p className="text-[11px] font-semibold text-accent mt-0.5">
                  R$ {(Number(savedPropertyPrompt.price) || 0).toLocaleString('pt-BR')} • {savedPropertyPrompt.area_m2 || 0}m²
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                onClick={() => setSavedPropertyPrompt(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-1 border border-line-strong text-xs font-semibold text-ink-primary hover:bg-surface-2 hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                Agora não
              </button>

              <button
                onClick={() => {
                  const targetProp = savedPropertyPrompt;
                  setSavedPropertyPrompt(null);
                  setMarketingPostProperty(targetProp);
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 text-white text-xs font-bold shadow-lg shadow-pink-500/20 hover:opacity-95 transition-all cursor-pointer"
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

      {/* ── TOAST CONTEXTUAL: NOVO MATCH FORTE (Fase 10 & 24) ── */}
      {matchToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-[#131722]/95 backdrop-blur-md border border-accent/40 shadow-2xl flex items-center gap-3 animate-fade-in max-w-sm">
          <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-ink-primary">
              Matches Fortes Encontrados!
            </h4>
            <p className="text-[11px] text-ink-secondary mt-0.5 truncate">
              {matchToast.title} gerou {matchToast.count} {matchToast.count === 1 ? 'match forte' : 'matches fortes'}.
            </p>
          </div>
          <button
            onClick={() => {
              setMatchToast(null);
              navigateToSection('match');
            }}
            className="btn-primary px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 cursor-pointer"
          >
            Ver Matches
          </button>
          <button
            onClick={() => setMatchToast(null)}
            className="text-ink-muted hover:text-ink-primary text-xs ml-1 cursor-pointer p-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  const [theme, setTheme] = useState<AppTheme>(() => {
    const savedTheme = localStorage.getItem('meus_imoveis_theme');
    return savedTheme === 'light' || savedTheme === 'light-blue' ? savedTheme : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('meus_imoveis_theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F6F8F8' : theme === 'light-blue' ? '#F6F8FA' : '#020408');
  }, [theme]);

  return (
    <AuthProvider>
      <AuthGuard>
        <CrmAppContent theme={theme} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : current === 'light' ? 'light-blue' : 'dark')} />
      </AuthGuard>
    </AuthProvider>
  );
};

export default App;
