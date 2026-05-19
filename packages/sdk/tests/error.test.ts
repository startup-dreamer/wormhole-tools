import { describe, it, expect } from 'vitest';
import {
  WormcraftError,
  RpcError,
  ChainNotSupportedError,
  VaaParseError,
  ContractCallError,
} from '../src/error.js';

describe('WormcraftError', () => {
  it('RpcError carries chain and message', () => {
    const err = new RpcError('ethereum', 'connection refused');
    expect(err).toBeInstanceOf(WormcraftError);
    expect(err.chain).toBe('ethereum');
    expect(err.message).toContain('connection refused');
  });

  it('ChainNotSupportedError names the chain', () => {
    const err = new ChainNotSupportedError('cosmos');
    expect(err).toBeInstanceOf(WormcraftError);
    expect(err.message).toContain('cosmos');
  });

  it('VaaParseError wraps cause', () => {
    const cause = new Error('bad hex');
    const err = new VaaParseError('invalid hex input', cause);
    expect(err.cause).toBe(cause);
  });

  it('ContractCallError carries address', () => {
    const err = new ContractCallError('0xDEAD', 'revert');
    expect(err.address).toBe('0xDEAD');
  });

  it('error name matches class name', () => {
    expect(new RpcError('eth', 'fail').name).toBe('RpcError');
    expect(new VaaParseError('bad').name).toBe('VaaParseError');
  });

  it('instanceof works across error hierarchy', () => {
    const err = new ContractCallError('0x1', 'revert');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WormcraftError);
    expect(err).toBeInstanceOf(ContractCallError);
  });
});
