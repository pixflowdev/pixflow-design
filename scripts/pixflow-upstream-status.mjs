#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const shouldFetch = args.includes('--fetch');
const targetArg = args.find((arg) => !arg.startsWith('--'));

function git(gitArgs, options = {}) {
  return execFileSync('git', gitArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.allowFailure ? 'pipe' : 'inherit'],
  }).trim();
}

function tryGit(gitArgs) {
  try {
    return git(gitArgs, { allowFailure: true });
  } catch {
    return '';
  }
}

if (shouldFetch) {
  git(['fetch', 'upstream', '--tags', '--prune']);
}

const branch = git(['branch', '--show-current']) || '(detached)';
const head = git(['rev-parse', '--short', 'HEAD']);
const upstreamUrl = tryGit(['remote', 'get-url', 'upstream']) || '(missing)';
const upstreamPushUrl = tryGit(['remote', 'get-url', '--push', 'upstream']) || '(missing)';
const latestTag = tryGit(['tag', '--list', 'open-design-v*', '--sort=-version:refname'])
  .split(/\r?\n/)
  .filter(Boolean)[0] ?? '';
const target = targetArg || latestTag || 'upstream/main';
const targetExists = tryGit(['rev-parse', '--verify', '--quiet', target]);

if (!targetExists) {
  process.stderr.write(`Unknown upstream target: ${target}\n`);
  process.exit(1);
}

const targetShort = git(['rev-parse', '--short', target]);
const mergeBase = tryGit(['merge-base', 'HEAD', target]);
const mergeBaseShort = mergeBase ? git(['rev-parse', '--short', mergeBase]) : '(none)';
const [behind = '0', ahead = '0'] = mergeBase
  ? git(['rev-list', '--left-right', '--count', `HEAD...${target}`]).split(/\s+/)
  : [tryGit(['rev-list', '--count', target]) || 'unknown', tryGit(['rev-list', '--count', 'HEAD']) || 'unknown'];
const upstreamFiles = (mergeBase ? tryGit(['diff', '--name-status', 'HEAD...'+target]) : tryGit(['diff', '--name-status', 'HEAD', target]))
  .split(/\r?\n/)
  .filter(Boolean)
  .slice(0, 80);
const pixflowCommits = tryGit(['log', '--oneline', `${target}..HEAD`, '--max-count=30'])
  .split(/\r?\n/)
  .filter(Boolean);

console.log(`Pixflow upstream status`);
console.log(`branch: ${branch}`);
console.log(`head: ${head}`);
console.log(`upstream.fetch: ${upstreamUrl}`);
console.log(`upstream.push: ${upstreamPushUrl}`);
console.log(`latest.open-design.tag: ${latestTag || '(none found)'}`);
console.log(`target: ${target} (${targetShort})`);
console.log(`merge-base: ${mergeBaseShort}`);
console.log(`target commits not in Pixflow: ${behind}`);
console.log(`Pixflow commits not in target: ${ahead}`);

if (!mergeBase) {
  console.log(`\nNo common Git history with ${target}.`);
  console.log(`Keep upstream fetch-only and do release updates on dedicated branches unless a planned repo migration imports upstream history.`);
}

if (pixflowCommits.length > 0) {
  console.log(`\nPixflow-only commits:`);
  for (const line of pixflowCommits) console.log(`  ${line}`);
}

if (upstreamFiles.length > 0) {
  console.log(`\nFiles changed by target versus current branch (first ${upstreamFiles.length}):`);
  for (const line of upstreamFiles) console.log(`  ${line}`);
}

console.log(`\nSuggested update branch: codex/upstream-${target.replaceAll('/', '-')}`);
