/** Write value as pretty-printed JSON to stdout. */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

/** Write a diagnostic message to stderr. Does not exit. */
export function printError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? `: ${err.message}` : (err ? `: ${String(err)}` : '');
  process.stderr.write(`Error: ${message}${detail}\n`);
}

/** Format an N-column table with dynamic column widths. Returns "No results." when rows is empty. */
export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return 'No results.';
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const pad = (s: string, n: number) => s.padEnd(n);
  const sep = widths.map(w => '─'.repeat(w + 2)).join('─');
  const fmt = (row: string[]) => row.map((c, i) => pad(c, widths[i]!)).join('  ');
  return [fmt(headers), sep, ...rows.map(fmt)].join('\n');
}
