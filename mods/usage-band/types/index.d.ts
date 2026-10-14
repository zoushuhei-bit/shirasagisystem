/** バンドが描画するレート制限枠の1つ。 */
export type UsageWindow = {
  /** `five_hour`（5時間枠）、`seven_day`（7日枠）、またはゲートウェイの `spend_limit`。 */
  kind: string
  /** 使用率 0〜100。小数点以下は最大1桁。 */
  percentUsed: number
  /** 枠がリセットされる時刻（ISO 8601）。不明なら null。 */
  resetsAt: string | null
}

/** 直近に取得したレート制限枠の読み取り結果と、その取得時刻。 */
export type UsageSnapshot = {
  windows: UsageWindow[]
  /** 取得時の `$.clock.now()`（ミリ秒）。 */
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snapshot: UsageSnapshot | null }
  }
}
