// 브라우저당 로드맵 실행 횟수 제한. 세션과 다른 키라 새 로드맵을 시작해도 줄어든다.
import { STORAGE_KEYS } from "./types"
import { useEffect, useState } from "react"

export const QUOTA_TOTAL = 2

type QuotaRead = { used: number; remaining: number }

function readUsed(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.quota)
    if (raw == null) return 0
    const parsed = JSON.parse(raw)
    if (typeof parsed?.used !== "number" || !Number.isFinite(parsed.used)) return 0
    return Math.max(0, Math.floor(parsed.used))
  } catch {
    return 0
  }
}

export function readQuota(): QuotaRead {
  const used = readUsed()
  const remaining = Math.max(0, QUOTA_TOTAL - used)
  return { used, remaining }
}

export function consumeQuota(): QuotaRead {
  const prev = readUsed()
  const next = Math.min(QUOTA_TOTAL, prev + 1)
  try {
    localStorage.setItem(
      STORAGE_KEYS.quota,
      JSON.stringify({ used: next, updatedAt: new Date().toISOString() }),
    )
  } catch {
    // 저장 실패해도 반환값은 계산된 값으로 둔다
  }
  const remaining = Math.max(0, QUOTA_TOTAL - next)
  return { used: next, remaining }
}

export function useQuota(): QuotaRead {
  const [quota, setQuota] = useState(readQuota)

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.quota) return
      // 같은 탭에서 바꾼 저장은 이벤트를 타지 않거나, 타도 재확인만 한다
      setQuota(readQuota())
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  return quota
}
