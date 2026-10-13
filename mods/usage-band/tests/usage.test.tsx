import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

const PLUGIN = 'usage-band'
const SURFACES = ['terminal', 'desktop'] as const
const NOW = Date.UTC(2026, 9, 13, 3, 0, 0)

const PROPS: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

const BAND = { plugin: PLUGIN, component: 'AbovePrompt', props: PROPS } as const

const measure = ($: Engine) =>
  $.session.measure({
    context: { window: 200_000, tokens: 10_000, percent: 5 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 18, resetsAt: new Date(NOW + 5 * 24 * 3_600_000 + 3 * 3_600_000).toISOString() },
      { kind: 'five_hour', percentUsed: 42.5, resetsAt: new Date(NOW + 2 * 3_600_000 + 13 * 60_000).toISOString() },
    ],
    changed: ['context', 'rateLimits'],
  })

test('取得前はバンドに「まだ取得されていません」と出る', async ($, on) => {
  mock.clock(on, { now: NOW })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /まだ取得されていません/ })).toBeDefined()
    await ui.unmount()
  }
})

test('計測後は本日(5時間枠)・今週(7日枠)の順に描画される', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', ($, e) => ({ changed: e.changed }))

  await measure($)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const rows = await ui.findAll({ type: 'Text', text: /枠\)/ })
    expect(rows.map(r => r.text)).toEqual(['本日 (5時間枠) ', '今週 (7日枠) '])
    expect(await ui.find({ type: 'Text', text: '42.5%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '18%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'リセットあと2時間13分' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'リセットあと5日3時間' })).toBeDefined()
    await ui.unmount()
  }
})

test('非表示ボタンでバンドが消え、/usage-band で戻る', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await measure($)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /本日/ })).toBeDefined()
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /本日/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()

  const shown = await $.command.run({ command: PLUGIN, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(shown.text).toContain('本日 (5時間枠): 42.5%')
  expect(shown.text).toContain('今週 (7日枠): 18%')
  expect(await ui.find({ type: 'Text', text: /本日/ })).toBeDefined()
  await ui.unmount()
})
