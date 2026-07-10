import * as vscode from 'vscode';
import { functyPath, runFuncty } from './config';
import { compareVersions, coreVersion } from './protocol';

/** Minimum functy version this extension requires (the 0.9.x editor-tooling CLIs). */
export const MIN_VERSION = '0.9.0';

const REPO_URL = 'https://github.com/tsarna/functy';

function warnUpdate(found?: string): void {
  const detail = found ? `, but found ${found}` : '';
  void vscode.window
    .showWarningMessage(
      `functy: this extension needs functy ${MIN_VERSION} or newer${detail}. ` +
        `Update it (go install github.com/tsarna/functy/cmd/functy@latest) or set 'functy.path'.`,
      'Open functy on GitHub',
    )
    .then((pick) => {
      if (pick === 'Open functy on GitHub') {
        void vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
      }
    });
}

/**
 * Check the configured functy binary on activation (and when `functy.path`
 * changes) via `functy version --json`. Warns if it's missing, too old to have
 * that flag, or older than {@link MIN_VERSION}. Never throws.
 */
export async function checkBinaryVersion(): Promise<void> {
  let res;
  try {
    res = await runFuncty(['version', '--json']);
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

  // A non-zero exit means the binary is too old to have `version --json`
  // (predates 0.9.0), so it lacks the CLIs this extension relies on.
  if (res.code !== 0) {
    warnUpdate();
    return;
  }

  let version: string | null = null;
  try {
    const info = JSON.parse(res.stdout) as { version?: string };
    version = info.version ? coreVersion(info.version) : null;
  } catch {
    /* unparseable — leave null, don't nag on a dev build */
  }
  if (version && compareVersions(version, MIN_VERSION) < 0) {
    warnUpdate(version);
  }
}
