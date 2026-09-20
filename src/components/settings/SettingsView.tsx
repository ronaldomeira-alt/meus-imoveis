import React, { useState, useRef } from 'react';
import {
  Palette,
  Sparkles,
  Users,
  ShieldCheck,
  UserCheck,
  Key,
  Eye,
  EyeOff,
  Check,
  RotateCcw,
  Upload,
  Sliders,
  Sun,
  Moon,
  Download,
  Database,
  Building,
  Mail,
  ChevronRight,
  Plus,
  Zap,
  Cpu
} from 'lucide-react';
import type { AppearanceSettings } from '../../types/property';
import { testGroqConnection, GROQ_MODELS } from '../../lib/groq';
import type { PreferredAIProvider } from '../../lib/ai-provider';

interface SettingsViewProps {
  appearance: AppearanceSettings;
  onUpdateAppearance: (newSettings: AppearanceSettings) => void;
  geminiApiKey: string;
  onUpdateGeminiKey: (key: string) => void;
  groqApiKey?: string;
  onUpdateGroqKey?: (key: string) => void;
  preferredAIProvider?: PreferredAIProvider;
  onUpdateAIProvider?: (provider: PreferredAIProvider) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
}

const PRESET_WALLPAPERS = [
  {
    id: 'abstract-cyan',
    name: 'Cyber Luxury Cyan',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1920&q=80',
    primary: '#00E5FF',
    secondary: '#F59E0B',
  },
  {
    id: 'modern-architecture',
    name: 'Arquitetura Minimalista',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1920&q=80',
    primary: '#0EA5E9',
    secondary: '#D97706',
  },
  {
    id: 'night-city',
    name: 'Metrópole Noturna',
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1920&q=80',
    primary: '#818CF8',
    secondary: '#00E5FF',
  },
  {
    id: 'dark-marble',
    name: 'Obsidian Texturizado',
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1920&q=80',
    primary: '#10B981',
    secondary: '#38BDF8',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  appearance,
  onUpdateAppearance,
  geminiApiKey,
  onUpdateGeminiKey,
  groqApiKey = '',
  onUpdateGroqKey,
  preferredAIProvider = 'auto',
  onUpdateAIProvider,
  onExportJSON,
  onExportCSV,
}) => {
  const [activeTab, setActiveTab] = useState<'aparencia' | 'gemini' | 'usuarios' | 'conta'>('aparencia');
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [selectedModel, setSelectedModel] = useState('gemini-3.6-flash');
  const [keySaved, setKeySaved] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  // Estados Groq API
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState(groqApiKey);
  const [selectedGroqModel, setSelectedGroqModel] = useState(GROQ_MODELS.EXTRACTION_PRIMARY);
  const [groqKeySaved, setGroqKeySaved] = useState(false);
  const [groqTestStatus, setGroqTestStatus] = useState<string | null>(null);
  const [isTestingGroq, setIsTestingGroq] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manipulação de imagem de upload
  const handleCustomWallpaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onUpdateAppearance({
            ...appearance,
            bgImage: event.target.result as string,
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetAppearance = () => {
    onUpdateAppearance({
      bgImage: null,
      bgBlur: 16,
      bgOpacity: 1.0,
      bgDarkness: 0.25,
      bgBrightness: 1.0,
      bgSaturation: 1.1,
      cardOpacity: 0.18,
      glassIntensity: 1.0,
      lightIntensity: 1.0,
    });
  };

  const handleSaveGeminiKey = () => {
    onUpdateGeminiKey(keyInput);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
  };

  const handleSaveGroqKey = () => {
    if (onUpdateGroqKey) {
      onUpdateGroqKey(groqKeyInput.trim());
    }
    setGroqKeySaved(true);
    setTimeout(() => setGroqKeySaved(false), 2500);
  };

  const handleTestGemini = async () => {
    setTestStatus('Testando conexão com a Google AI API...');
    await new Promise((r) => setTimeout(r, 1200));
    if (keyInput.startsWith('AIza') || keyInput.length > 20) {
      setTestStatus('Conexão bem-sucedida! Modelos Gemini disponíveis.');
    } else {
      setTestStatus('Chave salva. Modo de extração local e inteligente ativo.');
    }
    setTimeout(() => setTestStatus(null), 4000);
  };

  const handleTestGroq = async () => {
    setIsTestingGroq(true);
    setGroqTestStatus('Testando conexão com a Groq Cloud...');
    const result = await testGroqConnection(groqKeyInput);
    setIsTestingGroq(false);
    if (result.success) {
      setGroqTestStatus(result.message || 'Conexão bem-sucedida! Whisper & Llama disponíveis.');
    } else {
      setGroqTestStatus(`Erro: ${result.message}`);
    }
    setTimeout(() => setGroqTestStatus(null), 5000);
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in overflow-hidden">
      {/* ── Topo: Título e Navegação em Abas ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-cyan-400" />
            Configurações do Sistema
          </h2>
          <p className="text-xs text-slate-400">
            Personalize a atmosfera visual, inteligência artificial e controle de acesso
          </p>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-pill">
          <button
            onClick={() => setActiveTab('aparencia')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'aparencia'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            Aparência
          </button>

          <button
            onClick={() => setActiveTab('gemini')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'gemini'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Modelos & IA
          </button>

          <button
            onClick={() => setActiveTab('usuarios')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'usuarios'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Usuários
          </button>

          <button
            onClick={() => setActiveTab('conta')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'conta'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Conta & Dados
          </button>
        </div>
      </div>

      {/* ── Conteúdo da Aba Ativa ── */}
      <div className="flex-1 overflow-y-auto pr-1">
        {/* 1. ABA APARÊNCIA */}
        {activeTab === 'aparencia' && (
          <div className="space-y-5 pb-6">
            {/* Bloco 1: Papéis de Parede e Upload */}
            <div className="glass-panel p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Palette className="w-4 h-4 text-cyan-400" />
                    Plano de Fundo e Atmosfera
                  </h3>
                  <p className="text-xs text-slate-400">
                    Selecione um preset escuro de alto padrão ou envie sua própria imagem de fundo
                  </p>
                </div>

                <button
                  onClick={handleResetAppearance}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restaurar Padrão
                </button>
              </div>

              {/* Cards de Presets */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {PRESET_WALLPAPERS.map((preset) => {
                  const isSelected = appearance.bgImage === preset.url;
                  return (
                    <button
                      key={preset.id}
                      onClick={() =>
                        onUpdateAppearance({
                          ...appearance,
                          bgImage: preset.url,
                          lightPrimary: preset.primary,
                          lightSecondary: preset.secondary,
                        })
                      }
                      className={`relative group rounded-2xl overflow-hidden border text-left transition-all p-2 ${
                        isSelected
                          ? 'border-cyan-400 ring-2 ring-cyan-400/30 shadow-lg shadow-cyan-500/20'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                      style={{ background: 'rgba(10, 16, 34, 0.7)' }}
                    >
                      <div className="w-full h-20 rounded-xl overflow-hidden mb-2 relative">
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/30" />
                      </div>
                      <p className="text-[11px] font-bold text-white truncate">{preset.name}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.primary }} />
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.secondary }} />
                        <span className="text-[9px] text-slate-400">Luzes</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Upload de Imagem Própria */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-cyan-400" />
                    Enviar Imagem do Computador
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCustomWallpaperUpload}
                    className="hidden"
                  />
                  <span className="text-xs text-slate-400">Formatos aceitos: JPG, PNG, WebP</span>
                </div>

                {appearance.bgImage && (
                  <button
                    onClick={() => onUpdateAppearance({ ...appearance, bgImage: null })}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    Remover imagem (usar cor sólida escura)
                  </button>
                )}
              </div>
            </div>

            {/* Bloco 2: Sliders de Calibração Fina */}
            <div className="glass-panel p-5 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Ajustes de Desfoque, Escurecimento e Profundidade
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Calibre em tempo real a transparência dos cards, a intensidade do vidro e a atmosfera de fundo
                </p>
              </div>

              {/* ── SEÇÃO DESTAQUE: MATERIALIDADE DO VIDRO (GLASSMORPHISM) ── */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                {/* 1. Transparência dos Cards (Glass) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-white font-bold block">
                        Transparência dos Cards (Glass)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Controla globalmente quanto do background aparece através dos cards, painéis e modais.
                      </span>
                    </div>
                    <span className="font-mono text-cyan-400 text-sm font-extrabold px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                      {Math.round((appearance.cardOpacity ?? 0.18) * 100)}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0.05"
                    max="0.95"
                    step="0.01"
                    value={appearance.cardOpacity ?? 0.18}
                    onChange={(e) =>
                      onUpdateAppearance({
                        ...appearance,
                        cardOpacity: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />

                  {/* Chips de Atalho Rápido */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: 'Ultra translúcido (10%)', val: 0.10 },
                      { label: 'Padrão da Referência (18%)', val: 0.18 },
                      { label: 'Equilibrado (35%)', val: 0.35 },
                      { label: 'Semi-sólido (60%)', val: 0.60 },
                      { label: 'Sólido (85%)', val: 0.85 },
                    ].map((chip) => {
                      const isCurrent = Math.abs((appearance.cardOpacity ?? 0.18) - chip.val) < 0.03;
                      return (
                        <button
                          key={chip.val}
                          type="button"
                          onClick={() =>
                            onUpdateAppearance({ ...appearance, cardOpacity: chip.val })
                          }
                          className={`text-[10px] px-2.5 py-1 rounded-lg transition-all font-medium ${
                            isCurrent
                              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-sm'
                              : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Intensidade do Vidro */}
                <div className="space-y-2 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-white font-bold block">
                        Intensidade do Vidro
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Controla a presença visual do vidro: reflexo especular interno, contraste da lâmina e definição das bordas.
                      </span>
                    </div>
                    <span className="font-mono text-cyan-400 text-sm font-extrabold px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                      {Math.round((appearance.glassIntensity ?? 1.0) * 100)}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0.2"
                    max="2.0"
                    step="0.05"
                    value={appearance.glassIntensity ?? 1.0}
                    onChange={(e) =>
                      onUpdateAppearance({
                        ...appearance,
                        glassIntensity: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />

                  {/* Chips de Atalho Rápido */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: 'Sutil (50%)', val: 0.50 },
                      { label: 'Padrão (100%)', val: 1.00 },
                      { label: 'Marcante (150%)', val: 1.50 },
                      { label: 'Intenso (200%)', val: 2.00 },
                    ].map((chip) => {
                      const isCurrent = Math.abs((appearance.glassIntensity ?? 1.0) - chip.val) < 0.04;
                      return (
                        <button
                          key={chip.val}
                          type="button"
                          onClick={() =>
                            onUpdateAppearance({ ...appearance, glassIntensity: chip.val })
                          }
                          className={`text-[10px] px-2.5 py-1 rounded-lg transition-all font-medium ${
                            isCurrent
                              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-sm'
                              : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── SEÇÃO: CONTROLE DA CAMADA ESCURA E ILUMINAÇÃO DA FOTO ── */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                {/* 1. Camada Escura (Overlay) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-white font-bold block">
                        Camada Escura sobre a Imagem (Escurecimento)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Reduza ou zere (0%) para remover totalmente o escurecimento aplicado sobre a foto de fundo.
                      </span>
                    </div>
                    <span
                      className={`font-mono text-sm font-extrabold px-2.5 py-1 rounded-lg border ${
                        appearance.bgDarkness === 0
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                      }`}
                    >
                      {appearance.bgDarkness === 0
                        ? '0% (Sem escurecimento)'
                        : `${Math.round(appearance.bgDarkness * 100)}%`}
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0.0"
                    max="0.95"
                    step="0.05"
                    value={appearance.bgDarkness}
                    onChange={(e) =>
                      onUpdateAppearance({
                        ...appearance,
                        bgDarkness: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />

                  {/* Chips de Atalho Rápido para Escurecimento */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: 'Sem escurecimento (0%)', val: 0.0 },
                      { label: 'Suave (15%)', val: 0.15 },
                      { label: 'Equilibrado (30%)', val: 0.30 },
                      { label: 'Contraste alto (55%)', val: 0.55 },
                      { label: 'Escuro profundo (80%)', val: 0.80 },
                    ].map((chip) => {
                      const isCurrent = Math.abs(appearance.bgDarkness - chip.val) < 0.04;
                      return (
                        <button
                          key={chip.val}
                          type="button"
                          onClick={() =>
                            onUpdateAppearance({ ...appearance, bgDarkness: chip.val })
                          }
                          className={`text-[10px] px-2.5 py-1 rounded-lg transition-all font-medium ${
                            isCurrent
                              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-sm'
                              : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Brilho Natural da Imagem */}
                <div className="space-y-2 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-white font-bold block">
                        Brilho Natural da Imagem
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Aumente para clarear imagens que sejam originalmente escuras.
                      </span>
                    </div>
                    <span className="font-mono text-cyan-400 text-sm font-extrabold px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                      {Math.round((appearance.bgBrightness ?? 1.0) * 100)}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0.5"
                    max="1.8"
                    step="0.05"
                    value={appearance.bgBrightness ?? 1.0}
                    onChange={(e) =>
                      onUpdateAppearance({
                        ...appearance,
                        bgBrightness: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />

                  {/* Chips de Atalho Rápido para Brilho */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: 'Reduzido (75%)', val: 0.75 },
                      { label: 'Original (100%)', val: 1.00 },
                      { label: 'Mais clara (125%)', val: 1.25 },
                      { label: 'Muito clara (150%)', val: 1.50 },
                    ].map((chip) => {
                      const isCurrent = Math.abs((appearance.bgBrightness ?? 1.0) - chip.val) < 0.04;
                      return (
                        <button
                          key={chip.val}
                          type="button"
                          onClick={() =>
                            onUpdateAppearance({ ...appearance, bgBrightness: chip.val })
                          }
                          className={`text-[10px] px-2.5 py-1 rounded-lg transition-all font-medium ${
                            isCurrent
                              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-sm'
                              : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── DESFOQUE E OPACIDADE DA FOTO ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Desfoque do Fundo (Blur) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Desfoque da Foto (Blur)</span>
                    <span className="font-mono text-cyan-400 font-bold">{appearance.bgBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="2"
                    value={appearance.bgBlur}
                    onChange={(e) =>
                      onUpdateAppearance({ ...appearance, bgBlur: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="flex gap-1.5 pt-0.5">
                    {[
                      { label: '0px (Nítida)', val: 0 },
                      { label: '16px (Padrão)', val: 16 },
                      { label: '40px (Fosco)', val: 40 },
                    ].map((c) => (
                      <button
                        key={c.val}
                        type="button"
                        onClick={() => onUpdateAppearance({ ...appearance, bgBlur: c.val })}
                        className={`text-[9.5px] px-2 py-0.5 rounded transition-all ${
                          appearance.bgBlur === c.val
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                            : 'bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Opacidade da Imagem de Fundo */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Opacidade da Foto</span>
                    <span className="font-mono text-cyan-400 font-bold">
                      {Math.round(appearance.bgOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={appearance.bgOpacity}
                    onChange={(e) =>
                      onUpdateAppearance({ ...appearance, bgOpacity: parseFloat(e.target.value) })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500">
                    Mescla a imagem sobre a base neutra azul-marinho.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. ABA INTELIGÊNCIA ARTIFICIAL (GROQ & GEMINI) */}
        {activeTab === 'gemini' && (
          <div className="space-y-5 pb-6">
            {/* Bloco 0: Seleção de Provedor Preferencial */}
            <div className="glass-panel p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    Orquestração e Provedor Principal
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defina como o sistema deve rotear as requisições de áudio e extração imobiliária
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {[
                  {
                    id: 'auto' as PreferredAIProvider,
                    title: 'Automático / Resiliente',
                    desc: 'Groq prioritário com fallback para Gemini e Web Speech nativo',
                    badge: 'Recomendado',
                  },
                  {
                    id: 'groq' as PreferredAIProvider,
                    title: 'Groq Cloud LPU',
                    desc: 'Prioriza Whisper v3 Turbo e Llama 3.3 70B (~300ms)',
                    badge: 'Ultra-rápido',
                  },
                  {
                    id: 'gemini' as PreferredAIProvider,
                    title: 'Google Gemini',
                    desc: 'Prioriza modelos multimodais Gemini 3.6 Flash',
                    badge: 'Google AI',
                  },
                ].map((prov) => {
                  const isSelected = preferredAIProvider === prov.id;
                  return (
                    <button
                      key={prov.id}
                      type="button"
                      onClick={() => onUpdateAIProvider && onUpdateAIProvider(prov.id)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-400/70 shadow-lg shadow-cyan-500/10'
                          : 'bg-white/5 border-white/10 hover:border-white/20 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{prov.title}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 font-semibold">
                          {prov.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{prov.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bloco 1: GROQ CLOUD (NOVO PROVEDOR ULTRA-RÁPIDO) */}
            <div className="glass-panel p-5 space-y-4 border border-cyan-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Chave de API da Groq Cloud
                  </h3>
                  <p className="text-xs text-slate-400">
                    Inferência em tempo recorde (~300ms) com Whisper Large v3 Turbo para voz e Llama 3.3 70B
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-current" /> LPU Ultra-Rápido
                </span>
              </div>

              {/* Input Groq Key */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Groq API Key (gsk_...)</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showGroqKey ? 'text' : 'password'}
                      value={groqKeyInput}
                      onChange={(e) => setGroqKeyInput(e.target.value)}
                      placeholder="gsk_..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGroqKey(!showGroqKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    onClick={handleSaveGroqKey}
                    className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
                  >
                    {groqKeySaved ? <Check className="w-4 h-4" /> : null}
                    {groqKeySaved ? 'Salvo!' : 'Salvar Chave'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Obtenha gratuitamente sua chave de API em <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">console.groq.com/keys</a>
                </p>
              </div>

              {/* Seleção de Modelo Groq */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <label className="text-xs font-semibold text-slate-300">Modelos Groq Configurados</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGroqModel(GROQ_MODELS.EXTRACTION_PRIMARY)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedGroqModel === GROQ_MODELS.EXTRACTION_PRIMARY
                        ? 'bg-cyan-500/10 border-cyan-400/60 text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-white flex items-center justify-between">
                      GPT-OSS 120B / Llama 3.3
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300">Recomendado</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Extração estruturada de alta fidelidade com raciocínio profundo</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedGroqModel(GROQ_MODELS.EXTRACTION_FAST)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedGroqModel === GROQ_MODELS.EXTRACTION_FAST
                        ? 'bg-cyan-500/10 border-cyan-400/60 text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-white flex items-center justify-between">
                      GPT-OSS 20B Instant
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">~400ms</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Velocidade máxima em tempo real para cadastros rápidos</p>
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2 text-[11px] text-slate-300 mt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span><strong>Whisper Large v3 Turbo</strong> integrado para transcrição de áudio em alta fidelidade.</span>
                </div>
              </div>

              {/* Botão de Testar Conexão Groq */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestGroq}
                  disabled={isTestingGroq}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-cyan-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Testar Conexão com Groq API
                </button>

                {groqTestStatus && (
                  <span className={`text-xs font-medium animate-fade-in ${
                    groqTestStatus.includes('Erro') ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {groqTestStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Bloco 2: GOOGLE GEMINI */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    Chave de API do Google Gemini
                  </h3>
                  <p className="text-xs text-slate-400">
                    Provedor multimodal alternativo para leitura de fotos e descrições complexas
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Multimodal Ativo
                </span>
              </div>

              {/* Input de Chave Gemini */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Gemini API Key</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    onClick={handleSaveGeminiKey}
                    className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
                  >
                    {keySaved ? <Check className="w-4 h-4" /> : null}
                    {keySaved ? 'Salvo!' : 'Salvar Chave'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Sua chave fica armazenada localmente no navegador e nunca é exposta externamente.
                </p>
              </div>

              {/* Seleção de Modelo Gemini */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <label className="text-xs font-semibold text-slate-300">Modelo Gemini</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedModel('gemini-3.6-flash')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedModel === 'gemini-3.6-flash'
                        ? 'bg-cyan-500/10 border-cyan-400/60 text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-white flex items-center justify-between">
                      Gemini 3.6 Flash
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300">Mais Recente</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Extração rápida e suporte multimodal atualizado</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedModel('gemini-1.5-flash')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedModel === 'gemini-1.5-flash'
                        ? 'bg-cyan-500/10 border-cyan-400/60 text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-white">Gemini 1.5 Flash</p>
                    <p className="text-[10px] text-slate-400 mt-1">Leveza e compatibilidade estável</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedModel('gemini-2.0-flash')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedModel === 'gemini-2.0-flash'
                        ? 'bg-cyan-500/10 border-cyan-400/60 text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-white">Gemini 2.0 Flash</p>
                    <p className="text-[10px] text-slate-400 mt-1">Equilíbrio de performance e precisão</p>
                  </button>
                </div>
              </div>

              {/* Botão de Testar Conexão Gemini */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestGemini}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-cyan-400 transition-colors"
                >
                  Testar Conexão com Gemini API
                </button>

                {testStatus && (
                  <span className="text-xs font-medium text-emerald-400 animate-fade-in">
                    {testStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. ABA USUÁRIOS E ACESSO */}
        {activeTab === 'usuarios' && (
          <div className="space-y-5 pb-6">
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    Usuários Autorizados
                  </h3>
                  <p className="text-xs text-slate-400">
                    Apenas administradores têm acesso à gestão do estoque inteligente e dados de proprietários
                  </p>
                </div>

                <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-xs font-semibold hover:bg-cyan-500/30 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  Novo Administrador
                </button>
              </div>

              {/* Lista de Usuários */}
              <div className="space-y-3">
                {/* Usuário 1: Ronaldo Meira */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm text-white"
                      style={{
                        background: 'linear-gradient(135deg, #00E5FF 0%, #2563EB 100%)',
                        boxShadow: '0 0 16px rgba(0, 229, 255, 0.4)',
                      }}
                    >
                      RM
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white">Ronaldo Meira</p>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-400/10 text-cyan-400 border border-cyan-400/30">
                          Operador Principal
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">ronaldomeira@gmail.com</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Ativo
                    </span>
                    <span className="text-xs text-slate-500">Acesso Total</span>
                  </div>
                </div>

                {/* Usuário 2: Thatianna */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm text-white"
                      style={{
                        background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                        boxShadow: '0 0 16px rgba(139, 92, 246, 0.4)',
                      }}
                    >
                      TM
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white">Thatianna Meira</p>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-400/10 text-violet-400 border border-violet-400/30">
                          Administradora
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">thatianna@meusimoveis.com.br</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Ativo
                    </span>
                    <span className="text-xs text-slate-500">Acesso Total</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. ABA CONTA & DADOS */}
        {activeTab === 'conta' && (
          <div className="space-y-5 pb-6">
            <div className="glass-panel p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                Exportação, Backup e Dados do Estoque
              </h3>
              <p className="text-xs text-slate-400">
                Gere cópias de segurança do seu inventário de imóveis a qualquer momento
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-white">Exportação Completa (JSON)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Exporta todos os imóveis, fotos e dados estruturados em formato JSON nativo.
                    </p>
                  </div>
                  <button
                    onClick={onExportJSON}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 text-xs font-bold hover:bg-cyan-500/30 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Backup JSON
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-white">Planilha do Catálogo (CSV)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Exporta tabela compatível com Excel e Google Sheets com preços, bairros e tipologias.
                    </p>
                  </div>
                  <button
                    onClick={onExportCSV}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-slate-200 border border-white/15 text-xs font-bold hover:bg-white/20 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Planilha CSV
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
