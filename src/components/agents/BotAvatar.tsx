import type { BotAvatarName } from '../../lib/central-bots';

export function BotAvatar({
  name,
  size = 40,
}: {
  name: BotAvatarName;
  size?: number;
}) {
  if (name === 'marketing') return (
    <span className="agent-marketing-avatar" aria-hidden="true" style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" width={size} height={size} fill="none">
        <circle cx="24" cy="24" r="23" fill="#30271d" stroke="#bfa575" />
        <path d="M24 9v5m-3-5h6" stroke="#d5bb89" strokeWidth="2" strokeLinecap="round" />
        <rect x="12" y="15" width="24" height="21" rx="8" fill="#6f593a" stroke="#e2c99a" strokeWidth="1.5" />
        <rect x="16" y="20" width="16" height="8" rx="4" fill="#201d18" />
        <circle cx="20" cy="24" r="2" fill="#e9d5ab" /><circle cx="28" cy="24" r="2" fill="#e9d5ab" />
        <path d="M21 32h6m-19-9v5m32-5v5" stroke="#e2c99a" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
  const index = [
    'gestor',
    'captador',
    'sentinela',
    'jade',
    'coral',
    'silver',
  ].indexOf(name);
  return (
    <span
      aria-hidden="true"
      className="agent-avatar"
      style={{
        width: size,
        height: size,
        backgroundPosition: `${(Math.max(0, index) % 3) * 50}% ${index < 3 ? 12 : 88}%`,
      }}
    />
  );
}
