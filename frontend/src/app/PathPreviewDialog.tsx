import { useCallback } from 'react'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AppDialogContent } from './AppDialogContent'
import { cn } from '@/lib/utils'
import { downloadText } from '../lib/api'

interface PathPreviewDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  text: string | null
  busy: boolean
  error: string | null
  onRetry: () => void
  onDownload: () => void
}

export function PathPreviewDialog({
  open,
  onOpenChange,
  text,
  busy,
  error,
  onRetry,
  onDownload,
}: PathPreviewDialogProps) {
  const hasText = text != null && text.trim().length > 0

  const handleDownload = useCallback(() => {
    if (hasText) {
      downloadText('PATH.md', text!)
    }
  }, [hasText, text])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="max-w-2xl" data-path-dialog showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>PATH.md 미리보기</DialogTitle>
          <DialogDescription>
            조사한 내용을markdown 문서로 정리한 파일입니다.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">PATH.md를 만드는 중이에요.</p>
          </div>
        ) : error != null ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 text-sm text-foreground underline underline-offset-2 hover:text-muted-foreground"
            >
              다시 만들기
            </button>
          </div>
        ) : !hasText ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">
              아직 PATH.md가 없습니다. 조사가 끝나면 이곳에 표시됩니다.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed max-h-96">
              {text}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-sm text-foreground underline underline-offset-2 hover:text-muted-foreground"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={!hasText}
                className={cn(
                  'ml-auto text-sm text-foreground underline underline-offset-2 hover:text-muted-foreground disabled:opacity-40 disabled:pointer-events-none',
                )}
              >
                내려받기
              </button>
            </DialogFooter>
          </>
        )}
      </AppDialogContent>
    </Dialog>
  )
}
