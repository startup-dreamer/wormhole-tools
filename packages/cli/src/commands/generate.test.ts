import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { parseVaa } from '@worm-tool/sdk';
import { registerGenerateCommand } from './generate.js';

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  registerGenerateCommand(p);
  return p;
}

/** Parse the first console.log call as JSON. */
function lastJson(): unknown {
  const mock = console.log as ReturnType<typeof vi.fn>;
  const last = mock.mock.calls[mock.mock.calls.length - 1];
  return JSON.parse(last?.[0] as string);
}

const EMITTER_ADDRESS = '0x' + '00'.repeat(31) + '01';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
    throw new Error(`exit:${_code}`);
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('generate command', () => {
  it('is registered with name "generate"', () => {
    const program = makeProgram();
    const names = program.commands.map(c => c.name());
    expect(names).toContain('generate');
  });

  describe('generate test-vaa', () => {
    it('outputs an object with a hex string in the "vaa" field for valid params', () => {
      const program = makeProgram();
      program.parse([
        'generate', 'test-vaa',
        '--emitter-chain', '2',
        '--emitter-address', EMITTER_ADDRESS,
        '--sequence', '42',
        '--payload', '0xdeadbeef',
      ], { from: 'user' });

      const result = lastJson() as { vaa: string };
      expect(typeof result.vaa).toBe('string');
      expect(result.vaa.startsWith('0x')).toBe(true);
      expect(result.vaa.length).toBeGreaterThan(2);
    });

    it('produces a VAA hex that is parseable by parseVaa from @worm-tool/sdk', () => {
      const program = makeProgram();
      program.parse([
        'generate', 'test-vaa',
        '--emitter-chain', '2',
        '--emitter-address', EMITTER_ADDRESS,
        '--sequence', '42',
        '--payload', '0xdeadbeef',
      ], { from: 'user' });

      const { vaa } = lastJson() as { vaa: string };
      const parsed = parseVaa(vaa);

      expect(parsed.emitterChain).toBe(2);
      expect(parsed.sequence).toBe(42n);
      expect(parsed.payload).toBe('0xdeadbeef');
    });

    it('respects optional --timestamp flag', () => {
      const program = makeProgram();
      program.parse([
        'generate', 'test-vaa',
        '--emitter-chain', '1',
        '--emitter-address', EMITTER_ADDRESS,
        '--sequence', '0',
        '--payload', '0x01',
        '--timestamp', '1000000',
      ], { from: 'user' });

      const { vaa } = lastJson() as { vaa: string };
      const parsed = parseVaa(vaa);
      expect(parsed.timestamp).toBe(1000000);
    });

    it('exits with code 1 when a required option is missing', () => {
      const program = makeProgram();
      // Missing --payload
      expect(() =>
        program.parse([
          'generate', 'test-vaa',
          '--emitter-chain', '2',
          '--emitter-address', EMITTER_ADDRESS,
          '--sequence', '1',
        ], { from: 'user' }),
      ).toThrow();
      // Commander throws CommanderError when a required option is absent (exitOverride is set)
    });

    it('uses sequence 0 when --sequence is omitted', () => {
      const program = makeProgram();
      program.parse([
        'generate', 'test-vaa',
        '--emitter-chain', '2',
        '--emitter-address', EMITTER_ADDRESS,
        '--payload', '0xdeadbeef',
      ], { from: 'user' });

      const { vaa } = lastJson() as { vaa: string };
      const parsed = parseVaa(vaa);
      expect(parsed.sequence).toBe(0n);
    });
  });
});
