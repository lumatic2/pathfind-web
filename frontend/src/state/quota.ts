/**
 * 남은 로드맵 횟수. **세션과 별도로** 보관한다 — 「새 로드맵」이 세션을 지워도 횟수는 남아야 한다.
 *
 * ⚠ 이것은 강제가 아니라 제한이다. 브라우저에 기록하므로 시크릿 창·데이터 삭제로 초기화된다.
 * 신원을 아는 척하는 문구를 쓰지 않는 이유가 여기 있다(`docs/app-ux-copy.md` §1).
 * 로그인이 붙는 날 이 파일은 서버 쿼터 조회로 바뀐다.
 */
import { useCallback, useEffect, useState } from "react"

/**
 * **무제한** (2026-09-17 사용자 지시). 참조 구현이고 현장에서 몇 번이고 다시 보여 줘야 하므로
 * 횟수 제한이 의미가 없다 — 시연 도중 2회를 다 쓰면 그대로 막힌다.
 * 아래 상한과 소비 기록은 지우지 않고 남겨 둔다. 공개 서비스로 돌아갈 때 이 플래그만 끄면 된다.
 */
export const QUOTA_UNLIMITED = true
export const QUOTA_TOTAL = 2
const QUOTA_KEY = "pathfind.quota.v1"

function readUsed(): number {
  try {
    const raw = localStorage.getItem(QUOTA_KEY)
    if (!raw) return 0
    const n = JSON.parse(raw)?.used
    return Number.isInteger(n) && n >= 0 ? Math.min(n, QUOTA_TOTAL) : 0
  } catch {
    return 0
  }
}

export function useQuota() {
  const [used, setUsed] = useState(readUsed)

  // 다른 탭에서 한 번 쓰면 이 탭의 배지도 따라간다
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === QUOTA_KEY) setUsed(readUsed())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  /** 승인 시점에 한 번 부른다(`docs/app-ux-copy.md` §3-2 — 줄어드는 순간을 누르기 전에 알린다). */
  const consume = useCallback(() => {
    setUsed((cur) => {
      const next = Math.min(cur + 1, QUOTA_TOTAL)
      try {
        localStorage.setItem(QUOTA_KEY, JSON.stringify({ used: next }))
      } catch {
        /* 저장만 못 할 뿐 화면은 계속 돈다 */
      }
      return next
    })
  }, [])

  const remaining = Math.max(0, QUOTA_TOTAL - used)
  // 무제한이면 소진 판정을 하지 않는다 — 소비 기록은 그대로 쌓이되 아무것도 막지 않는다.
  return { remaining, total: QUOTA_TOTAL, unlimited: QUOTA_UNLIMITED, exhausted: QUOTA_UNLIMITED ? false : remaining === 0, consume }
}
