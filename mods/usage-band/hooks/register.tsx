import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { UsageSnapshot, UsageWindow } from '../types'

/** 残り時間の表示を新しく保つため、この間隔で数値を再取得する。 */
const REFRESH_MS = 60_000

const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null)
const PANE = 'usage-band'
const TITLE = 'Claude使用量'

const ORDER = ['five_hour', 'seven_day']
const LABELS: Record<string, string> = {
  five_hour: '本日 (5時間枠)',
  seven_day: '今週 (7日枠)',
  spend_limit: '支出上限',
}

const toWindows = (limits: readonly SessionRateLimit[]): UsageWindow[] =>
  [...limits]
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt ?? null }))
    .sort((a, b) => rank(a.kind) - rank(b.kind))

const rank = (kind: string) => {
  const i = ORDER.indexOf(kind)
  return i === -1 ? ORDER.length : i
}

const label = (kind: string) => LABELS[kind] ?? kind

/** ISO形式のリセット時刻と現在時刻から「あと2時間13分」の形の文字列を作る。 */
const remaining = (resetsAt: string | null, now: number): string | null => {
  if (resetsAt === null) return null
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return null
  const ms = at - now
  if (ms <= 0) return 'まもなく'
  const minutes = Math.ceil(ms / 60_000)
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  const mins = minutes % 60
  if (days > 0) return `あと${days}日${hours}時間`
  if (hours > 0) return `あと${hours}時間${mins}分`
  return `あと${mins}分`
}

const bar = (percent: number, width: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const tone = (percent: number) =>
  percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success'

const describe = (snap: UsageSnapshot | null): string => {
  if (snap === null) return 'Claude使用量: まだ取得されていません（最初の応答後に表示されます）'
  if (snap.windows.length === 0) return 'Claude使用量: データなし（サブスクリプション以外では表示されません）'
  return snap.windows
    .map(w => {
      const left = remaining(w.resetsAt, snap.at)
      return `${label(w.kind)}: ${w.percentUsed}%${left ? `（リセット${left}）` : ''}`
    })
    .join('\n')
}

async function refresh($: EngineInterface, limits?: readonly SessionRateLimit[]) {
  const rateLimits = limits ?? (await $.session.usage()).rateLimits
  const at = await $.clock.now()
  await update($, snapshot, () => ({ windows: toWindows(rateLimits), at }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-band',
      description: 'Claude使用量（本日・今週）をパネルに表示する。`hide` でパネルを閉じる',
      argumentHint: '[show|hide]',
    })
    await refresh($)
    $.clock.every(REFRESH_MS, () => {
      void refresh($)
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  // エンジンは各ターンの後と、枠の使用率が1ポイント動くたびに数値を送ってくる。
  on('session.measure', async ($, e, next) => {
    await refresh($, e.rateLimits)

    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async ($, e) => {
    if (e.args.trim() === 'hide') {
      await $.ui.close({ id: PANE })
      return { text: 'パネルを閉じました。/usage-band で再表示します。' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    const snap = await read($, snapshot)

    return { text: describe(snap) + '\n（パネルに表示中。/usage-band hide で閉じる）' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const snap = await read($, snapshot)
    const { Box, Text } = $.ui.resolve(e)

    if (snap === null || snap.windows.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{describe(snap)}</Text>
        </Box>
      )
    }

    const barWidth = Math.max(6, Math.min(20, e.props.bodyColumns - 22))

    return (
      <Box flexDirection="column">
        {snap.windows.map(w => {
          const left = remaining(w.resetsAt, snap.at)
          return (
            <Box key={w.kind} flexDirection="column">
              <Text bold>{label(w.kind)}</Text>
              <Box>
                <Text color={tone(w.percentUsed)}>{bar(w.percentUsed, barWidth)}</Text>
                <Text bold> {w.percentUsed}%</Text>
              </Box>
              {left && <Text dimColor>リセット{left}</Text>}
            </Box>
          )
        })}
      </Box>
    )
  })
}
