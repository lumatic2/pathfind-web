declare module "*.css" {
  const css: string;
  export default css;
}

declare module "@/components/ui/dialog" {
  import * as React from "react";
  import {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogTrigger,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
  } from "@/components/ui/dialog";
  export {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogTrigger,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
  };
  export type { };
  // 신규 레지스트리 판은 showCloseButton prop을 노출하지 않는다.
  // 호출 측이 이 prop을 쓰려면 TypeScript 수준에서 허용한다.
  namespace DialogContentOverrides {
    export interface DialogContentProps {
      showCloseButton?: boolean;
    }
  }
}
