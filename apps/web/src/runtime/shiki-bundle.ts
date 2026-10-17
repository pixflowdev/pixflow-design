import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import javascript from 'shiki/langs/javascript.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import jsx from 'shiki/langs/jsx.mjs';
import html from 'shiki/langs/html.mjs';
import css from 'shiki/langs/css.mjs';
import json from 'shiki/langs/json.mjs';
import python from 'shiki/langs/python.mjs';
import bash from 'shiki/langs/bash.mjs';
import shell from 'shiki/langs/shell.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import sql from 'shiki/langs/sql.mjs';
import rust from 'shiki/langs/rust.mjs';
import go from 'shiki/langs/go.mjs';
import java from 'shiki/langs/java.mjs';
import c from 'shiki/langs/c.mjs';
import cpp from 'shiki/langs/cpp.mjs';
import swift from 'shiki/langs/swift.mjs';
import ruby from 'shiki/langs/ruby.mjs';
import php from 'shiki/langs/php.mjs';
import diff from 'shiki/langs/diff.mjs';
import toml from 'shiki/langs/toml.mjs';
import xml from 'shiki/langs/xml.mjs';
import graphql from 'shiki/langs/graphql.mjs';
import dockerfile from 'shiki/langs/dockerfile.mjs';
import light from 'shiki/themes/github-light-default.mjs';
import dark from 'shiki/themes/github-dark-default.mjs';

/** Only the grammars/themes used by chat and previews. Grammar packages include
 * their embedded dependencies and aliases; the engine remains fully offline. */
export function createHighlighter() {
  return createHighlighterCore({
    themes: [light, dark],
    langs: [javascript, typescript, tsx, jsx, html, css, json, python, bash, shell,
      markdown, yaml, sql, rust, go, java, c, cpp, swift, ruby, php, diff, toml, xml, graphql, dockerfile],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
}
