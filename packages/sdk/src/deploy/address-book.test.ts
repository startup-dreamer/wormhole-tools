import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadAddressBook, saveAddressBook, getAddress, setAddress, isDeployed,
  importFromFoundryBroadcast, importFromHardhatDeploy, mergePartialBook,
} from './address-book.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'worm-tool-ab-')); });
afterEach(() => { rmSync(root, { recursive: true }); });

describe('loadAddressBook', () => {
  it('returns empty book when file does not exist', async () => {
    const book = await loadAddressBook(root);
    expect(book.contracts).toEqual({});
  });

  it('loads existing book', async () => {
    mkdirSync(join(root, 'deployments'));
    writeFileSync(join(root, 'deployments', 'worm-tool.json'), JSON.stringify({
      version: '1', salt: 'test',
      contracts: { MyToken: { sepolia: { address: '0xabc', deployedAt: '2026-01-01T00:00:00Z' } } },
    }));
    const book = await loadAddressBook(root);
    expect(book.contracts['MyToken']?.['sepolia']?.address).toBe('0xabc');
  });
});

describe('getAddress / setAddress / isDeployed', () => {
  it('round-trips an address', async () => {
    let book = await loadAddressBook(root);
    book = setAddress(book, 'Vault', 'sepolia', {
      address: '0x1234' as `0x${string}`, txHash: '0xdead', deployedAt: '2026-05-18T00:00:00Z',
    });
    expect(getAddress(book, 'Vault', 'sepolia')).toBe('0x1234');
    expect(isDeployed(book, 'Vault', 'sepolia')).toBe(true);
    expect(isDeployed(book, 'Vault', 'mainnet')).toBe(false);
  });
});

describe('saveAddressBook', () => {
  it('creates deployments directory and persists', async () => {
    let book = await loadAddressBook(root);
    book = setAddress(book, 'Token', 'base-sepolia', {
      address: '0xbeef' as `0x${string}`, deployedAt: '2026-05-18T00:00:00Z',
    });
    await saveAddressBook(root, book);
    const reloaded = await loadAddressBook(root);
    expect(getAddress(reloaded, 'Token', 'base-sepolia')).toBe('0xbeef');
  });
});

describe('importFromFoundryBroadcast', () => {
  it('seeds address book from broadcast run-latest.json', async () => {
    const broadcastDir = join(root, 'broadcast', 'Deploy.s.sol', '11155111');
    mkdirSync(broadcastDir, { recursive: true });
    writeFileSync(join(broadcastDir, 'run-latest.json'), JSON.stringify({
      transactions: [
        { transactionType: 'CREATE', contractName: 'MyToken', contractAddress: '0xaabbcc', hash: '0xdeadbeef' },
      ],
      chain: 11155111,
    }));
    const partial = await importFromFoundryBroadcast(root);
    expect(partial['MyToken']?.['sepolia']?.address).toBe('0xaabbcc');
  });
});

describe('importFromHardhatDeploy', () => {
  it('seeds address book from hardhat-deploy deployments/', async () => {
    const network = join(root, 'deployments', 'sepolia');
    mkdirSync(network, { recursive: true });
    writeFileSync(join(network, 'Vault.json'), JSON.stringify({
      address: '0xc0ffee', transactionHash: '0x1234',
    }));
    const partial = await importFromHardhatDeploy(root);
    expect(partial['Vault']?.['sepolia']?.address).toBe('0xc0ffee');
  });
});

describe('mergePartialBook', () => {
  it('merges partial into book without overwriting existing entries', async () => {
    let book = await loadAddressBook(root);
    book = setAddress(book, 'Token', 'sepolia', { address: '0xold' as `0x${string}`, deployedAt: '2026-01-01T00:00:00Z' });
    const partial: Record<string, Record<string, { address: string; deployedAt: string }>> = {
      Token: { sepolia: { address: '0xnew', deployedAt: '2026-05-18T00:00:00Z' } },
      Vault: { sepolia: { address: '0xvault', deployedAt: '2026-05-18T00:00:00Z' } },
    };
    const merged = mergePartialBook(book, partial as Parameters<typeof mergePartialBook>[1]);
    expect(getAddress(merged, 'Token', 'sepolia')).toBe('0xold'); // not overwritten
    expect(getAddress(merged, 'Vault', 'sepolia')).toBe('0xvault'); // new entry added
  });
});
