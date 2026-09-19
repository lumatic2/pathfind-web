import * as React from 'react';
import { cn } from '@/lib/utils';

const DialogContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
} | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const context = React.useContext(DialogContext);
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const openState = controlled ? open : internalOpen;
  const onOpenChangeImpl = React.useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );
  const value = context ?? { open: openState, onOpenChange: onOpenChangeImpl };
  return (
    <DialogContext.Provider value={value}>
      {React.Children.only(children)}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  children,
  showCloseButton = true,
  className,
  contentClassName,
  ...props
}: {
  children?: React.ReactNode;
  showCloseButton?: boolean;
  /** 바깥 고정 상자(`fixed inset-0`)의 클래스 — 바탕색을 여기 두면 오버레이(뒤 앱이 비치는 반투명)를 덮는다 */
  className?: string;
  /** 안쪽 내용 상자의 클래스(참조 구현 국소 추가 4차 step-11 — 상류 등재 대상). 세로로 꽉 찬 뷰어는 `h-full` 을 여기 준다 */
  contentClassName?: string;
  [key: string]: unknown;
}) {
  const { open, onOpenChange } = React.useContext(DialogContext)!;
  // 훅은 조기 반환보다 앞에 있어야 한다 — 열릴 때마다 훅 순서가 바뀌어 React 가 경고했다(ui-dictionary findings 2026-09-13, 2026-09-14 수정).
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])
  /**
   * **열릴 때 부드럽게** (참조 구현 국소 추가 — 8차 육안 3라운드, 2026-09-16 사용자
   * 「위 세개 다, 열 때 애니메이션 넣어서 부드럽게 해줘야 하고」. 상류 등재 대상).
   * ⚠ 연출은 **밝기만** 바꾼다 — 같은 라운드에서 인용 카드의 미끄러짐을 걷어내라고 했으므로 모달도 같은 결로 맞춘다.
   * ⚠ 한 프레임 뒤에 켠다 — 같은 프레임에 최종값을 주면 브라우저가 전환을 건너뛴다.
   */
  const [shown, setShown] = React.useState(false)
  React.useEffect(() => {
    if (!open) {
      setShown(false)
      return
    }
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [open])
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        className
      )}
      {...props}
    >
      <div
        className="fixed inset-0 bg-foreground/50"
        style={{ opacity: shown ? 1 : 0, transition: "opacity 140ms ease" }}
        onClick={() => onOpenChange(false)}
      />
      <div
        style={{ opacity: shown ? 1 : 0, transition: "opacity 140ms ease" }}
        className={cn("relative z-10 flex max-h-[calc(100%-2rem)] w-full max-w-none flex-col overflow-auto rounded-xl bg-card p-4 shadow-lg", contentClassName)}
      >
        {showCloseButton && (
          <button
            type="button"
            className="absolute right-3 top-3 rounded-md p-1 text-foreground/60 hover:bg-foreground/10 hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenChange(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function DialogTitle({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) {
  return (
    <div
      role="heading"
      aria-level={2}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogDescription({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) {
  return (
    <p className={cn('text-sm text-foreground/60', className)} {...props}>
      {children}
    </p>
  );
}
