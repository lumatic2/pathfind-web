#!/usr/bin/env python3
"""
pathfind 렌더러의 서비스용 래퍼.

원래 render.py는 stdin JSON → 파일 출력 방식이지만,
서비스(/api)에서는 JSON 입력 → HTML/마크다운 문자열을 반환해야 한다.

이 모듈은 render.py의 validate·render_research_note·render_flow_html을
불러서, 서비스 핸들러에서 쓸 수 있게 한다.

사용:
    from service_render import render_from_dict
    result = render_from_dict(data)  # {'md': '...', 'html': '...', 'search_calls': n}
"""

import json
import re
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent / "pathfind-src"
TEMPLATE_PATH = SKILL_DIR / "assets" / "steps-flow-template.html"
ICONS_PATH = SKILL_DIR / "assets" / "lucide-icons.json"


def _load_icons() -> dict:
    try:
        data = json.loads(ICONS_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)}
    except (OSError, ValueError):
        pass
    return {}


def _fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(2)


def validate(data: dict) -> dict:
    """render.py의 validate를 그대로 사용. 복사본."""
    if not isinstance(data, dict):
        _fail("입력은 객체여야 합니다.")

    topic = data.get("topic")
    if not isinstance(topic, str) or topic.strip() == "":
        _fail("topic은 비어 있지 않은 문자열이어야 합니다.")

    out_md = data.get("out_md")
    if not isinstance(out_md, str) or out_md.strip() == "":
        _fail("out_md는 비어 있지 않은 문자열이어야 합니다.")

    out_html = data.get("out_html")
    if not isinstance(out_html, str) or out_html.strip() == "":
        _fail("out_html은 비어 있지 않은 문자열이어야 합니다.")

    search_calls = data.get("search_calls")
    if not isinstance(search_calls, int) or isinstance(search_calls, bool):
        _fail("search_calls은 정수여야 합니다.")

    steps = data.get("steps")
    if steps is None or not isinstance(steps, list) or len(steps) == 0:
        _fail("steps는 비어 있지 않은 배열이어야 합니다.")

    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            _fail(f"steps[{i}]는 객체여야 합니다.")
        _require(step, "no", f"steps[{i}].no")
        title = _require(step, "title", f"steps[{i}].title")
        _check_title_is_not_channel(title, i)
        _check_title_length(title, i)
        _require(step, "desc", f"steps[{i}].desc")
        _require(step, "verdict", f"steps[{i}].verdict")
        if step["verdict"] not in {"가져다 써도 됨", "직접 해야 함", "섞어야 함", "선례를 못 찾음"}:
            _fail(f"steps[{i}].verdict는 허용값 중 하나여야 합니다.")

        if "icon" in step and step["icon"] is not None and not isinstance(step["icon"], str):
            _fail(f"steps[{i}].icon은 문자열이어야 합니다.")

        findings = step.get("findings")
        if findings is None or not isinstance(findings, list):
            _fail(f"steps[{i}].findings은 배열이어야 합니다.")
        for j, f in enumerate(findings):
            if not isinstance(f, dict):
                _fail(f"steps[{i}].findings[{j}]는 객체여야 합니다.")
            _require(f, "kind", f"steps[{i}].findings[{j}].kind")
            if f["kind"] not in {"오픈소스", "무료 에셋", "튜토리얼·블로그", "참고 사례"}:
                _fail(f"steps[{i}].findings[{j}].kind는 허용값 중 하나여야 합니다.")
            _require(f, "name", f"steps[{i}].findings[{j}].name")
            _require(f, "query", f"steps[{i}].findings[{j}].query")
            if not isinstance(f["query"], str) or f["query"].strip() == "":
                _fail(f"steps[{i}].findings[{j}].query는 비어 있으면 안 됩니다.")
            _require(f, "evidence", f"steps[{i}].findings[{j}].evidence")
            if not isinstance(f["evidence"], str) or f["evidence"].strip() == "":
                _fail(f"steps[{i}].findings[{j}].evidence는 비어 있으면 안 됩니다.")
            _require(f, "note", f"steps[{i}].findings[{j}].note")
            if "url" not in f or f["url"] is None or (isinstance(f["url"], str) and f["url"].strip() == ""):
                _fail(f"steps[{i}].findings[{j}].url은 필수이며 비어 있으면 안 됩니다.")

        tasks = step.get("tasks")
        if tasks is not None:
            if not isinstance(tasks, list):
                _fail(f"steps[{i}].tasks은 배열이어야 합니다.")
            for j, t in enumerate(tasks):
                if not isinstance(t, dict):
                    _fail(f"steps[{i}].tasks[{j}]는 객체여야 합니다.")
                _require(t, "order", f"steps[{i}].tasks[{j}].order")
                _require(t, "task", f"steps[{i}].tasks[{j}].task")
                _require(t, "why", f"steps[{i}].tasks[{j}].why")

    return data


