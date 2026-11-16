// 打字时从输入框上方落下的字符：一个字符一条记录。
export type Drop = { id: number; ch: string; col: number; at: number }

// 正在展示的鼓励语特效：head 是开头的一行小字，text 是诗句，by 是作者与篇名。
export type Cheer = { head: string; text: string; by: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'cyberpunk-neon': {
      drops: Drop[]
      // 当前展示的鼓励语；null 表示没有。
      cheer: Cheer | null
      // 会话开始时间（毫秒）；null 表示还没打过招呼。
      startedAt: number | null
      // 已经提醒过的“满 30 分钟”次数。
      milestone: number
      // 上一次因语气词给出鼓励的时间（毫秒），用于冷却。
      lastCheerAt: number
    }
  }
}
