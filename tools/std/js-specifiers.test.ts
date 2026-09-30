import assert from 'node:assert/strict';
import test from 'node:test';
import { findMissingJsSpecifiers } from './js-specifiers.ts';

test('findMissingJsSpecifiers flags relative specifiers without .js and skips complete ones', () => {
  const text = [
    "import { a } from './a';",
    "import { b } from '../b.js';",
    "export { c } from './dir/c';",
    "import fixture from './fixtures/f.json' with { type: 'json' };",
    "import { d } from '@pipe/core';",
    "import { e } from './e.jsx';",
  ].join('\r\n');
  assert.deepEqual(findMissingJsSpecifiers('x.ts', text), [
    "x.ts:1:import { a } from './a';",
    "x.ts:3:export { c } from './dir/c';",
    "x.ts:6:import { e } from './e.jsx';",
  ]);
});
