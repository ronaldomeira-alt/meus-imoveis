const BRASILIA_TZ = 'America/Sao_Paulo';

const WEEKDAY_EN_TO_PT: Record<string, string> = {
  Sun: 'DOM', Mon: 'SEG', Tue: 'TER', Wed: 'QUA', Thu: 'QUI', Fri: 'SEX', Sat: 'SÁB',
};

const MONTHS_PT = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

export interface BrasiliaNow {
  dateLabel: string;
  greeting: string;
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BRASILIA_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  hour: 'numeric',
  hour12: false,
});

export function getBrasiliaNow(date: Date = new Date()): BrasiliaNow {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';

  const weekday = WEEKDAY_EN_TO_PT[get('weekday')] ?? get('weekday').toUpperCase();
  const day = get('day');
  const month = MONTHS_PT[Number(get('month')) - 1] ?? '';

  // Alguns engines retornam "24" para meia-noite com hour12:false.
  const hour = Number(get('hour')) % 24;

  let greeting: string;
  if (hour >= 5 && hour < 12) greeting = 'Bom dia';
  else if (hour >= 12 && hour < 18) greeting = 'Boa tarde';
  else if (hour >= 18) greeting = 'Boa noite';
  else greeting = 'Boa madrugada';

  return {
    dateLabel: `${weekday}, ${day} DE ${month}`,
    greeting,
  };
}
