import { describe, it, expect } from 'vitest';
import { diffStorageLayouts } from './storage-diff.js';
import type { StorageLayout } from '../toolchain/types.js';

const baseLayout: StorageLayout = {
  storage: [
    { label: 'owner', type: 't_address', slot: '0', offset: 0 },
    { label: 'balance', type: 't_uint256', slot: '1', offset: 0 },
  ],
  types: {
    t_address: { encoding: 'inplace', label: 'address', numberOfBytes: '20' },
    t_uint256: { encoding: 'inplace', label: 'uint256', numberOfBytes: '32' },
  },
};

describe('diffStorageLayouts', () => {
  it('returns no issues for identical layouts', () => {
    const result = diffStorageLayouts(baseLayout, baseLayout);
    expect(result.issues).toHaveLength(0);
    expect(result.safe).toBe(true);
  });

  it('detects removed variable as critical', () => {
    const newLayout: StorageLayout = {
      storage: [{ label: 'owner', type: 't_address', slot: '0', offset: 0 }],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    const removed = result.issues.find(i => i.severity === 'critical' && i.variable === 'balance');
    expect(removed).toBeDefined();
    expect(result.safe).toBe(false);
  });

  it('detects type change as critical', () => {
    const newLayout: StorageLayout = {
      storage: [
        { label: 'owner', type: 't_uint256', slot: '0', offset: 0 },
        { label: 'balance', type: 't_uint256', slot: '1', offset: 0 },
      ],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    const typeChange = result.issues.find(i => i.variable === 'owner' && i.severity === 'critical');
    expect(typeChange).toBeDefined();
    expect(result.safe).toBe(false);
  });

  it('detects slot change as critical', () => {
    const newLayout: StorageLayout = {
      storage: [
        { label: 'owner', type: 't_address', slot: '1', offset: 0 },
        { label: 'balance', type: 't_uint256', slot: '0', offset: 0 },
      ],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    expect(result.issues.some(i => i.severity === 'critical')).toBe(true);
    expect(result.safe).toBe(false);
  });

  it('detects offset change as critical', () => {
    const newLayout: StorageLayout = {
      storage: [
        { label: 'owner', type: 't_address', slot: '0', offset: 4 },  // offset changed from 0 to 4
        { label: 'balance', type: 't_uint256', slot: '1', offset: 0 },
      ],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    const offsetChange = result.issues.find(i => i.variable === 'owner' && i.severity === 'critical');
    expect(offsetChange).toBeDefined();
    expect(result.safe).toBe(false);
  });

  it('detects new variables appended as warning only', () => {
    const newLayout: StorageLayout = {
      storage: [
        ...baseLayout.storage,
        { label: 'newField', type: 't_uint256', slot: '2', offset: 0 },
      ],
      types: baseLayout.types,
    };
    const result = diffStorageLayouts(baseLayout, newLayout);
    expect(result.issues.every(i => i.severity === 'warning')).toBe(true);
    expect(result.safe).toBe(true);
  });
});
