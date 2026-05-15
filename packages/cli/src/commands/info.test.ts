import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerInfoCommand } from './info.js';

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  registerInfoCommand(p);
  return p;
}

/** Parse the first console.log call as JSON. */
function lastJson(): unknown {
  const mock = console.log as ReturnType<typeof vi.fn>;
  const last = mock.mock.calls[mock.mock.calls.length - 1];
  return JSON.parse(last?.[0] as string);
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
    throw new Error(`exit:${_code}`);
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('info command', () => {
  it('is registered with name "info"', () => {
    const program = makeProgram();
    const names = program.commands.map(c => c.name());
    expect(names).toContain('info');
  });

  describe('info chains', () => {
    it('returns an array where each entry has name and wormholeChainId', () => {
      const program = makeProgram();
      program.parse(['info', 'chains'], { from: 'user' });

      const result = lastJson() as Array<{ name: string; wormholeChainId: number }>;
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      for (const entry of result) {
        expect(typeof entry.name).toBe('string');
        expect(typeof entry.wormholeChainId).toBe('number');
      }
    });

    it('omits testnet chains by default', () => {
      const program = makeProgram();
      program.parse(['info', 'chains'], { from: 'user' });

      const result = lastJson() as Array<{ isTestnet: boolean }>;
      expect(result.every(c => c.isTestnet === false)).toBe(true);
    });

    it('includes testnet chains when --testnet flag is passed', () => {
      const program = makeProgram();
      program.parse(['info', 'chains', '--testnet'], { from: 'user' });

      const result = lastJson() as Array<{ isTestnet: boolean }>;
      expect(result.some(c => c.isTestnet === true)).toBe(true);
    });

    it('returns only testnet chains when --testnet-only flag is passed', () => {
      const program = makeProgram();
      program.parse(['info', 'chains', '--testnet-only'], { from: 'user' });

      const result = lastJson() as Array<{ isTestnet: boolean }>;
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(c => c.isTestnet === true)).toBe(true);
    });
  });

  describe('info summary', () => {
    it('returns correct wormholeChainId=2 and evmChainId=1 for ethereum', () => {
      const program = makeProgram();
      program.parse(['info', 'summary', 'ethereum'], { from: 'user' });

      const result = lastJson() as { wormholeChainId: number; evmChainId: number };
      expect(result.wormholeChainId).toBe(2);
      expect(result.evmChainId).toBe(1);
    });

    it('also accepts lookup by numeric wormhole chain ID', () => {
      const program = makeProgram();
      program.parse(['info', 'summary', '2'], { from: 'user' });

      const result = lastJson() as { name: string; wormholeChainId: number };
      expect(result.name).toBe('ethereum');
      expect(result.wormholeChainId).toBe(2);
    });

    it('exits with code 1 for an unknown chain ID (9999)', () => {
      const program = makeProgram();
      expect(() => program.parse(['info', 'summary', '9999'], { from: 'user' })).toThrow('exit:1');
    });

    it('exits with code 1 for an unknown chain name', () => {
      const program = makeProgram();
      expect(() => program.parse(['info', 'summary', 'notachain'], { from: 'user' })).toThrow('exit:1');
    });
  });

  describe('info chain-id', () => {
    it('returns wormholeChainId for a known chain', () => {
      const program = makeProgram();
      program.parse(['info', 'chain-id', 'ethereum'], { from: 'user' });

      const result = lastJson() as { chain: string; wormholeChainId: number };
      expect(result.chain).toBe('ethereum');
      expect(result.wormholeChainId).toBe(2);
    });

    it('exits with code 1 for an unknown chain name', () => {
      const program = makeProgram();
      expect(() => program.parse(['info', 'chain-id', 'unknown'], { from: 'user' })).toThrow('exit:1');
    });

    it('falls back to EVM chain ID when Wormhole chain ID not found', () => {
      const program = makeProgram();
      program.parse(['info', 'chain-id', '11155111'], { from: 'user' });

      const result = lastJson() as { chain: string; wormholeChainId: number };
      expect(result.chain).toBe('sepolia');
    });
  });
});
