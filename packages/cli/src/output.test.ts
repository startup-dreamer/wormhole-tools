import { describe, it, expect } from 'vitest';
import { formatTable } from './output.js';

describe('formatTable', () => {
  it('aligns columns to max content width', () => {
    const result = formatTable(
      ['Name', 'Value'],
      [['foo', '1'], ['longname', '42']],
    );
    const lines = result.split('\n');
    // header
    expect(lines[0]).toBe('Name      Value');
    // separator
    expect(lines[1]).toBe('──────────────────');
    // row 1 — 'foo' padded to length of 'longname' (8)
    expect(lines[2]).toBe('foo       1    ');
    // row 2
    expect(lines[3]).toBe('longname  42   ');
  });

  it('returns "No results." line for empty rows', () => {
    const result = formatTable(['A', 'B'], []);
    expect(result).toBe('No results.');
  });

  it('handles single column', () => {
    const result = formatTable(['Chain'], [['ethereum'], ['sepolia']]);
    expect(result).toContain('ethereum');
    expect(result).toContain('sepolia');
  });
});
