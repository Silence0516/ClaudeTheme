import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Cheer, Drop } from '../types'

import { makeColors } from './make-colors.js'

// 打字掉落：每个字符从输入框上方的提示条落下并渐隐。LIFE 越大落得越慢。
const LIFE = 4200
const MAX_DROPS = 40
const drops = atom({ plugin: 'calm-green', key: 'drops' } as const, [] as Drop[])
let nextId = 0
// 打字钩子只往这里记，定时器再批量写进 $.state（避开钩子的 50ms 预算）。
let pending: Drop[] = []

// 鼓励语：状态放在 $.state 里，模块重载（改文件）时不会重置计时。
const startedAt = atom({ plugin: 'calm-green', key: 'startedAt' } as const, null as number | null)
const milestone = atom({ plugin: 'calm-green', key: 'milestone' } as const, 0)
const lastCheerAt = atom({ plugin: 'calm-green', key: 'lastCheerAt' } as const, 0)
const cheer = atom({ plugin: 'calm-green', key: 'cheer' } as const, null as Cheer | null)
const CHEER_LIFE = 9000
const HALF_HOUR = 30 * 60 * 1000
const COOLDOWN = 3 * 60 * 1000

const OPEN = [
  '会当凌绝顶，一览众山小。—— 杜甫《望岳》',
  '欲穷千里目，更上一层楼。—— 王之涣《登鹳雀楼》',
  '长风破浪会有时，直挂云帆济沧海。—— 李白《行路难》',
]
const TIME = [
  '路漫漫其修远兮，吾将上下而求索。—— 屈原《离骚》',
  '纸上得来终觉浅，绝知此事要躬行。—— 陆游《冬夜读书示子聿》',
  '盛年不重来，一日难再晨。及时当勉励，岁月不待人。—— 陶渊明《杂诗》',
  '业精于勤荒于嬉，行成于思毁于随。—— 韩愈《进学解》',
]
const CHEER = [
  '沉舟侧畔千帆过，病树前头万木春。—— 刘禹锡《酬乐天扬州初逢席上见赠》',
  '天生我材必有用，千金散尽还复来。—— 李白《将进酒》',
  '莫愁前路无知己，天下谁人不识君。—— 高适《别董大》',
]
const COMFORT = [
  '山重水复疑无路，柳暗花明又一村。—— 陆游《游山西村》',
  '千磨万击还坚劲，任尔东西南北风。—— 郑燮《竹石》',
  '不经一番寒彻骨，怎得梅花扑鼻香。—— 黄蘖禅师《上堂开示颂》',
]
// 先判断需要安慰的词，再判断值得夸赞的词。
const CHEERS = [
  { re: /累|烦|崩溃|卡住|不行|失败|报错|bug/i, poems: COMFORT, head: '加油，你可以的' },
  { re: /谢谢|感谢|太好了|完美|可以了|不错|哇塞|棒|赞|给力|厉害|牛|成功|搞定|终于/, poems: CHEER, head: '漂亮！' },
]
const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)] ?? ''

