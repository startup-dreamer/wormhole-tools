/** Write value as pretty-printed JSON to stdout. */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

/** Write a diagnostic message to stderr. Does not exit. */
export function printError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? `: ${err.message}` : (err ? `: ${String(err)}` : '');
  process.stderr.write(`Error: ${message}${detail}\n`);
}