def _require(obj, key, label, allow_empty=False):
    if key not in obj or obj[key] is None:
        _fail(f"필수 키가 없거나 비어 있습니다: {label} ('{key}')")
    if isinstance(obj[key], str) and not allow_empty and obj[key].strip() == "":
        _fail(f"필수 키가 비어 있습니다: {label} ('{key}')")
    return obj[key]


def _title_contains_channel_noun(title: str) -> bool:
    nouns = ["오픈소스", "에셋", "튜토리얼", "블로그", "사례", "조사", "리서치", "검색", "찾아보기", "탐색"]
    nouns.sort(key=len, reverse=True)
    low = title.lower()
    for noun in nouns:
        if noun.lower() in low:
            return True
    return False


def _check_title_is_not_channel(title: str, i: int) -> None:
    if not isinstance(title, str):
        _fail(f"steps[{i}].title은 문자열이어야 합니다.")
    if _title_contains_channel_noun(title):
        _fail(f"steps[{i}].title에 검색 채널 명사가 들어갔습니다.")


def _title_approx_charable_len(title: str) -> int:
    if not isinstance(title, str) or title.strip() == "":
        return 0
    avail_px = 244
    per_char_px = 10.0
    max_chars = int(avail_px / per_char_px)
    width = 0.0
    for ch in title:
        o = ord(ch)
        if o > 0x2E7F:
            width += 1.0
        elif ch == ' ':
            width += 0.35
        else:
            width += 0.6
    return round(width)


def _check_title_length(title: str, i: int) -> None:
    if not isinstance(title, str):
        return
    if title.strip() == "":
        return
    chars = _title_approx_charable_len(title)
    if chars > 24:
        _fail(f"steps[{i}].title이 카드 한 줄 폭(약 24자)을 넘을 가능성이 큽니다.")


