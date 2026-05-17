import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerParseCommand } from './parse.js';

// A minimal synthetic VAA with 0 guardian signatures.
// Built via: generateTestVaaHex({ emitterChain: 2, emitterAddress: '0x' + '00'.repeat(31) + '01',
//   sequence: 42n, payload: '0xdeadbeef', timestamp: 1000000, nonce: 0, consistencyLevel: 1 })
const VALID_VAA_HEX =
  '0x010000000000000f42400000000000020000000000000000000000000000000000000000000000000000000000000001000000000000002a01deadbeef';

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride(); // prevent Commander from calling process.exit on parse errors
  registerParseCommand(p);
  return p;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
    throw new Error(`exit:${_code}`);
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('parse command', () => {
  it('is registered with name "parse"', () => {
    const program = makeProgram();
    const names = program.commands.map(c => c.name());
    expect(names).toContain('parse');
  });

  it('parses a known valid VAA and outputs correct fields as JSON', () => {
    const program = makeProgram();
    program.parse(['parse', VALID_VAA_HEX], { from: 'user' });

    expect(console.log).toHaveBeenCalledOnce();
    const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string);

    expect(output.version).toBe(1);
    expect(output.emitterChain).toBe(2);
    // sequence is serialised as string (BigInt → JSON replacer)
    expect(output.sequence).toBe('42');
    expect(output.payload).toBe('0xdeadbeef');
    expect(output.guardianSetIndex).toBe(0);
    expect(output.signatures).toEqual([]);
  });

  it('exits with code 1 on invalid VAA input', () => {
    const program = makeProgram();
    expect(() => program.parse(['parse', 'not-valid-hex!!'], { from: 'user' })).toThrow('exit:1');
  });

  it('exits with code 1 on empty-string VAA input', () => {
    const program = makeProgram();
    expect(() => program.parse(['parse', ''], { from: 'user' })).toThrow('exit:1');
  });
});
