import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ExternalLink, LoaderCircle, Share2, Smartphone, X } from 'lucide-react';
import type { Property } from '../../types/property';
import { getPublicPageUrl, getSavedPublicAdminToken, setPublicPage } from '../../lib/publicProperties';

interface PropertyShareMenuProps {
  property: Property;
  onUpdate: (next: Property) => void;
}

export const PropertyShareMenu: React.FC<PropertyShareMenuProps> = ({ property, onUpdate }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [token, setToken] = useState(getSavedPublicAdminToken);
  const [needsToken, setNeedsToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = Boolean(property.public_page_active && property.public_page_id);
  const url = property.public_page_id ? getPublicPageUrl(property.public_page_id) : '';

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (window.innerWidth < 640) return;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: Math.min(rect.bottom + 8, window.innerHeight - 330), left: Math.max(12, Math.min(rect.right - 288, window.innerWidth - 300)) });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); };
  }, [open]);

  const toggleActive = async () => {
    if (!active && property.status !== 'Ativo') { setMessage('Somente imóveis ativos podem ser publicados.'); return; }
    if (!token.trim()) { setNeedsToken(true); setMessage(''); return; }
    setBusy(true); setMessage('');
    try {
      const result = await setPublicPage(property, !active, token.trim());
      onUpdate({ ...property, public_page_id: result.id, public_page_active: result.active });
      setNeedsToken(false);
      setMessage(result.active ? 'Página pública ativada.' : 'Página pública desativada.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Não foi possível salvar.';
      if (text.includes('Token administrativo')) setNeedsToken(true);
      setMessage(text);
    } finally { setBusy(false); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado.'); }
    catch { setMessage('Não foi possível copiar o link neste navegador.'); }
  };

  const shareNative = async () => {
    if (!navigator.share) { setMessage('O compartilhamento nativo não está disponível neste dispositivo.'); return; }
    try { await navigator.share({ title: property.title || `${property.type} no ${property.neighborhood}`, text: `${property.type} no ${property.neighborhood}`, url }); }
    catch (error) { if (error instanceof Error && error.name !== 'AbortError') setMessage('Não foi possível abrir o compartilhamento.'); }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${property.type} no ${property.neighborhood} — ${url}`)}`;
  const openPage = () => window.open(url, '_blank', 'noopener,noreferrer');

  const row = (icon: React.ReactNode, label: string, action: () => void, disabled = false) => (
    <button type="button" onClick={action} disabled={disabled} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-primary transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45">
      <span className="text-ink-secondary">{icon}</span><span>{label}</span>
    </button>
  );

  const menu = open ? createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/35 sm:bg-transparent" onClick={(event) => { event.stopPropagation(); setOpen(false); }} />
      <section onClick={(event) => event.stopPropagation()} className="fixed inset-x-0 bottom-0 z-[101] rounded-t-2xl border border-line-strong bg-[#11141b] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:w-72 sm:rounded-xl sm:p-3" style={window.innerWidth >= 640 ? { top: position.top, left: position.left } : undefined} aria-label="Compartilhar imóvel">
        <div className="mb-2 flex items-center justify-between px-2 sm:hidden"><b className="text-sm">Compartilhar imóvel</b><button type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
        {active ? <>
          {typeof navigator.share === 'function' && row(<Smartphone className="h-4 w-4" />, 'Compartilhar…', shareNative)}
          {row(<Share2 className="h-4 w-4" />, 'Enviar pelo WhatsApp', () => window.open(whatsappUrl, '_blank', 'noopener,noreferrer'))}
          {row(<Copy className="h-4 w-4" />, 'Copiar link', () => void copyLink())}
          {row(<ExternalLink className="h-4 w-4" />, 'Visualizar página pública', openPage)}
        </> : <p className="px-3 py-2 text-xs leading-relaxed text-ink-secondary">Ative a página pública para habilitar o compartilhamento seguro deste imóvel.</p>}
        <div className="my-2 border-t border-line-subtle" />
        {needsToken && <div className="px-2 pb-2"><label htmlFor={`publish-token-${property.id}`} className="mb-1 block text-xs text-ink-secondary">Token para publicar com segurança</label><input id={`publish-token-${property.id}`} type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" placeholder="Token administrativo" className="w-full rounded-lg border border-line-strong bg-black/20 px-3 py-2 text-xs text-ink-primary outline-none focus:border-accent" /></div>}
        {row(busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />, busy ? 'Salvando…' : active ? 'Desativar página pública' : 'Ativar página pública', () => void toggleActive(), busy)}
        {message && <p role="status" className="px-3 pt-1 text-xs text-ink-secondary">{message}</p>}
      </section>
    </>, document.body,
  ) : null;

  return <>
    <button ref={buttonRef} type="button" aria-label="Compartilhar imóvel" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setMessage(''); setOpen((value) => !value); }} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-black/55 text-ink-primary/80 transition-colors hover:bg-accent hover:text-white">
      <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
    {menu}
  </>;
};
