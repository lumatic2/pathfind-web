#!/usr/bin/env node
/**
 * scan-secrets.mjs
 *
 * git 에 잡히는 파일들과 최근 50개 커밋의 diff를 훑어서 다음을 찾는다.
 *  1) KEY, TOKEN, SECRET, OC, Bearer 뒤에 33자 이상 영숫자 문자열
 *  2) VITE_ 로 시작하는 변수 이름 (전체 리포)
 *  3) api/와 frontend/ 안의 127.0.0.1 또는 localhost 주소
 *
 * 출력은 파일 이름과 개수만. 값은 절대 찍지 않는다.
 * 마지막 줄은 다음 형식으로 세 숫자만 출력한다:
 *   secrets: N, vite-prefixed: N, local-addresses: N
 *
 * 구현 방식: commit 해시를 먼저 작게 뽑고, 각 커밋 diff를 하나씩 순회해서 누적한다.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('.');

// ── helpers ────────────────────────────────────────────────────────────────

function git(args) {
  return execSync(`git ${args}`, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10MB 버퍼
  }).trim();
}

function gitTrackedFiles() {
  return git('ls-files').split('\n').filter(Boolean);
}

/** 최근 N개 커밋 해시 목록 (작은 출력) */
function gitCommitHashes(commitCount = 50) {
  return git(`rev-list --no-commit-header -n ${commitCount} HEAD`).split('\n').filter(Boolean);
}

/** 한 커밋의 diff (파일 경로 추적 포함) — 작은 단위로 순회 */
function gitDiffForCommit(hash) {
  return git(`diff-tree --no-commit-id -r -p ${hash}`);
}

// ── regexes ────────────────────────────────────────────────────────────────

const SECRET_RE = /\b(KEY|TOKEN|SECRET|OC|BEARER)\s*[:=]?\s*['"]?([A-Za-z0-9+/=]{33,})['"]?/gi;
const VITE_RE = /\bVITE_[A-Z_][A-Z0-9_]*(?=\s*[=:]|\.)/g;
const LOCAL_RE = /\b(?:127\.0\.0\.1|localhost)(?::\d+)?\b/g;

function countSecretsInText(text) {
  let n = 0;
  let m;
  while ((m = SECRET_RE.exec(text)) !== null) n++;
  return n;
}

function countViteInText(text) {
  let n = 0;
  let m;
  while ((m = VITE_RE.exec(text)) !== null) n++;
  return n;
}

function countLocalInText(text) {
  let n = 0;
  let m;
  while ((m = LOCAL_RE.exec(text)) !== null) n++;
  return n;
}

function isApiOrFrontendFile(filepath) {
  return filepath.startsWith('api/') || filepath.startsWith('frontend/');
}

// ── scan tracked files ────────────────────────────────────────────────────

let secCount = 0;
let viteCount = 0;
let addrCount = 0;

const tracked = gitTrackedFiles();
for (const rel of tracked) {
  const abs = resolve(ROOT, rel);
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  secCount += countSecretsInText(text);
  viteCount += countViteInText(text);
  if (isApiOrFrontendFile(rel)) {
    addrCount += countLocalInText(text);
  }
}

// ── scan recent 50 commits (one commit at a time) ──────────────────────────

const COMMIT_COUNT = 50;
const hashes = gitCommitHashes(COMMIT_COUNT);
let currentFile = null;

for (const hash of hashes) {
  const diff = gitDiffForCommit(hash);
  const lines = diff.split('\n');
  for (const line of lines) {
    // diff --git a/path b/path  → 현재 파일 갱신
    const m = line.match(/^diff --git a\/(\S+) b\/\S+$/);
    if (m) {
      currentFile = m[1];
      continue;
    }
    if (line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    }
    // 본문 라인 검사
    secCount += countSecretsInText(line);
    viteCount += countViteInText(line);
    if (currentFile && isApiOrFrontendFile(currentFile)) {
      addrCount += countLocalInText(line);
    }
  }
}

// ── output ─────────────────────────────────────────────────────────────────

console.log(`files: ${tracked.length}`);
console.log(`diff-commits: ${COMMIT_COUNT}`);
console.log(`secrets: ${secCount}, vite-prefixed: ${viteCount}, local-addresses: ${addrCount}`);
