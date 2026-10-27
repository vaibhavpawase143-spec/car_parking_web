/**
 * RFC-4180 Compliant CSV Formatter with UTF-8 BOM
 * Guarantees proper rendering of Currency symbols and non-ASCII text in MS Excel
 */
export function formatCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCsv).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsv).join(','));

  // Prepend UTF-8 BOM
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}

/**
 * Triggers client-side browser file download for CSV content
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