def render_research_note(data: dict) -> str:
    topic = data["topic"]
    steps = data["steps"]
    lines = [f"# 연구 노트: {topic}", ""]
    lines.append(f"> {topic} — 단계별로 이미 있는 것(오픈소스·무료 에셋·튜토리얼·참고 사례)을 찾고, 가져다 쓸지 직접 할지 가른 기록.")
    lines.append("")
    lines.append("## 단계 요약")
    lines.append("")
    lines.append("| # | 단계 | 판정 | 자료 수 |")
    lines.append("|---|------|------|--------|")
    for s in steps:
        lines.append(f"| {_cell(s['no'])} | {_cell(s['title'])} | {_cell(s['verdict'])} | {len(s['findings'])} |")
    lines.append("")
    lines.append("## 단계별 상세")
    lines.append("")
    for s in steps:
        lines.append(f"### {_txt(s['no'])}. {_txt(s['title'])}")
        lines.append("")
        lines.append(_txt(s["desc"]))
        lines.append("")
        verdict_line = f"**판정: {_txt(s['verdict'])}**"
        if s.get("verdictReason"):
            verdict_line += f" — {_txt(s['verdictReason'])}"
        lines.append(verdict_line)
        lines.append("")
        tasks = s.get("tasks") or []
        if tasks:
            lines.append("**이 단계에서 할 작업**")
            lines.append("")
            for t in sorted(tasks, key=lambda t: (0, t.get("order")) if isinstance(t.get("order"), (int, float)) else (1, str(t.get("order")))):
                line = f"{_txt(t.get('order'))}. {_txt(t.get('task'))}"
                if t.get("why"):
                    line += f" — {_txt(t.get('why'))}"
                lines.append(line)
            lines.append("")
        lines.append("**찾은 자료**")
        lines.append("")
        if not s["findings"]:
            lines.append("- 이 단계에서는 선례를 찾지 못했다.")
        else:
            by_kind = {}
            for f in s["findings"]:
                by_kind.setdefault(f["kind"], []).append(f)
            for kind in ["오픈소스", "무료 에셋", "튜토리얼·블로그", "참고 사례"]:
                for f in by_kind.get(kind, []):
                    lines.append(f"- [{kind}] [{_txt(f['name'])}]({_txt(f['url'])}) — {_txt(f['note'])}")
                    lines.append(f"  - 검색어: {_txt(f['query'])}")
                    lines.append(f"  - 근거(검색 결과 발췌): \\\"{_txt(f['evidence'])}\\\"")
        lines.append("")
    next_actions = []
    for s in steps:
        tasks = s.get("tasks") or []
        if tasks:
            next_actions.append(f"{len(next_actions) + 1}. [{_txt(s['title'])}] {_txt(tasks[0].get('task'))}")
    if next_actions:
        lines.append("## 다음 액션 (단계별 첫 작업)")
        lines.append("")
        lines.extend(next_actions)
        lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(f"검색 호출 {data['search_calls']}회 · 단계 {len(steps)}개 · 자료 {sum(len(s['findings']) for s in steps)}건")
    lines.append("")
    return "\n".join(lines)


def _cell(s) -> str:
    return str(s if s is not None else "").replace("|", "／").replace("\n", " ").strip()


def _txt(s) -> str:
    return str(s if s is not None else "").strip()


def render_flow_html(data: dict) -> str:
    if not TEMPLATE_PATH.is_file():
        _fail(f"템플릿 파일을 읽을 수 없습니다: {TEMPLATE_PATH}")
    template_text = TEMPLATE_PATH.read_text(encoding="utf-8")
    pattern = re.compile(r"const steps = \[.*?\];", re.DOTALL)
    m = pattern.search(template_text)
    if not m:
        _fail("템플릿에서 'const steps = [...]' 배열을 찾지 못했습니다.")
    icons = _load_icons()
    used = {"circle-dot"}
    for s in data["steps"]:
        if isinstance(s.get("icon"), str):
            used.add(s["icon"])
    icons_used = {k: icons[k] for k in sorted(used) if k in icons}
    steps_json = json.dumps(data["steps"], ensure_ascii=False)
    title_json = json.dumps(data["topic"], ensure_ascii=False)
    icons_json = json.dumps(icons_used, ensure_ascii=False)
    steps_json = steps_json.replace("</", "<\\/")
    title_json = title_json.replace("</", "<\\/")
    icons_json = icons_json.replace("</", "<\\/")
    injected = (
        f"const PATHFIND_TITLE = {title_json};\n"
        f"const PATHFIND_ICONS = {icons_json};\n"
        f"const steps = {steps_json};"
    )
    return template_text[:m.start()] + injected + template_text[m.end():]


def render_from_dict(data: dict) -> dict:
    """검증 → 마크다운 + HTML 문자열 반환. 서비스 핸들러용."""
    data = validate(data)
    return {
        "md": render_research_note(data),
        "html": render_flow_html(data),
        "search_calls": data["search_calls"],
        "steps_count": len(data["steps"]),
        "findings_count": sum(len(s["findings"]) for s in data["steps"]),
    }


if __name__ == "__main__":
    raw = sys.stdin.read()
    if not raw.strip():
        _fail("stdin 입력이 비어 있습니다.")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        _fail(f"stdin JSON을 파싱할 수 없습니다: {e}")
    result = render_from_dict(data)
    print(f"검증 통과: steps={result['steps_count']}, findings={result['findings_count']}, search_calls={result['search_calls']}")
    print(f"md 길이: {len(result['md'])} chars")
    print(f"html 길이: {len(result['html'])} chars")
