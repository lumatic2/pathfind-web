#!/usr/bin/env node
/**
 * scan-secrets.mjs
 *
 * git에 잡히는 모든 파일(작업 트리)과 전체 히스토리의 모든 커밋 패치를 훑어서
 * 키처럼 생긴 값을 찾는다.
 *
 * 패턴:
 *  1) up_ 뒤에 영숫자 20자 이상
 *  2) sk- 뒤에 영숫자 20자 이상
 *  3) ghp_ 뒤에 영숫자 30자 이상
 *  4) tvly-로 시작하는 것
 *  5) KEY/SECRET/TOKEN/OC 이름 옆에 32자 이상 hex/base64 덩어리
 *  6) HERMES_RELAY_URL 뒤에 등호와 값이 붙은 줄
 *  7) 127.0.0.1 뒤에 포트 숫자가 붙은 것
 *  8) trycloudflare.com으로 끝나는 주소
 *
 * 출력은 파일 경로, 줄 번호, 패턴 이름, 값 길이만. 값은 절대 찍지 않는다.
 * 히스토리 히트는 커밋 해시, 파일, 패턴 이름, 길이.
 * 히트가 하나라도 있으면 종료 코드 1, 마지막 줄은 hits N.
 *
 * 환경변수 이름만 있는 줄(등호 뒤에 값 없음)은 히트가 아니다.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('.');

function git(args) {
  return execSync(`git ${args}`, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
}

// ── 패턴 정의 ──────────────────────────────────────────────────────────────

const VALUE_PATTERNS = [
  { name: 'up_key', re: /up_[A-Za-z0-9]{20,}/g },
  { name: 'sk_key', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'ghp_key', re: /ghp_[A-Za-z0-9]{30,}/g },
  { name: 'tvly', re: /tvly-[A-Za-z0-9]/g },
  { name: 'local_port', re: /127\.0\.0\.1:\d+/g },
  { name: 'trycloudflare', re: /\b[a-zA-Z0-9.-]+\.trycloudflare\.com\b/g },
];

// KEY/SECRET/TOKEN/OC + 32자 이상 hex/base64 — 별도 처리
const KEY_SECRET_NAME_RE = /\b(KEY|SECRET|TOKEN|OC)\b/;
const LONG_CHUNK_RE = /[A-Za-z0-9+/=]{32,}/g;

// HERMES_RELAY_URL — 별도 처리 (등호 뒤에 값이 있어야 히트)
const HERMES_RELAY_RE = /HERMES_RELAY_URL\s*=\s*(\S+)/g;

// ── 라인 스캔 ──────────────────────────────────────────────────────────────

function scanLine(line) {
  const hits = [];

  for (const p of VALUE_PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(line)) !== null) {
      hits.push({ pattern: p.name, length: m[0].length });
    }
  }

  // KEY/SECRET/TOKEN/OC: 이름이 있고, 같은 줄에 32자 이상 hex/base64 덩어리가 있어야 함
  if (KEY_SECRET_NAME_RE.test(line)) {
    LONG_CHUNK_RE.lastIndex = 0;
    let m;
    while ((m = LONG_CHUNK_RE.exec(line)) !== null) {
      hits.push({ pattern: 'key_secret_token_oc', length: m[0].length });
    }
  }

  // HERMES_RELAY_URL: 등호 뒤에 값이 있어야 함 (위 regex가 이미 값 없으면 매칭 안 됨)
  HERMES_RELAY_RE.lastIndex = 0;
  let m;
  while ((m = HERMES_RELAY_RE.exec(line)) !== null) {
    hits.push({ pattern: 'hermes_relay_url', length: m[1].length });
  }

  return hits;
}

// ── 작업 트리 스캔 ─────────────────────────────────────────────────────────

function scanTrackedFiles() {
  const hits = [];
  const files = git('ls-files').split('\n').filter(Boolean);

  for (const rel of files) {
    const abs = resolve(ROOT, rel);
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineHits = scanLine(lines[i]);
      for (const h of lineHits) {
        hits.push({
          type: 'tree',
          file: rel,
          line: i + 1,
          pattern: h.pattern,
          length: h.length,
        });
      }
    }
  }

  return hits;
}

// ── 전체 히스토리 스캔 ─────────────────────────────────────────────────────

function scanFullHistory() {
  const hits = [];
  const hashes = git('rev-list --all').split('\n').filter(Boolean);

  for (const hash of hashes) {
    let diff;
    try {
      diff = git(`diff-tree --no-commit-id -r -p ${hash}`);
    } catch {
      continue;
    }
    if (!diff) continue;

    const lines = diff.split('\n');
    let currentFile = null;

    for (const line of lines) {
      const m = line.match(/^diff --git a\/(\S+) b\/\S+$/);
      if (m) {
        currentFile = m[1];
        continue;
      }
      if (line.startsWith('diff --git') || line.startsWith('index ') ||
          line.startsWith('--- ') || line.startsWith('+++ ') ||
          line.startsWith('@@')) {
        continue;
      }

      if (!currentFile) continue;

      const lineHits = scanLine(line);
      for (const h of lineHits) {
        hits.push({
          type: 'history',
          commit: hash,
          file: currentFile,
          pattern: h.pattern,
          length: h.length,
        });
      }
    }
  }

  return hits;
}

// ── 메인 ────────────────────────────────────────────────────────────────────

const treeHits = scanTrackedFiles();
const historyHits = scanFullHistory();
const allHits = [...treeHits, ...historyHits];

for (const h of treeHits) {
  console.log(`${h.file}:${h.line} ${h.pattern} ${h.length}`);
}
for (const h of historyHits) {
  console.log(`${h.commit} ${h.file} ${h.pattern} ${h.length}`);
}

console.log(`hits ${allHits.length}`);

process.exit(allHits.length > 0 ? 1 : 0);
