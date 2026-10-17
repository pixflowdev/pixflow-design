import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeWordPressLanguageSelector } from './wordpress-language-scope.ts';

test('matches language rules on the plugin root rather than requiring a nested direction wrapper', () => {
  const scope = ':where(#pixflow-design-root, .pixflow-design-portal-scope)';
  assert.equal(scopeWordPressLanguageSelector('[dir="rtl"] .msg', scope), `${scope}[dir="rtl"] .msg`);
  assert.equal(scopeWordPressLanguageSelector('[dir="rtl"]', scope), `${scope}[dir="rtl"]`);
  assert.equal(scopeWordPressLanguageSelector('html[dir=ltr] .arrow', scope), `${scope}[dir=ltr] .arrow`);
  assert.equal(scopeWordPressLanguageSelector(':lang(zh-CN)', scope), `${scope}:lang(zh-CN)`);
  assert.equal(scopeWordPressLanguageSelector('.some-control', scope), null);
});
