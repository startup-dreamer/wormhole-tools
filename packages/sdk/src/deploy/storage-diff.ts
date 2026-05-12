import type { StorageLayout } from '../toolchain/types.js';

/** A single issue found when comparing two storage layouts. */
export interface StorageDiffIssue {
  /** Critical issues block upgrades; warnings are informational. */
  severity: 'critical' | 'warning';
  /** The Solidity variable label that triggered this issue. */
  variable: string;
  /** Human-readable description of the issue. */
  message: string;
}

/** Result of comparing old and new storage layouts. */
export interface StorageDiffResult {
  /**
   * True when there are no critical issues (only warnings or no issues at all).
   * A `safe` result means it is likely safe to upgrade.
   */
  safe: boolean;
  /** All issues found, sorted with critical issues first. */
  issues: StorageDiffIssue[];
}

/**
 * Compare old and new Solidity storage layouts.
 *
 * Checks for removed variables, type changes, slot moves, and offset changes —
 * each classified as `critical`. New variables appended at the end are classified
 * as `warning`.
 *
 * @param oldLayout - Storage layout from the currently deployed implementation.
 * @param newLayout - Storage layout from the new implementation to upgrade to.
 * @returns A `StorageDiffResult` with all issues and a `safe` flag.
 */
export function diffStorageLayouts(
  oldLayout: StorageLayout,
  newLayout: StorageLayout,
): StorageDiffResult {
  const issues: StorageDiffIssue[] = [];
  const oldByLabel = new Map(oldLayout.storage.map(v => [v.label, v]));
  const newByLabel = new Map(newLayout.storage.map(v => [v.label, v]));

  for (const [label, oldVar] of oldByLabel) {
    const newVar = newByLabel.get(label);
    if (!newVar) {
      issues.push({
        severity: 'critical',
        variable: label,
        message: `Variable "${label}" was removed — this corrupts storage on upgrade`,
      });
      continue;
    }
    if (newVar.type !== oldVar.type) {
      issues.push({
        severity: 'critical',
        variable: label,
        message: `Variable "${label}" changed type from "${oldVar.type}" to "${newVar.type}"`,
      });
    }
    if (newVar.slot !== oldVar.slot) {
      issues.push({
        severity: 'critical',
        variable: label,
        message: `Variable "${label}" moved from slot ${oldVar.slot} to ${newVar.slot}`,
      });
    }
    if (newVar.offset !== oldVar.offset) {
      issues.push({
        severity: 'critical',
        variable: label,
        message: `Variable "${label}" offset changed from ${oldVar.offset} to ${newVar.offset}`,
      });
    }
  }

  for (const [label] of newByLabel) {
    if (!oldByLabel.has(label)) {
      issues.push({
        severity: 'warning',
        variable: label,
        message: `New variable "${label}" added — ensure it is appended after all existing variables`,
      });
    }
  }

  return { safe: issues.every(i => i.severity === 'warning'), issues };
}
