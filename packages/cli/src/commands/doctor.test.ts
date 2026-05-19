import { describe, it, expect } from 'vitest';
import { runChecks } from './doctor.js';

describe('runChecks', () => {
  it('returns a failed check when WORM_TOOL_PRIVATE_KEY is missing', async () => {
    const oldKey = process.env['WORM_TOOL_PRIVATE_KEY'];
    delete process.env['WORM_TOOL_PRIVATE_KEY'];
    const results = await runChecks({ root: process.cwd(), skipManifest: true, skipToolchain: true });
    if (oldKey !== undefined) process.env['WORM_TOOL_PRIVATE_KEY'] = oldKey;
    const keyCheck = results.find(r => r.check === 'private-key');
    expect(keyCheck?.passed).toBe(false);
  });

  it('returns a failed check for invalid key format', async () => {
    const oldKey = process.env['WORM_TOOL_PRIVATE_KEY'];
    process.env['WORM_TOOL_PRIVATE_KEY'] = 'not-a-key';
    const results = await runChecks({ root: process.cwd(), skipManifest: true, skipToolchain: true });
    if (oldKey !== undefined) {
      process.env['WORM_TOOL_PRIVATE_KEY'] = oldKey;
    } else {
      delete process.env['WORM_TOOL_PRIVATE_KEY'];
    }
    const keyCheck = results.find(r => r.check === 'private-key');
    expect(keyCheck?.passed).toBe(false);
  });

  it('passes key check when valid key is set', async () => {
    const oldKey = process.env['WORM_TOOL_PRIVATE_KEY'];
    process.env['WORM_TOOL_PRIVATE_KEY'] = '0x' + 'a'.repeat(64);
    const results = await runChecks({ root: process.cwd(), skipManifest: true, skipToolchain: true });
    if (oldKey !== undefined) {
      process.env['WORM_TOOL_PRIVATE_KEY'] = oldKey;
    } else {
      delete process.env['WORM_TOOL_PRIVATE_KEY'];
    }
    const keyCheck = results.find(r => r.check === 'private-key');
    expect(keyCheck?.passed).toBe(true);
  });
});
