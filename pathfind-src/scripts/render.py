#!/usr/bin/env python3
"""
pathfind 스킬용 결과물 렌더러.

사용법:
    python render.py < json_input.json
  또는
    cat some.json | python render.py
  또는
    python render.py <<'PYEOF'
    {"topic": "...", ...}
    PYEOF

입력(JSON)은 stdin으로 받는다. 표준 라이브러리만 사용한다.
"""

import json
import re
import sys
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_PATH = SKILL_DIR / "assets" / "steps-flow-template.html"

ICONS_PATH = SKILL_DIR / "assets" / "lucide-icons.json"
DEFAULT_ICON = "circle-dot"
KIND_ORDER = ["오픈소스", "무료 에셋", "튜토리얼·블로그", "참고 사례"]

ALLOWED_VERDICTS = frozenset([
    "가져다 써도 됨",
    "직접 해야 함",
    "섞어야 함",
    "선례를 못 찾음",
])

ALLOWED_KINDS = frozenset([
    "오픈소스",
    "무료 에셋",
    "튜토리얼·블로그",
    "참고 사례",
])

# 단계 제목에 검색 채널 명사가 들어가면, 단계와 채널을 한 층으로 납작하게 섞은 것이므로 거부한다.
# 매칭은 아래 정확한 채널 명사 목록의 부분문자열 검사로만 수행한다. 동사나 조합어를 추론으로 걸러내지 않는다.
_CHANNEL_NOUNS = [
    "오픈소스",
    "에셋",
    "튜토리얼",
    "블로그",
    "사례",
    "조사",
    "리서치",
    "검색",
    "찾아보기",
    "탐색",
]

# 부분문자열 매칭이므로 순서는 긴 것이 먼저 오도록 정렬 (겹치는 용어가 있을 때 일관되게 동작하도록)
_CHANNEL_NOUNS.sort(key=len, reverse=True)

def _title_contains_channel_noun(title: str) -> bool:
    low = title.lower()
    for noun in _CHANNEL_NOUNS:
        if noun.lower() in low:
            return True
    return False

CHANNEL_TITLE_HINT = (
    "steps[{i}].title에 검색 채널 명사가 들어갔습니다. "
    "단계 제목은 그 작업에서 실제로 하는 일로 적어야 합니다(예: 계획, 설계, 구현, 검증, 배포). "
    "오픈소스·무료 에셋·튜토리얼·블로그는 단계 제목이 아니라 findings의 kind로 넣으세요. "
    "각 단계 안에서 필요한 것을 findings로 찾고, kind는 '오픈소스'/'무료 에셋'/'튜토리얼·블로그'/'참고 사례' 중 하나로 씁니다."
)

def _check_title_is_not_channel(title: str, i: int) -> None:
    if not isinstance(title, str):
        _fail(f"steps[{i}].title은 문자열이어야 합니다.")
    if _title_contains_channel_noun(title):
        _fail(CHANNEL_TITLE_HINT.format(i=i))


def _title_approx_charable_len(title: str) -> int:
    """제목이 한 줄에 들어갈 수 있는 글자 수를 근사한다.

    템플릿 카드 폭 상한(max-width 280px) + 내부 패딩(18px×2)을 뺀 가용 폭 약 244px,
    제목 폰트 18px 산세리프의 평균 글자 폭을 보수적으로 10px로 잡아
    한 줄 약 24자 수준에서 넘치면 위험으로 본다.

    CJK 글자는 1글자당 1폭, ASCII·숫자는 0.55폭 정도로 근사.
    """
    if not isinstance(title, str) or title.strip() == "":
        return 0
    avail_px = 244  # 카드 내부 가용 폭 근사
    per_char_px = 10.0
    max_chars = int(avail_px / per_char_px)  # 약 24

    width = 0.0
    for ch in title:
        o = ord(ch)
        if o > 0x2E7F:          # 한글·CJK 계열은 1폭
            width += 1.0
        elif ch == ' ':
            width += 0.35
        else:                    # ASCII·숫자·기호 등
            width += 0.6
    return round(width)


MAX_TITLE_CHARS = 24

SHORT_TITLE_HINT = (
    "steps[{i}].title('{bad}')이(가) 카드 한 줄 폭(약 {maxc}자)을 넘을 가능성이 큽니다. "
    "render.py가 카드를 화면에 맞춰 다듬어 주지 않으므로, 단계 제목은 한 줄에 들어가는 짧은 문구로 직접 적어 주세요. "
    "예: '{good}'."
)


