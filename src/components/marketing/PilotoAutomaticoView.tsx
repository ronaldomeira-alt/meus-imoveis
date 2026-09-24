import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  Send,
  Trash2,
  Edit3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { InstagramIcon } from '../ui/InstagramIcon';
import type { Property } from '../../types/property';
import type { MarketingPost, PostStatus, InstagramAccount } from '../../types/marketing';
import {
  getMarketingPosts,
  deleteMarketingPost,
  saveMarketingPost,
  getInstagramAccount
} from '../../lib/marketing-db';
import { publishMarketingPostNow } from '../../lib/marketing-scheduler';
import { PostEditorModal } from './PostEditorModal';

interface PilotoAutomaticoViewProps {
  properties: Property[];
  onOpenProperty?: (property: Property) => void;
}

export const PilotoAutomaticoView: React.FC<PilotoAutomaticoViewProps> = ({
  properties,
}) => {
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedPropertyForNew, setSelectedPropertyForNew] = useState<Property | null>(null);
  const [editingPost, setEditingPost] = useState<MarketingPost | null>(null);
  const [isPropertyPickerOpen, setIsPropertyPickerOpen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [igAccount, setIgAccount] = useState<InstagramAccount | null>(null);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const [data, account] = await Promise.all([
        getMarketingPosts(),
        getInstagramAccount()
      ]);
      setPosts(data);
      setIgAccount(account);
    } catch (err) {
      console.error('Erro ao carregar posts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();

    const handleUpdate = () => fetchPosts();
    window.addEventListener('marketing-posts-updated', handleUpdate);
    return () => window.removeEventListener('marketing-posts-updated', handleUpdate);
  }, []);

  const counts = {
    all: posts.length,
    draft: posts.filter((p) => p.status === 'draft').length,
    approved: posts.filter((p) => p.status === 'approved' && !p.scheduled_at).length,
    scheduled: posts.filter((p) => (p.status === 'approved' || p.status === 'scheduled') && p.scheduled_at).length,
    published: posts.filter((p) => p.status === 'published').length,
    failed: posts.filter((p) => p.status === 'failed').length,
  };

  const filteredPosts = posts.filter((post) => {
    if (selectedStatus === 'draft' && post.status !== 'draft') return false;
    if (selectedStatus === 'approved' && (post.status !== 'approved' || post.scheduled_at)) return false;
    if (selectedStatus === 'scheduled' && (!post.scheduled_at || (post.status !== 'approved' && post.status !== 'scheduled'))) return false;
    if (selectedStatus === 'published' && post.status !== 'published') return false;
    if (selectedStatus === 'failed' && post.status !== 'failed') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCaption = post.caption.toLowerCase().includes(q);
      const matchTitle = (post.property_snapshot?.title || '').toLowerCase().includes(q);
      const matchNeigh = (post.property_snapshot?.neighborhood || '').toLowerCase().includes(q);
      return matchCaption || matchTitle || matchNeigh;
    }
    return true;
  });

  const handleCreateNew = () => {
    if (properties.length === 0) {
      alert('Cadastre um imóvel primeiro para poder criar posts.');
      return;
    }
    setIsPropertyPickerOpen(true);
  };

  const handleSelectPropertyToCreate = (prop: Property) => {
    setSelectedPropertyForNew(prop);
    setEditingPost(null);
    setIsPropertyPickerOpen(false);
    setIsEditorOpen(true);
  };

  const handleEditPost = (post: MarketingPost) => {
    const snap = post.property_snapshot || {};
    const hasSnapshot = Boolean(post.property_snapshot && Object.keys(post.property_snapshot).length > 0);
    const live = properties.find((p) => p.id === post.listing_id);

    // Prioridade estrita para o SNAPSHOT congelado se existir (Criterion 10)
    const propertyForEditor = hasSnapshot
      ? {
          ...(live || {}),
          id: post.listing_id || 'mock-id',
          type: (snap as any).type || live?.type || ('Apartamento' as any),
          title: snap.title || live?.title || 'Imóvel',
          price: snap.price ?? live?.price ?? 0,
          neighborhood: snap.neighborhood || live?.neighborhood || 'Fortaleza',
          bedrooms: snap.bedrooms ?? live?.bedrooms ?? 0,
          suites: snap.suites ?? live?.suites ?? 0,
          bathrooms: snap.bathrooms ?? live?.bathrooms ?? 0,
          parking_spaces: snap.parking_spaces ?? live?.parking_spaces ?? 0,
          area_m2: snap.area_m2 ?? live?.area_m2 ?? 0,
          notes: snap.notes ?? live?.notes ?? '',
          photos:
            snap.photos && snap.photos.length > 0
              ? snap.photos
              : (post.media_urls || []).map((url, idx) => ({
                  id: `photo-${idx}`,
                  property_id: post.listing_id || '',
                  storage_path: url,
                  sort_order: idx,
                  is_cover: idx === 0,
                })),
        }
      : live || {
          id: post.listing_id || 'mock-id',
          type: 'Apartamento' as any,
          neighborhood: 'Fortaleza',
          bedrooms: 0,
          suites: 0,
          bathrooms: 0,
          parking_spaces: 0,
          area_m2: 0,
          price: 0,
          notes: '',
          photos: [],
          title: 'Imóvel',
        };

    setSelectedPropertyForNew(propertyForEditor as any);
    setEditingPost(post);
    setIsEditorOpen(true);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Deseja realmente excluir este post?')) return;
    try {
      await deleteMarketingPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  };

  const handlePublishNow = async (post: MarketingPost) => {
    if (!post.id) return;
    if (!confirm('Deseja publicar este post no Instagram agora?')) return;
    setActionInProgress(post.id);
    try {
      const res = await publishMarketingPostNow(post);
      if (res.success) {
        alert('Publicado com sucesso no Instagram!');
        fetchPosts();
      } else {
        alert(`Falha na publicação: ${res.error}`);
        fetchPosts();
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const getStatusBadge = (post: MarketingPost) => {
    switch (post.status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-ink-secondary border border-white/10">
            <FileText className="w-3 h-3" />
            Rascunho
          </span>
        );
      case 'approved':
        if (post.scheduled_at) {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              <Clock className="w-3 h-3" />
              Programado
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Aprovado
          </span>
        );
      case 'published':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Publicado
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
            <AlertTriangle className="w-3 h-3" />
            Falha
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in overflow-hidden">
      {/* ── Topo: Título & Ações Principais ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-ink-primary flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 text-white shadow-md">
              <InstagramIcon className="w-4 h-4" />
            </div>
            Piloto Automático · Instagram
          </h2>
          <p className="text-xs text-ink-secondary">
            Gestão operacional de conteúdo: rascunhos, aprovações, fila e publicações automáticas
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={fetchPosts}
            className="p-2 rounded-xl bg-white/5 border border-line-subtle text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleCreateNew}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 text-white text-xs font-bold shadow-lg shadow-pink-500/20 hover:opacity-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Novo Post</span>
          </button>
        </div>
      </div>

      {/* ── Banner de Alerta de Conexão / Expiração do Instagram ── */}
      {igAccount && igAccount.status === 'connected' && igAccount.token_expires_at && (() => {
        const expiresAt = new Date(igAccount.token_expires_at);
        const now = new Date();
        const diffMs = expiresAt.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const expiresFormatted = expiresAt.toLocaleDateString('pt-BR', {
          day: '2-digit', month: 'long', year: 'numeric',
        });

        if (diffDays <= 0) {
          return (
            <div className="p-3.5 rounded-xl border bg-status-danger/10 border-status-danger/30 text-status-danger flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs">
                  <strong>Token do Instagram expirado em {expiresFormatted}.</strong> O Piloto Automático está pausado até você reconectar.
                </p>
              </div>
              <a
                href="/?tab=settings"
                className="px-3 py-1 rounded-lg bg-status-danger/20 hover:bg-status-danger/30 border border-status-danger/40 text-xs font-bold transition-colors whitespace-nowrap"
              >
                Reconectar nas Configurações
              </a>
            </div>
          );
        }

        if (diffDays <= 7) {
          return (
            <div className="p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs">
                  <strong>Atenção:</strong> A autorização do Instagram (@{igAccount.instagram_username}) expira em {diffDays} {diffDays === 1 ? 'dia' : 'dias'} ({expiresFormatted}).
                </p>
              </div>
              <a
                href="/?tab=settings"
                className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold transition-colors whitespace-nowrap"
              >
                Renovar nas Configurações
              </a>
            </div>
          );
        }

        return null;
      })()}

      {/* ── Barra de Filtros por Status & Busca ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0">
        {/* Status Pill Filters */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl pill-surface overflow-x-auto">
          {[
            { id: 'all', label: 'Todos', count: counts.all },
            { id: 'draft', label: 'Rascunhos', count: counts.draft },
            { id: 'approved', label: 'Aprovados', count: counts.approved },
            { id: 'scheduled', label: 'Programados', count: counts.scheduled },
            { id: 'published', label: 'Publicados', count: counts.published },
            { id: 'failed', label: 'Falhas', count: counts.failed },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                selectedStatus === tab.id
                  ? 'bg-accent-soft text-accent border border-accent/40'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedStatus === tab.id
                    ? 'bg-accent text-white'
                    : 'bg-white/10 text-ink-tertiary'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-ink-tertiary absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por legenda, bairro..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-surface-subtle border border-line-subtle text-xs text-ink-primary placeholder-ink-tertiary focus:border-accent outline-none"
          />
        </div>
      </div>

      {/* ── Grid de Posts ── */}
      <div className="flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center text-ink-tertiary">
            <RefreshCw className="w-8 h-8 animate-spin text-accent mb-2" />
            <span className="text-xs">Carregando fila de publicações...</span>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="h-72 rounded-3xl border border-dashed border-line-subtle flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-ink-tertiary">
              <InstagramIcon className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink-primary">Nenhum post encontrado</h4>
              <p className="text-xs text-ink-secondary max-w-sm mt-1">
                {selectedStatus === 'all'
                  ? 'Você ainda não possui publicações criadas. Gere sua primeira legenda a partir de um imóvel cadastrado!'
                  : `Nenhum post com o status "${selectedStatus}" no momento.`}
              </p>
            </div>
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-soft text-accent border border-accent/40 text-xs font-bold hover:bg-accent/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Criar Primeiro Post
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="panel-surface rounded-2xl p-4 flex flex-col justify-between space-y-3 border border-line-subtle hover:border-accent/40 transition-all group"
              >
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0 border border-white/10">
                      {post.cover_url ? (
                        <img
                          src={post.cover_url}
                          alt="Capa"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-ink-tertiary">
                          Sem foto
                        </div>
                      )}
                      {post.post_type === 'carousel' && (
                        <div className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-black/70 text-white">
                          <Layers className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-ink-primary truncate">
                        {post.property_snapshot?.title || 'Imóvel'}
                      </h4>
                      <p className="text-[11px] text-ink-secondary truncate">
                        {post.property_snapshot?.neighborhood || 'Fortaleza'} ·{' '}
                        {post.property_snapshot?.price
                          ? `R$ ${post.property_snapshot.price.toLocaleString('pt-BR')}`
                          : 'Sob consulta'}
                      </p>
                    </div>
                  </div>

                  {getStatusBadge(post)}
                </div>

                {/* Snippet da Legenda */}
                <div className="p-3 rounded-xl bg-surface-subtle border border-line-subtle text-xs text-ink-secondary leading-relaxed line-clamp-3">
                  {post.caption || 'Sem legenda'}
                </div>

                {/* Agendamento / Erro se houver */}
                {post.scheduled_at && (
                  <div className="flex items-center gap-1.5 text-[11px] text-purple-300 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(post.scheduled_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}

                {post.status === 'failed' && post.last_error && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
                    <span className="font-bold">Erro:</span> {post.last_error}
                  </div>
                )}

                {/* Rodapé de Ações */}
                <div className="flex items-center justify-between pt-2 border-t border-line-subtle">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleEditPost(post)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-ink-secondary hover:text-ink-primary transition-colors"
                      title="Editar Post"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => post.id && handleDelete(post.id)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-ink-secondary hover:text-red-400 transition-colors"
                      title="Excluir Post"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {post.status !== 'published' && (
                    <button
                      onClick={() => handlePublishNow(post)}
                      disabled={actionInProgress === post.id}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 text-white font-semibold text-xs shadow hover:opacity-95 transition-all disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      {actionInProgress === post.id ? 'Publicando...' : 'Publicar Agora'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal de Seleção de Imóvel para Criar Post ── */}
      {isPropertyPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-line-strong p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink-primary">
                  Selecione o Imóvel para a Publicação
                </h3>
                <p className="text-xs text-ink-secondary">
                  A IA usará os dados objetivos, fotos e o campo Observações deste imóvel
                </p>
              </div>
              <button
                onClick={() => setIsPropertyPickerOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-ink-tertiary"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {properties.map((prop) => (
                <div
                  key={prop.id}
                  onClick={() => handleSelectPropertyToCreate(prop)}
                  className="p-3 rounded-2xl bg-white/[0.03] hover:bg-accent-soft hover:border-accent/40 border border-line-subtle cursor-pointer transition-all flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0">
                    {prop.photos && prop.photos[0] ? (
                      <img
                        src={typeof prop.photos[0] === 'string' ? prop.photos[0] : (prop.photos[0] as any).storage_path}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-ink-tertiary">
                        Sem foto
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-ink-primary truncate">
                      {prop.type} · {prop.neighborhood}
                    </h4>
                    <p className="text-[11px] text-ink-secondary truncate">
                      {prop.area_m2}m² · R$ {prop.price.toLocaleString('pt-BR')}
                    </p>
                    {prop.notes && (
                      <p className="text-[10px] text-accent truncate mt-0.5">
                        Obs: {prop.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Post Studio ── */}
      {isEditorOpen && selectedPropertyForNew && (
        <PostEditorModal
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingPost(null);
          }}
          property={selectedPropertyForNew}
          existingPost={editingPost}
          onSaved={() => {
            fetchPosts();
          }}
        />
      )}
    </div>
  );
};
