interface AudioWaveformProps {
  variant?: 'compact' | 'wide';
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({ variant = 'compact' }) => {
  const heights = [8, 13, 19, 11, 24, 16, 29, 18, 11, 22, 31, 16, 25, 12, 28, 19, 10, 23, 15, 27, 18, 12, 21, 9, 17, 27, 14, 22, 10, 30, 18, 12, 25, 16, 29, 11, 20, 14, 26, 18, 9, 23, 15, 28, 17, 12, 21, 8];
  const wide = variant === 'wide';

  return (
    <div
      aria-hidden="true"
      className={`relative flex min-w-0 items-center overflow-hidden ${wide ? 'h-10 flex-1' : 'h-7 w-[112px]'}`}
      style={{ maskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)' }}
    >
      <div className={`flex h-full w-full items-center justify-center ${wide ? 'gap-[3px]' : 'gap-[2px]'}`}>
        {heights.map((height, index) => (
          <span
            key={index}
            className={`${wide ? 'w-[3px] bg-ink-secondary/80 animate-waveform-wide' : 'w-[2px] bg-status-danger/80 animate-waveform'} rounded-full`}
            style={{ height: `${height * (wide ? 1.15 : 0.72)}px`, animationDelay: `${index * -0.07}s` }}
          />
        ))}
      </div>
    </div>
  );
};
