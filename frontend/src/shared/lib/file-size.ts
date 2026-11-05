const UNITS = ['B', 'KB', 'MB', 'GB'] as const;
const format = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

/** "512 B", "1,2 KB", "3,4 MB": 1024-based, one decimal at most. */
export function formatFileSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${format.format(unit === 0 ? Math.round(value) : value)} ${UNITS[unit]}`;
}
