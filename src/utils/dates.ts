export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localDayRange(date: string): [string, string] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid report date');
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  if (localDateString(start) !== date) throw new Error('Invalid report date');
  return [start.toISOString(), new Date(year, month - 1, day + 1).toISOString()];
}

export function localMonthRange(year: number, month: number): [string, string] {
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid report month');
  return [new Date(year, month - 1, 1).toISOString(), new Date(year, month, 1).toISOString()];
}
