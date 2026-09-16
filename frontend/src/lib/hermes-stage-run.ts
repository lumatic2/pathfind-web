/** 단계 하나를 M4(Hermes)에 맡기고 결과를 Stage로 돌려받는다. */

import type { Stage } from "../state/types"
import { channelPlan, RateLimited } from "../lib/api"
import { stagePrompt, parseStageJson } from "../state/hermes-stage-text"
import { normalizeHermesFinding, hasSource } from "../state/hermes-findings"
import * as hermes from "./hermes"
import { collectRunResult } from "./hermes-run-result"
import { GatewayBusy } from "./hermes"

export interface HermesStageResume {
  runId: string
  cursor: number
}

export interface HermesStageOpts {
  resume?: HermesStageResume
  signal?: AbortSignal
  onRun?: (runId: string, cursor: number) => void
  onEvent?: (event: hermes.HermesEvent, cursor: number) => void
  onQuiet?: () => void
}

export async function researchHermesStage(
  stage: Stage,
  summary: string,
  opts?: HermesStageOpts,
): Promise<Stage | null> {
  const resume = opts?.resume
  const signal = opts?.signal
  if (signal?.aborted) return null
  let planned: { tool: string; queryHint: string; why?: string }[] = []
  if (!resume) {
    try {
      planned = (await channelPlan({ stage })).planned
    } catch {
      planned = []
    }
  }

  const prompt = stagePrompt(stage, summary, planned)
  let runId: string
  let cursor: number

  if (resume) {
    runId = resume.runId
    cursor = resume.cursor
  } else if (signal?.aborted) {
    return null
  } else {
    try {
      const started = await hermes.startRun(prompt)
      runId = started.runId
      cursor = 0
    } catch (e) {
      if (e instanceof hermes.GatewayBusy) throw new RateLimited()
      return null
    }
  }

  if (signal?.aborted) {
    hermes.stopRun(runId).catch(() => {})
    return null
  }

  opts?.onRun?.(runId, cursor)

  const onEvent = (event: hermes.HermesEvent, cursor: number) => {
    if (signal?.aborted) return
    opts?.onEvent?.(event, cursor)
  }
  const onQuiet = () => {
    if (signal?.aborted) return
    opts?.onQuiet?.()
  }

  try {
    const state = await collectRunResult(runId, {
      cursor,
      signal,
      onEvent,
      onQuiet,
    })
    if (signal?.aborted) return null
    if (state.status !== "completed") return null
    const parsed = parseStageJson(state.output)
    if (!parsed) return null

    const out: Stage = {
      ...stage,
      ...parsed,
      no: stage.no,
      title: stage.title,
      desc: stage.desc,
      icon: stage.icon,
    }

    if (Array.isArray(out.findings)) {
      out.findings = out.findings
        .map(normalizeHermesFinding)
        .filter(hasSource)
    }

    return out
  } catch (e) {
    if (e instanceof GatewayBusy) throw new RateLimited()
    return null
  }
}
