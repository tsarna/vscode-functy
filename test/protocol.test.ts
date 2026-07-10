import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareVersions,
  coreVersion,
  escapeRegex,
  parseDiagnostics,
  parseSymbols,
  tokenizeArgs,
  zeroBased,
} from '../src/protocol';

test('coreVersion extracts x.y.z', () => {
  assert.equal(coreVersion('0.9.0'), '0.9.0');
  assert.equal(coreVersion('functy 1.2.3'), '1.2.3');
  assert.equal(coreVersion('v10.20.30'), '10.20.30');
});

test('coreVersion drops -rc / build suffixes', () => {
  assert.equal(coreVersion('0.9.0-rc.3'), '0.9.0');
  assert.equal(coreVersion('0.9.0-rc.3+abc123'), '0.9.0');
  assert.equal(coreVersion('1.2.3-dev.4'), '1.2.3');
});

test('coreVersion returns null for non-versions (dev builds)', () => {
  assert.equal(coreVersion('dev'), null);
  assert.equal(coreVersion(''), null);
  assert.equal(coreVersion('1.2'), null); // not a full x.y.z
});

test('compareVersions orders correctly', () => {
  assert.equal(compareVersions('0.9.0', '0.9.0'), 0);
  assert.equal(compareVersions('0.8.9', '0.9.0'), -1);
  assert.equal(compareVersions('0.9.1', '0.9.0'), 1);
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1); // numeric, not lexical
});

test('compareVersions treats missing components as 0', () => {
  assert.equal(compareVersions('1', '1.0.0'), 0);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
});

test('version gate: below MIN_VERSION triggers the update warning', () => {
  // Mirrors checkBinaryVersion's decision: coreVersion(x) then compare < 0.
  const tooOld = (v: string) => {
    const core = coreVersion(v);
    return core !== null && compareVersions(core, '0.9.0') < 0;
  };
  assert.equal(tooOld('0.8.1'), true);
  assert.equal(tooOld('0.9.0'), false);
  assert.equal(tooOld('0.9.0-rc.3'), false); // rc of the target is not "too old"
  assert.equal(tooOld('1.0.0'), false);
  assert.equal(tooOld('dev'), false); // unknown/dev build must not nag
});

test('tokenizeArgs splits on whitespace', () => {
  assert.deepEqual(tokenizeArgs('2 3'), ['2', '3']);
  assert.deepEqual(tokenizeArgs('  2   3  '), ['2', '3']);
  assert.deepEqual(tokenizeArgs(''), []);
  assert.deepEqual(tokenizeArgs('   '), []);
});

test('tokenizeArgs keeps quoted spans as one token, quotes preserved', () => {
  // functy evaluates each argument as an HCL expression, so quotes must survive.
  assert.deepEqual(tokenizeArgs('"hello world"'), ['"hello world"']);
  assert.deepEqual(tokenizeArgs('"alice" 42'), ['"alice"', '42']);
  assert.deepEqual(tokenizeArgs('a "b c" d'), ['a', '"b c"', 'd']);
});

test('tokenizeArgs handles escapes inside quotes', () => {
  assert.deepEqual(tokenizeArgs('"a\\"b"'), ['"a\\"b"']); // escaped quote stays inside
  assert.deepEqual(tokenizeArgs('"tab\\there"'), ['"tab\\there"']);
});

test('tokenizeArgs handles adjacent quoted and bare text', () => {
  assert.deepEqual(tokenizeArgs('pre"quoted"post'), ['pre"quoted"post']);
});

test('escapeRegex escapes regex metacharacters', () => {
  assert.equal(escapeRegex('a.b'), 'a\\.b');
  assert.equal(escapeRegex('foo(bar)'), 'foo\\(bar\\)');
  assert.equal(escapeRegex('a+b*c?'), 'a\\+b\\*c\\?');
  assert.equal(escapeRegex('plain'), 'plain');
});

test('escapeRegex output anchors a literal test name', () => {
  // Reproduces the --run alternation: ^(name1|name2)$ must match names literally.
  const names = ['adds 2 + 2', 'handles a.b'];
  const alt = names.map(escapeRegex).join('|');
  const re = new RegExp(`^(${alt})$`);
  assert.ok(re.test('adds 2 + 2'));
  assert.ok(re.test('handles a.b'));
  assert.ok(!re.test('handles axb')); // the '.' must not act as a wildcard
});

test('zeroBased converts 1-based to 0-based', () => {
  assert.deepEqual(zeroBased({ file: 'a.cty', line: 1, column: 1, end_line: 1, end_column: 5 }), {
    line: 0,
    column: 0,
    endLine: 0,
    endColumn: 4,
  });
  assert.deepEqual(zeroBased({ file: 'a.cty', line: 10, column: 3, end_line: 12, end_column: 8 }), {
    line: 9,
    column: 2,
    endLine: 11,
    endColumn: 7,
  });
});

test('zeroBased clamps to non-negative', () => {
  assert.deepEqual(zeroBased({ file: 'a.cty', line: 0, column: 0, end_line: 0, end_column: 0 }), {
    line: 0,
    column: 0,
    endLine: 0,
    endColumn: 0,
  });
});

test('parseDiagnostics accepts a well-formed report', () => {
  const rep = parseDiagnostics(
    JSON.stringify({
      diagnostics: [
        {
          severity: 'error',
          summary: 'boom',
          location: { file: 'a.cty', line: 2, column: 1, end_line: 2, end_column: 3 },
        },
      ],
    }),
  );
  assert.ok(rep);
  assert.equal(rep!.diagnostics.length, 1);
  assert.equal(rep!.diagnostics[0].summary, 'boom');
});

test('parseDiagnostics accepts an empty (passing) report', () => {
  const rep = parseDiagnostics(JSON.stringify({ diagnostics: [] }));
  assert.ok(rep);
  assert.equal(rep!.diagnostics.length, 0);
});

test('parseDiagnostics rejects garbage and non-reports', () => {
  assert.equal(parseDiagnostics('not json'), null);
  assert.equal(parseDiagnostics(''), null);
  assert.equal(parseDiagnostics('{}'), null); // no diagnostics array
  assert.equal(parseDiagnostics(JSON.stringify({ diagnostics: 'nope' })), null);
});

test('parseSymbols accepts a well-formed report', () => {
  // Regression guard: the outline/tests broke when `symbols --json` output
  // could not be parsed. Lock in the { symbols: [...] } contract.
  const syms = parseSymbols(
    JSON.stringify({
      symbols: [
        {
          kind: 'test',
          name: 'adds',
          range: { file: 'a.cty', line: 1, column: 1, end_line: 3, end_column: 1 },
        },
        {
          kind: 'func',
          name: 'add',
          detail: 'func add(a, b)',
          range: { file: 'a.cty', line: 5, column: 1, end_line: 7, end_column: 1 },
        },
      ],
    }),
  );
  assert.equal(syms.length, 2);
  assert.equal(syms[0].kind, 'test');
  assert.equal(syms[1].name, 'add');
  assert.equal(syms[1].detail, 'func add(a, b)');
});

test('parseSymbols returns [] on garbage and non-reports', () => {
  assert.deepEqual(parseSymbols('not json'), []);
  assert.deepEqual(parseSymbols(''), []);
  assert.deepEqual(parseSymbols('{}'), []); // no symbols array
  assert.deepEqual(parseSymbols(JSON.stringify({ symbols: null })), []);
});
