import * as React from "react"

import { cn } from "@/lib/utils"

type EditableTextProps = {
  value: string
  onChange: (value: string) => void
  /** 렌더할 태그 — 제목이면 h1/h3 */
  as?: "h1" | "h2" | "h3" | "span" | "div"
  /** 빈 값으로 확정하면 이 값으로 되돌린다(기본: 직전 값) */
  fallback?: string
  className?: string
  style?: React.CSSProperties
  "aria-label"?: string
} & Record<`data-${string}`, unknown>

/**
 * 제자리 편집 텍스트 — 평소엔 제목처럼 보이고, 클릭하면 그 자리에서 고친다(plaintext-only contentEditable).
 * Enter = 확정(blur), Escape = 되돌리기, blur = 확정. 빈 값은 `fallback`(없으면 직전 값)으로 되돌린다.
 * hover 에 옅은 상태층, 편집 중에는 포커스 링 — 「고칠 수 있다」는 신호를 글자 밖 배경으로만 준다(원본: 편집 input r4).
 */
function EditableText({ value, onChange, as: Tag = "span", fallback, className, style, "aria-label": ariaLabel, ...rest }: EditableTextProps) {
  const ref = React.useRef<HTMLElement>(null)
  const before = React.useRef(value)
  // 밖에서 value 가 바뀌면 DOM 도 따라간다(편집 중이 아닐 때만)
  React.useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value
  }, [value])
  const commit = () => {
    const el = ref.current
    if (!el) return
    const next = (el.textContent ?? "").replace(/\s+/g, " ").trim()
    const out = next || fallback || before.current
    if (el.textContent !== out) el.textContent = out
    if (out !== value) onChange(out)
  }
  return (
    <Tag
      ref={ref as React.RefObject<never>}
      role="textbox"
      aria-label={ariaLabel}
      tabIndex={0}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      data-slot="editable-text"
      className={cn(
        "-mx-1 cursor-text rounded-sm px-1 outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2 focus:bg-transparent",
        className,
      )}
      style={style}
      onFocus={() => {
        before.current = value
      }}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter") {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).blur()
        } else if (e.key === "Escape") {
          e.preventDefault()
          e.currentTarget.textContent = before.current
          ;(e.currentTarget as HTMLElement).blur()
        }
      }}
      {...rest}
    >
      {value}
    </Tag>
  )
}

export { EditableText }
