import React from 'react';
import { createRoot } from 'react-dom/client';

// 앱 진입점 — 빈 껍데기 app.html의 <div id="root">에 마운트
// 모든 데이터는 /api/* fetch로. 기존 render/mindmap/mock/state/events는 버리고
// actions.js 로직은 순수 함수 모듈로 이식한다.
// 셸은 후행 과제에서 NotebookMindmapShellDemo 기반 컴포넌트를 넣는다.

function App() {
  return (
    <div className="app-root">
      <header className="app-header">
        <div className="brand">
          <h1 className="brand-title">pathfind</h1>
          <span className="brand-sub">하려는 일의 단계를 찾고, 이미 있는 자료부터 챙기기</span>
        </div>
        <div className="toprow">
          <span className="status-pill" data-status="ready">준비</span>
          <button type="button" className="btn btn-ghost btn-sm">다시 시작</button>
        </div>
      </header>
      <main className="app-wrap">
        <section className="panel-left">
          <div className="panel-head">
            <span className="label">정렬 인터뷰</span>
            <span className="turn">1/5</span>
          </div>
          <div className="message-list" data-empty="true">
            <p className="empty-hint">시작하면 여기에 인터뷰가 쌓입니다.</p>
          </div>
          <div className="input-area hidden">
            <label className="field-label" htmlFor="questionInput">만들려는 일을 한 문단으로 적어 주세요</label>
            <textarea id="questionInput" className="field-textarea" rows={4} placeholder="예: 퇴직하고 작은 공방을 열었는데, 예약 관리와 안내 문구를 정리할 간단한 홈페이지가 필요하다." />
            <div className="examples">
              <button className="example-btn" type="button">가게 홈페이지</button>
              <button className="example-btn" type="button">자료 정리 방법</button>
              <button className="example-btn" type="button">모임 안내 페이지</button>
              <button className="example-btn" type="button">기록·영상 정리</button>
            </div>
            <div className="toprow">
              <button type="button" className="btn btn-primary">시작 — 정렬 인터뷰</button>
              <span className="hint">예시 버튼을 누르면 내용이 채워집니다.</span>
            </div>
          </div>
        </section>
        <section className="panel-right">
          <div className="panel-head">
            <span className="label">큰 그림 · 단계별 경로</span>
            <span className="hint" data-hint=""></span>
            <div className="view-toggle">
              <button type="button" className="btn btn-sm view-toggle-btn active">마인드맵</button>
              <button type="button" className="btn btn-sm view-toggle-btn">목록</button>
            </div>
          </div>
          <div className="stage-list" data-empty="true">
            <p className="empty-hint">아직 큰 그림이 없습니다. 인터뷰를 진행하면 오른쪽이 채워집니다.</p>
          </div>
          <div className="mindmap-view" data-empty="true">
            <p className="empty-hint">마인드맵 뷰</p>
          </div>
          <div className="section-title">구현 핸드오프 문서</div>
          <div className="handoff-box">
            <div className="toprow">
              <button type="button" className="btn btn-sm">복사</button>
              <button type="button" className="btn btn-sm">다운로드 (handoff.md)</button>
              <span className="hint">구현을 이어갈 코딩 에이전트에 넣으세요.</span>
            </div>
            <pre className="handoff-pre"></pre>
          </div>
        </section>
      </main>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('<div id="root">를 app.html에서 찾을 수 없습니다.');
}

createRoot(rootEl).render(<React.StrictMode><App /></React.StrictMode>);
