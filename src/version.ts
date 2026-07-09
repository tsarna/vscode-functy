import * as vscode from 'vscode';
import { functyPath, runFuncty } from './config';

/** Minimum functy version this extension requires (uniform-stderr `--json`). */
export const MIN_VERSION = '0.8.1';

const REPO_URL = 'https://github.com/tsarna/functy';

/**
 * Extract the `x.y.z` version from `functy version` output (first line is
 * `functy <version>`). Returns null for a source build (`functy dev`) or any
 * output we can't parse — callers treat null as "don't warn".
 *
 * Deliberately parses the plain-text output rather than a `--json` form: this
 * check exists to catch *old* binaries, and any `--json` flag postdates the
 * versions it must detect, so the lowest-common-denominator text is the only
 * format guaranteed to be present.
 */
export function parseVersion(output: string): string | null {
  const m = /^functy\s+v?(\d+\.\d+\.\d+)/m.exec(output);
  return m ? m[1] : null;
}

/** Compare dotted numeric versions: -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Check the configured functy binary on activation (and when `functy.path`
 * changes). Warns once if it's missing or older than {@link MIN_VERSION}; stays
 * silent for a matching version or an unparseable/dev build. Never throws.
 */
export async function checkBinaryVersion(): Promise<void> {
  let res;
  try {
    res = await runFuncty(['version']);
  } catch {
    const pick = await vscode.window.showWarningMessage(
      `functy: could not find the '${functyPath()}' binary. Install functy ${MIN_VERSION} or newer ` +
        `(go install github.com/tsarna/functy/cmd/functy@latest) or set 'functy.path'. ` +
        `Run, Check, Format, and Testing need it.`,
      'Open functy on GitHub',
      'Open Settings',
    );
    if (pick === 'Open functy on GitHub') {
      void vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
    } else if (pick === 'Open Settings') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'functy.path');
    }
    return;
  }

  // A binary too old to have the `version` subcommand (exit != 0) or a dev build
  // (unparseable) is left alone — a false "too old" warning is worse than silence.
  const version = res.code === 0 ? parseVersion(res.stdout) : null;
  if (version && compareVersions(version, MIN_VERSION) < 0) {
    const pick = await vscode.window.showWarningMessage(
      `functy: this extension needs functy ${MIN_VERSION} or newer, but found ${version}. ` +
        `Upgrade to get reliable diagnostics and test results.`,
      'Open functy on GitHub',
    );
    if (pick === 'Open functy on GitHub') {
      void vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
    }
  }
}