def _check_title_length(title: str, i: int) -> None:
    if not isinstance(title, str):
        return
    if title.strip() == "":
        return
    chars = _title_approx_charable_len(title)
    if chars > MAX_TITLE_CHARS:
        # 예시가 실제로 통과하는지: 아래에서 검증된 값만 예시로 쓴다.
        good_example = _pick_short_title_example(title)
        _fail(SHORT_TITLE_HINT.format(i=i, bad=title, maxc=MAX_TITLE_CHARS, good=good_example))


def _pick_short_title_example(long_title: str) -> str:
    """위반 제목을 받아, 실제로 길이 검사를 통과하는 짧은 예시로 바꿔 돌려준다.

    스크립트 자체 점검에 포함되므로, 반환값은 반드시 _title_approx_charable_len 기준 MAX_TITLE_CHARS 이하여야 한다.
    """
    core = long_title.strip()
    if not core:
        return "검토"
    # CJK 글자만 남도록 압축해 한 줄 가능한 길이로 자른다.
    reduced = ""
    for ch in core:
        if _title_approx_charable_len(reduced + ch) <= MAX_TITLE_CHARS:
            reduced += ch
        else:
            break
    if not reduced:
        reduced = core[0]
    return reduced


def _self_check_example_titles_pass() -> None:
    """에러 메시지가 예시로 드는 제목들은 반드시 모든 검사를 통과해야 한다. 하나라도 걸리면 바로 실패한다."""
    example_titles = ["계획", "설계", "구현", "검증", "배포",
                      "단계 제목 다듬기 예시", "못생긴 긴 제목을 짧게"]
    failed = []
    for idx, t in enumerate(example_titles):
        if _title_contains_channel_noun(t):
            failed.append(f"예시 제목이 채널 검사에 걸렸습니다(steps[{idx}] 제목='{t}'). "
                         f"스크립트가 제시한 해법 자체가 스크립트를 통과하지 못합니다. "
                         f"채널 검사를 실제 채널 명사(오픈소스, 에셋, 튜토리얼, 블로그, 사례, 조사, 리서치, 검색, 찾아보기, 탐색)의 "
                         f"부분문자열 검사로만 좁혀야 합니다.")
        if _title_approx_charable_len(t) > MAX_TITLE_CHARS:
            failed.append(f"예시 제목이 길이 검사에 걸렸습니다(steps[{idx}] 제목='{t}', 근사 글자수={_title_approx_charable_len(t)} > {MAX_TITLE_CHARS}). "
                         f"스크립트가 제시한 해법 자체가 스크립트를 통과하지 못합니다. "
                         f"길이 검사 기준(카드 한 줄 폭 근사 {MAX_TITLE_CHARS}자)을 먼저 조정하세요.")
        # _pick_short_title_example 자체도 항상 통과값을 내는지 점검
        ex = _pick_short_title_example(t)
        if _title_approx_charable_len(ex) > MAX_TITLE_CHARS:
            failed.append(f"_pick_short_title_example('{t}') → '{ex}'이(가) 여전히 길이 검사(MAX_TITLE_CHARS={MAX_TITLE_CHARS})를 통과하지 못합니다. "
                         f"단축 로직이 예시 약속을 지키지 않습니다.")
    if failed:
        _fail("\n" + "\n".join(failed))


def _fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(2)


def _require(obj, key, label, allow_empty=False):
    if key not in obj or obj[key] is None:
        _fail(f"필수 키가 없거나 비어 있습니다: {label} ('{key}')")
    if isinstance(obj[key], str) and not allow_empty and obj[key].strip() == "":
        _fail(f"필수 키가 비어 있습니다: {label} ('{key}')")
    return obj[key]


def _load_icons() -> dict:
    """아이콘 사전을 읽는다. 파일이 없거나 깨져 있어도 실패시키지 않는다 — 아이콘은 장식이고 흐름도는 기본 아이콘으로 그려진다."""
    try:
        data = json.loads(ICONS_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)}
    except (OSError, ValueError):
        pass
    return {}


