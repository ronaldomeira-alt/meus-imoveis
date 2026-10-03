import type { BotAvatarName } from '../../lib/central-bots';

export function BotAvatar({
  name,
  size = 40,
}: {
  name: BotAvatarName;
  size?: number;
}) {
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
