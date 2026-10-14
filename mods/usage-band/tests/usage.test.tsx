import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

const PLUGIN = 'usage-band'
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const NOW = Date.UTC(2026, 9, 13, 3, 0, 0)

const PROPS: RenderPropsOf['Pane'] = {
  title: 'Claude使用量',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const PANE = { plugin: PLUGIN, component: 'Pane', requestId: 'usage-band', props: PROPS } as const

const measure = ($: Engine) =>
  $.session.measure({
    context: { window: 200_000, tokens: 10_000, percent: 5 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 18, resetsAt: new Date(NOW + 5 * 24 * 3_600_000 + 3 * 3_600_000).toISOString() },
      { kind: 'five_hour', percentUsed: 42.5, resetsAt: new Date(NOW + 2 * 3_600_000 + 13 * 60_000).toISOString() },
    ],
    changed: ['context', 'rateLimits'],
  })

test('取得前はパネルに「まだ取得されていません」と出る（全画面種別）', async ($, on) => {
  mock.clock(on, { now: NOW })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /まだ取得されていません/ })).toBeDefined()
    await ui.unmount()
  }
})

test('計測後は本日(5時間枠)・今週(7日枠)の順にパネルへ描画される（全画面種別）', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', ($, e) => ({ changed: e.changed }))

  await measure($)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const rows = await ui.findAll({ type: 'Text', text: /枠\)/ })
    expect(rows.map(r => r.text)).toEqual(['本日 (5時間枠) ', '今週 (7日枠) '].map(t => t.trim()))
    expect(await ui.find({ type: 'Text', text: '42.5%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '18%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'リセットあと2時間13分' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'リセットあと5日3時間' })).toBeDefined()
    await ui.unmount()
  }
})

test('計測のたびにステータス行を更新し、パネルを開き直す', async ($, on) => {
  mock.clock(on, { now: NOW })
  const statuses: (string | undefined)[] = []
  const opens: string[] = []
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    opens.push(e.id)
    return { value: { isPlaced: true } }
  })

  await measure($)
  await measure($)

  expect(statuses.at(-1)).toBe('Claude使用量 本日 42.5%（あと2時間13分） ｜ 今週 18%（あと5日3時間）')
  expect(opens).toEqual(['usage-band', 'usage-band'])
})