def validate(data: dict) -> dict:
    """필수 키/타입/허용값 검증을 수행하고, 통과하면 data를 그대로 돌려준다."""
    # 스크립트 내부 점검: 에러 메시지 예시가 실제로 검사를 통과하는지 확인한다.
    _self_check_example_titles_pass()

    if not isinstance(data, dict):
        _fail("stdin JSON의 최상위 객체가 dict가 아닙니다.")

    topic = _require(data, "topic", "topic (파일명 산출용 주제)")
    if not isinstance(topic, str):
        _fail("topic은 문자열이어야 합니다.")

    out_md = _require(data, "out_md", "out_md (연구노트 출력 파일명)")
    if not isinstance(out_md, str):
        _fail("out_md는 문자열이어야 합니다.")
    out_html = _require(data, "out_html", "out_html (흐름도 출력 파일명)")
    if not isinstance(out_html, str):
        _fail("out_html는 문자열입니다.")

    steps = data.get("steps")
    if steps is None or not isinstance(steps, list) or len(steps) == 0:
        _fail("steps는 비어 있지 않은 배열이어야 합니다.")

    search_calls = data.get("search_calls")
    if search_calls is None or not isinstance(search_calls, int) or isinstance(search_calls, bool):
        _fail("search_calls이 없거나 정수가 아닙니다. 이번 조사에서 실제로 수행한 웹 검색 호출 횟수를 정수로 넣어야 합니다.")

    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            _fail(f"steps[{i}]는 객체여야 합니다.")
        _require(step, "no", f"steps[{i}].no")
        _require(step, "title", f"steps[{i}].title")
        _check_title_is_not_channel(step["title"], i)
        _check_title_length(step["title"], i)
        _require(step, "desc", f"steps[{i}].desc")
        _require(step, "verdict", f"steps[{i}].verdict")
        if step["verdict"] not in ALLOWED_VERDICTS:
            _fail(f"steps[{i}].verdict는 허용값 중 하나여야 합니다: {sorted(ALLOWED_VERDICTS)}")

        findings = step.get("findings")
        if findings is None or not isinstance(findings, list):
            _fail(f"steps[{i}].findings은 배열이어야 합니다.")
        for j, f in enumerate(findings):
            if not isinstance(f, dict):
                _fail(f"steps[{i}].findings[{j}]는 객체여야 합니다.")
            _require(f, "kind", f"steps[{i}].findings[{j}].kind")
            if f["kind"] not in ALLOWED_KINDS:
                _fail(f"steps[{i}].findings[{j}].kind는 허용값 중 하나여야 합니다: {sorted(ALLOWED_KINDS)}")
            _require(f, "name", f"steps[{i}].findings[{j}].name")
            _require(f, "query", f"steps[{i}].findings[{j}].query")
            if not isinstance(f["query"], str) or f["query"].strip() == "":
                _fail(f"steps[{i}].findings[{j}].query는 비어 있으면 안 됩니다. (위치: steps[{i}].findings[{j}])")
            _require(f, "evidence", f"steps[{i}].findings[{j}].evidence")
            if not isinstance(f["evidence"], str) or f["evidence"].strip() == "":
                _fail(f"steps[{i}].findings[{j}].evidence는 검색 결과 텍스트에서 그대로 옮긴 한 문장이어야 하며 비어 있으면 안 됩니다. (위치: steps[{i}].findings[{j}])")
            _require(f, "note", f"steps[{i}].findings[{j}].note")
            if "url" not in f or f["url"] is None or (isinstance(f["url"], str) and f["url"].strip() == ""):
                _fail(f"steps[{i}].findings[{j}].url은 필수이며 비어 있으면 안 됩니다. URL이 없는 발견은 이 항목을 넣지 않아야 합니다 — 해당 발견 자체를 제외하세요. (위치: steps[{i}].findings[{j}])")

        if "icon" in step and step["icon"] is not None and not isinstance(step["icon"], str):
            _fail(f"steps[{i}].icon은 문자열이어야 합니다(예: 'compass').")

        # tasks(선택): 있으면 각 항목이 {order, task, why} 모양인지 검증. 없으면 기존 JSON 그대로 통과.
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
                if not isinstance(t["task"], str) or t["task"].strip() == "":
                    _fail(f"steps[{i}].tasks[{j}].task는 비어 있으면 안 됩니다. (위치: steps[{i}].tasks[{j}])")
                if not isinstance(t["why"], str) or t["why"].strip() == "":
                    _fail(f"steps[{i}].tasks[{j}].why는 비어 있으면 안 됩니다. (위치: steps[{i}].tasks[{j}])")
        # tasks가 없으면 desc로 폴백하므로 아무것도 검증하지 않는다 — 거짓 양성을 만들지 않음.

    return data


def _cell(s) -> str:
    """표 셀용: 파이프와 줄바꿈만 치운다. HTML 이스케이프는 하지 않는다(마크다운이라 그대로 보인다)."""
    return str(s if s is not None else "").replace("|", "／").replace("\n", " ").strip()

def _txt(s) -> str:
    return str(s if s is not None else "").strip()

def _sorted_tasks(step: dict) -> list:
    tasks = step.get("tasks") or []
    def _key(t):
        o = t.get("order")
        return (0, o) if isinstance(o, (int, float)) else (1, str(o))
    return sorted(tasks, key=_key)

