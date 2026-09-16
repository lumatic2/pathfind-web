// api/channels/public-data.js — 공공데이터포털(data.go.kr) 데이터셋·API 찾기 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchPublicData.
// 구현: 공공데이터포털엔 목록 검색 API가 없어서 네이버 웹검색 색인을 경유한다.
//        「질의 data.go.kr」·「질의 공공데이터포털 API」·「공공데이터포털 질의」를 차례로 시도한다.

import { available as naverAvailable, searchNaver } from './naver.js';

/** 채널 이름. 고정 문자열. */
export const name = 'public-data';

/** 공공데이터포털 데이터셋 검색 사용 가능 여부. 네이버 키가 있어야 쓸 수 있다. */
export function available() {
  return naverAvailable();
}

/** data.go.kr 데이터셋·API 페이지 경로 패턴. */
const DATASET_PATH = /^\/data\/\d+\/(openapi|fileData|standard|linkedData)\.do/;

/** 공공데이터포털 데이터셋·API 페이지를 네이버 웹검색 색인으로 찾는다. * query: 검색어, options: { display?: number } (기본 3). * host는 포털이므로 'www.data.go.kr', form은 'API' 또는 '파일'. * 실패를 빈 성공 배열로 삼키지 않는다(네이버 채널이 던진다면 함께 던진다). */
export async function searchPublicData(query, options = {}) {
  const display = options.display != null ? options.display : 3;
  // 색인이 질의마다 흔들린다 — 질의 형태 셋을 차례로 써서 채운다
  const forms = [`${query} data.go.kr`, `${query} 공공데이터포털 API`, `공공데이터포털 ${query}`];
  const seen = new Set();
  const out = [];
  for (const q of forms) {
    const items = await searchNaver(q, { kind: 'webkr', display: 10 });
    for (const it of items) {
      let u;
      try { u = new URL(it.url); } catch { continue; }
      if (!/(^|\.)data\.go\.kr$/.test(u.hostname) || !DATASET_PATH.test(u.pathname)) continue;
      const key = u.pathname.split('/')[2];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `public-data-${key}`,
        title: it.title.replace(/\s*[|·-]\s*공공데이터포털\s*$/, '').trim(),
        url: `https://www.data.go.kr${u.pathname}`,
        snippet: it.snippet,
        host: 'www.data.go.kr',
        form: /openapi/.test(u.pathname) ? 'API' : '파일',
      });
      if (out.length >= display) return out;
    }
  }
  return out;
}