// 展示一条鼓励语特效：记下内容，落完后自动清掉。
const showCheer = async ($: EngineInterface, head: string, entry: string) => {
  const [text, by] = entry.split(' —— ')
  const now = await $.clock.now()

  await update($, cheer, () => ({ head, text: text ?? entry, by: by ?? '', at: now }))
  void $.clock.after(CHEER_LIFE + 300, async () => {
    const later = await $.clock.now()

    await update($, cheer, c => (c !== null && later - c.at >= CHEER_LIFE ? null : c))
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 柔光逐字浮现的鼓励语：每个字依次点亮，停留后整体渐隐。
// 负的 animation-delay 把已过去的时间补上，重绘时不会从头再来。
const cheerSvg = (c: Cheer, now: number) => {
  const age = (now - c.at) / 1000
  const life = CHEER_LIFE / 1000
  const size = 20
  const lines = c.text.split(/(?<=[。！？])/).filter(s => s.length > 0)
  const glyphs = lines
    .map((line, row) =>
      [...line]
        .map((ch, i) => {
          const delay = (row * 14 + i) * 0.07 - age

          return `<text class="g" x="${12 + i * size}" y="${52 + row * 28}" style="animation-delay:${delay.toFixed(2)}s">${esc(ch)}</text>`
        })
        .join('')
    )
    .join('')
  const height = 76 + lines.length * 28
  const small = (text: string, y: number, color: string, delay: number) =>
    `<text class="s" x="12" y="${y}" fill="${color}" style="animation-delay:${(delay - age).toFixed(2)}s">${esc(text)}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${height}" width="640" height="${height}"><style>@keyframes glow{0%{opacity:0}6%{opacity:1}85%{opacity:1}100%{opacity:0}}.g{font:700 ${size}px sans-serif;fill:#7fd6a0;opacity:0;filter:drop-shadow(0 0 3px #7fd6a0) drop-shadow(0 0 9px #5fbf8c);animation:glow ${life}s ease-in-out both}.s{font:13px sans-serif;opacity:0;animation:glow ${life}s ease-in-out both}</style>${small(c.head, 22, '#5fbf8c', 0)}${glyphs}${c.by.length > 0 ? small(`—— ${c.by}`, 62 + lines.length * 28, '#b5cdbd', 1.4) : ''}</svg>`
}

// 护眼绿：只做深色，墨绿底 + 低饱和柔绿，没有刺眼的高亮色。
const { theme, problems } = makeColors({
  label: 'Calm Green',
  roles: { accent: '#7fd6a0', danger: '#ef8a80', success: '#7ddc9a', warning: '#e6d98a', pro: '#8fc4b0' },
  only: 'dark',
  dark: {
    gray: {
      anchors: {
        'surface-0': '#07110d',
        'surface-1': '#0c1a14',
        'surface-2': '#11241c',
        'surface-3': '#162d23',
        'text-primary': '#e6f2ea',
        'text-secondary': '#b5cdbd',
        'text-muted': '#8fa99a',
      },
    },
  },
})

// 放松的夜间森林：柔和分层的远山 + 一眨一眨的星空。
// 没有日出/落日元素；动画都很慢，固定种子的伪随机让每次加载一致，纯 SVG + CSS，不跑脚本。
let seed = 7
const rand = () => {
  seed = (seed * 16807) % 2147483647

  return seed / 2147483647
}
const STARS = Array.from({ length: 130 }, () => {
  const x = Math.floor(rand() * 1600)
  const y = Math.floor(20 + rand() * 540)
  const big = rand() > 0.8
  const r = big ? 3.4 + rand() * 1.6 : 1.5 + rand() * 1.5
  const dur = (2.2 + rand() * 4.5).toFixed(1)
  const delay = (-rand() * 7).toFixed(1)
  const style = `animation-duration:${dur}s;animation-delay:${delay}s`
  const halo = big ? `<circle class="star halo" cx="${x}" cy="${y}" r="${(r * 3).toFixed(1)}" style="${style}"/>` : ''

  return `${halo}<circle class="star" cx="${x}" cy="${y}" r="${r.toFixed(1)}" style="${style}"/>`
}).join('')

const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
<style>
@keyframes twinkle{0%,100%{opacity:.18}50%{opacity:1}}
.star{fill:#f0fff5;animation:twinkle 4s ease-in-out infinite}
.halo{fill:url(#glow)}
</style>
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07110d"/><stop offset=".55" stop-color="#0d2219"/><stop offset="1" stop-color="#1c4a39"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#bff5d2" stop-opacity=".5"/><stop offset=".4" stop-color="#9fe8bd" stop-opacity=".16"/><stop offset="1" stop-color="#9fe8bd" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1600" height="900" fill="url(#sky)"/>
<path d="M0 620 C220 540 420 560 640 610 S1040 660 1240 590 S1500 540 1600 580 L1600 900 L0 900Z" fill="#12352a"/>
<path d="M0 700 C260 640 520 690 780 700 S1250 640 1600 690 L1600 900 L0 900Z" fill="#0a1c14"/>
<path d="M0 790 C300 750 600 800 900 780 S1400 750 1600 790 L1600 900 L0 900Z" fill="#040d08"/>
<g>${STARS}</g>
</svg>`

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'calm-green', glass: { blur: 0, tint: '#07110d', opacity: 0.5 } },
}

export const register: Register = on => {
  on('command.run', { command: 'theme-reload' }, async $ => {
    const set = await $.theme.set(LOOK)

    return { text: set.isDrawn ? '主题已重新应用。' : set.reason }
  })

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const set = await $.theme.set(LOOK)

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }

    await $.command.register({ name: 'theme-reload', description: '重新应用护眼绿主题（颜色与背景）' })

    // 第一次加载时打招呼并开始计时；重载时 startedAt 已有值，不会重复。
    if ((await read($, startedAt)) === null) {
      const t = await $.clock.now()

      await update($, startedAt, () => t)
      await showCheer($, '你好，欢迎回来', pick(OPEN))
    }

    // 每 120ms 把打字记下的字符写进状态；没有新字符时什么都不做。
    void $.clock.every(120, async () => {
      if (pending.length === 0) {
        return
      }
      const fresh = pending

      pending = []
      const now = Date.now()

      await update($, drops, list => [...list.filter(d => now - d.at < LIFE), ...fresh].slice(-MAX_DROPS))
    })

    // 每秒清掉已经落完的字符，收起提示条。
    void $.clock.every(1000, async () => {
      const now = Date.now()

      if ((await read($, drops)).some(d => now - d.at >= LIFE)) {
        await update($, drops, list => list.filter(d => now - d.at < LIFE))
      }
    })

    // 每分钟看一眼：每满 30 分钟给一句诗。
    void $.clock.every(60_000, async () => {
      const start = await read($, startedAt)

      if (start === null) {
        return
      }
      const steps = Math.floor(((await $.clock.now()) - start) / HALF_HOUR)

      if (steps > (await read($, milestone))) {
        await update($, milestone, () => steps)
        const mins = steps * 30
        const label = mins % 60 === 0 ? `${mins / 60} 小时` : `${mins} 分钟`

        await showCheer($, `已并肩作战 ${label}`, pick(TIME))
      }
    })

    return next(e)
  })

  // 发消息时碰到特定语气词，给一句鼓励；只观察，原样放行。
  on('prompt.submit', async ($, e, next) => {
    const kind = CHEERS.find(c => c.re.test(e.text))

    if (kind !== undefined) {
      const now = await $.clock.now()

      if (now - (await read($, lastCheerAt)) > COOLDOWN) {
        await update($, lastCheerAt, () => now)
        await showCheer($, kind.head, pick(kind.poems))
      }
    }

    return next(e)
  })

  // 观察打字：只记录输入的字符，原样放行，不改输入框内容。
  on('prompt.edit', (_$, e, next) => {
    // 按显示宽度排位：中日韩等全角字符占两格，其余一格，避免字符互相重叠。
    const cells = (c: string) => ((c.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1)
    let col = [...e.text.slice(0, e.start)].reduce((n, c) => n + cells(c), 0)
    const typed: { ch: string; col: number }[] = []

    for (const ch of e.inputText) {
      if (ch.trim() !== '') {
        typed.push({ ch, col })
      }
      col += cells(ch)
    }
    const recent = typed.slice(-MAX_DROPS)

    // 这个钩子有 50ms 的时间预算：这里不调用任何 $ 接口，只记进内存，
    // 由 session.start 里的定时器批量写进状态。
    if (recent.length > 0) {
      const now = Date.now()

      pending = [...pending, ...recent.map(t => ({ id: nextId++, ch: t.ch, col: t.col, at: now }))].slice(-MAX_DROPS)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const now = await $.clock.now()
    const alive = (await read($, drops)).filter(d => now - d.at < LIFE)

    const current = await read($, cheer)
    const live = current !== null && now - current.at < CHEER_LIFE ? current : null

    if (alive.length === 0 && live === null) {
      return next(e)
    }

    const { Box, Svg } = $.ui.resolve(e)
    // 负的 animation-delay 把已过去的时间补上，重绘时不会让旧字符从头再落。
    const letters = alive
      .map(d => {
        const x = 10 + (d.col % 72) * 8.4
        const age = ((now - d.at) / 1000).toFixed(2)
        const ch = d.ch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

        return `<text class="d" x="${x.toFixed(1)}" y="14" style="animation-delay:-${age}s">${ch}</text>`
      })
      .join('')
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 64" width="620" height="64"><style>@keyframes drop{0%{transform:translateY(0);opacity:1;fill:#e9f7ee}12%{fill:#7ddc9a}100%{transform:translateY(46px);opacity:0;fill:#7ddc9a}}.d{font:700 16px monospace;fill:#7ddc9a;animation:drop ${LIFE}ms ease-in both}</style>${letters}</svg>`

    return (
      <Box flexDirection="column">
        {live !== null ? (
          <Svg
            key="cheer"
            source={cheerSvg(live, now)}
            alt={`鼓励语：${live.text}`}
            width={640}
            height={76 + live.text.split(/(?<=[。！？])/).filter(s => s.length > 0).length * 28}
            isInteractive
          />
        ) : null}
        {alive.length > 0 ? (
          <Svg key="drops" source={source} alt="打字时落下的绿色字符" width={620} height={64} isInteractive />
        ) : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt="星空下的森林" isInteractive />
  })
}
