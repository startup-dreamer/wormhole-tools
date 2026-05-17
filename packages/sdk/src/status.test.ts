import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMessageStatus, MessageStatus } from './status.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => mockFetch.mockReset());

describe('getMessageStatus', () => {
  it('returns Signed when wormholescan returns vaaBytes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vaaBytes: 'AQID', data: { txHash: '0xabc' } }),
    });
    const result = await getMessageStatus({
      emitterChain: 2,
      emitterAddress: '0x' + '00'.repeat(32),
      sequence: 1n,
    });
    expect(result.status).toBe(MessageStatus.Signed);
    expect(result.vaaBytes).toBe('AQID');
    expect(result.txHash).toBe('0xabc');
  });

  it('returns Pending when API returns 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await getMessageStatus({
      emitterChain: 2,
      emitterAddress: '0x' + '00'.repeat(32),
      sequence: 99n,
    });
    expect(result.status).toBe(MessageStatus.Pending);
  });

  it('throws on non-404 API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(
      getMessageStatus({ emitterChain: 2, emitterAddress: '0x' + '00'.repeat(32), sequence: 1n }),
    ).rejects.toThrow('500');
  });

  it('uses testnet base URL when network=testnet', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await getMessageStatus({
      emitterChain: 2,
      emitterAddress: '0x00',
      sequence: 1n,
      network: 'testnet',
    });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('testnet.wormholescan.io'));
  });
});
