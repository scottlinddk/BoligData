import test from 'node:test';
import assert from 'node:assert/strict';
import { FatalError, foldFieldName, redact } from './datafordeler-common.mjs';

test('redact hides api keys and tokens', () => {
  assert.equal(redact('GET https://x?apiKey=abc123&y=1'), 'GET https://x?apiKey=[redacted]&y=1');
  assert.equal(redact('token=zzz'), 'token=[redacted]');
});

test('foldFieldName folds Danish letters and punctuation', () => {
  assert.equal(foldFieldName('Ejendoms_Vurdering Å-Ø'), 'ejendomsvurderingaaoe');
});

test('FatalError carries its name', () => {
  assert.equal(new FatalError('x').name, 'FatalError');
});