def render_research_note(data: dict) -> str:
    topic = _txt(data["topic"])
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
        if _txt(s.get("verdictReason")):
            verdict_line += f" — {_txt(s['verdictReason'])}"
        lines.append(verdict_line)
        lines.append("")

        tasks = _sorted_tasks(s)
        if tasks:
            lines.append("**이 단계에서 할 작업**")
            lines.append("")
            for t in tasks:
                line = f"{_txt(t.get('order'))}. {_txt(t.get('task'))}"
                if _txt(t.get("why")):
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
            for kind in KIND_ORDER:
                for f in by_kind.get(kind, []):
                    lines.append(f"- [{kind}] [{_txt(f['name'])}]({_txt(f['url'])}) — {_txt(f['note'])}")
                    lines.append(f"  - 검색어: {_txt(f['query'])}")
                    lines.append(f"  - 근거(검색 결과 발췌): \"{_txt(f['evidence'])}\"")
        lines.append("")

    # 다음 액션: 각 단계의 첫 번째 작업을 순서대로 모은다. 작업이 하나도 없으면 절 자체를 생략한다.
    next_actions = []
    for s in steps:
        tasks = _sorted_tasks(s)
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


def render_flow_html(data: dict) -> str:
    """템플릿을 읽어 steps 배열을 교체하고 PATHFIND_TITLE·PATHFIND_ICONS 상수를 주입한 HTML을 돌려준다. 템플릿 없이는 실패."""
    if not TEMPLATE_PATH.is_file():
        _fail(f"템플릿 파일을 읽을 수 없습니다: {TEMPLATE_PATH}")
    template_text = TEMPLATE_PATH.read_text(encoding="utf-8")

    pattern = re.compile(r"const steps = \[.*?\];", re.DOTALL)
    m = pattern.search(template_text)
    if not m:
        _fail("템플릿에서 'const steps = [...]' 배열을 찾지 못했습니다. 템플릿 형식이 변경됐는지 확인하세요.")

    # 쓰인 아이콘(+기본 아이콘)만 골라 넣는다. 사전에 없는 이름은 템플릿이 기본 아이콘으로 대체한다.
    icons = _load_icons()
    used = {DEFAULT_ICON}
    for s in data["steps"]:
        if isinstance(s.get("icon"), str):
            used.add(s["icon"])
    icons_used = {k: icons[k] for k in sorted(used) if k in icons}

    steps_json = json.dumps(data["steps"], ensure_ascii=False)
    title_json = json.dumps(data["topic"], ensure_ascii=False)
    icons_json = json.dumps(icons_used, ensure_ascii=False)
    # JS 문자열 리터럴 안에서 '</script>' 가 스크립트를 조기 종료시키지 않도록
    steps_json = steps_json.replace("</", "<\\/")
    title_json = title_json.replace("</", "<\\/")
    icons_json = icons_json.replace("</", "<\\/")

    injected = (
        f"const PATHFIND_TITLE = {title_json};\n"
        f"const PATHFIND_ICONS = {icons_json};\n"
        f"const steps = {steps_json};"
    )
    return template_text[:m.start()] + injected + template_text[m.end():]


def is_subpath_of(candidate: Path, root: Path) -> bool:
    """candidate가 root 아래(또는 root 자신)에 있는지 확인."""
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        _fail("stdin 입력이 비어 있습니다. JSON을 stdin으로 전달하세요.")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        _fail(f"stdin JSON을 파싱할 수 없습니다: {e}")

    data = validate(data)

    workdir = Path.cwd().resolve()

    out_md_name = data["out_md"]
    out_html_name = data["out_html"]

    out_md_path = (workdir / out_md_name).resolve()
    out_html_path = (workdir / out_html_name).resolve()

    # 작업공간 밖으로 나가는 경로를 막기 위한 안전 확인
    if not is_subpath_of(out_md_path, workdir):
        _fail(f"out_md 경로가 작업공간 밖으로 나갑니다: {out_md_path}")
    if not is_subpath_of(out_html_path, workdir):
        _fail(f"out_html 경로가 작업공간 밖으로 나갑니다: {out_html_path}")

    md_text = render_research_note(data)
    out_md_path.write_text(md_text, encoding="utf-8")
    md_bytes = out_md_path.stat().st_size

    html_text = render_flow_html(data)
    out_html_path.write_text(html_text, encoding="utf-8")
    html_bytes = out_html_path.stat().st_size

    # 상대 경로(stdout에 찍을 용도)
    md_rel = out_md_path.relative_to(workdir).as_posix()
    html_rel = out_html_path.relative_to(workdir).as_posix()

    print(f"검색 호출 횟수: {data['search_calls']}")
    print(f"연구노트: ./{md_rel} — {md_bytes}바이트")
    print(f"흐름도 설계도: ./{html_rel} — {html_bytes}바이트")


if __name__ == "__main__":
    main()
