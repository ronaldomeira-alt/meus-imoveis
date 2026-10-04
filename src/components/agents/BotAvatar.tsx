import type { BotAvatarName } from '../../lib/central-bots';

const colors: Record<BotAvatarName, string> = {
  gestor: '#b9d4ca', captador: '#c99a68', sentinela: '#f0f0ee',
  marketing: '#e3c581', jade: '#96c9ae', coral: '#e6a49b', silver: '#c6cbd3',
};

// A transparent vector silhouette: the face and surrounding space stay open.
export function BotAvatar({ name, size = 40 }: { name: BotAvatarName; size?: number }) {
  return (
    <span className="agent-avatar" aria-hidden="true" style={{ width: size, height: size, color: colors[name] || colors.silver }}>
      <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none">
        <path d="M32 12v8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx="32" cy="9" r="3.5" fill="currentColor" />
        <rect x="11" y="21" width="42" height="32" rx="14" stroke="currentColor" strokeWidth="5" />
        <path d="M7 32v10m50-10v10" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <rect x="23" y="32" width="4.5" height="8" rx="2.25" fill="currentColor" />
        <rect x="36.5" y="32" width="4.5" height="8" rx="2.25" fill="currentColor" />
      </svg>
    </span>
  );
}
