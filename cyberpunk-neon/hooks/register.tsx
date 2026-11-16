import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Cheer, Drop } from '../types'

import { makeColors } from './make-colors.js'

// 打字掉落：每个字符从输入框上方的提示条落下并渐隐。LIFE 越大落得越慢。
const LIFE = 4200
const MAX_DROPS = 40
const drops = atom({ plugin: 'cyberpunk-neon', key: 'drops' } as const, [] as Drop[])
let nextId = 0
// 打字钩子只往这里记，定时器再批量写进 $.state（避开钩子的 50ms 预算）。
let pending: Drop[] = []

// 鼓励语：状态放在 $.state 里，模块重载（改文件）时不会重置计时。
const startedAt = atom({ plugin: 'cyberpunk-neon', key: 'startedAt' } as const, null as number | null)
const milestone = atom({ plugin: 'cyberpunk-neon', key: 'milestone' } as const, 0)
const lastCheerAt = atom({ plugin: 'cyberpunk-neon', key: 'lastCheerAt' } as const, 0)
const cheer = atom({ plugin: 'cyberpunk-neon', key: 'cheer' } as const, null as Cheer | null)
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

// 霓虹逐字浮现的鼓励语：每个字依次点亮，停留后整体渐隐。
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${height}" width="640" height="${height}"><style>@keyframes neon{0%{opacity:0}6%{opacity:1}85%{opacity:1}100%{opacity:0}}.g{font:700 ${size}px sans-serif;fill:#00f0ff;opacity:0;filter:drop-shadow(0 0 3px #00f0ff) drop-shadow(0 0 9px #ff2a6d);animation:neon ${life}s ease-in-out both}.s{font:13px sans-serif;opacity:0;animation:neon ${life}s ease-in-out both}</style>${small(c.head, 22, '#ff2a6d', 0)}${glyphs}${c.by.length > 0 ? small(`—— ${c.by}`, 62 + lines.length * 28, '#c9b8ee', 1.4) : ''}</svg>`
}

// 赛博朋克霓虹：只做深色，紫黑底 + 青/洋红霓虹。
const { theme, problems } = makeColors({
  label: 'Cyberpunk Neon',
  roles: { accent: '#00f0ff', danger: '#ff2a6d', success: '#05ffa1', warning: '#ffe600', pro: '#d100ff' },
  only: 'dark',
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0a0614',
        'surface-1': '#110a22',
        'surface-2': '#180e30',
        'surface-3': '#1d1238',
        'text-primary': '#f4ecff',
        'text-secondary': '#c9b8ee',
        'text-muted': '#a592cf',
      },
    },
  },
})

// 黑客帝国式绿色代码雨：固定种子的伪随机，每次加载一致；纯 SVG + CSS 动画，不跑脚本。
const GLYPHS = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ01234789:・.=*+-'
let seed = 7
const rand = () => {
  seed = (seed * 16807) % 2147483647

  return seed / 2147483647
}
const RAIN = Array.from({ length: 46 }, (_, i) => {
  const x = 20 + i * 34
  const len = 10 + Math.floor(rand() * 10)
  const dur = (2.2 + rand() * 3.3).toFixed(1)
  const delay = (-rand() * 6).toFixed(1)
  const size = 16 + Math.floor(rand() * 5)
  const chars = Array.from({ length: len }, (_, j) => {
    const c = GLYPHS[Math.floor(rand() * GLYPHS.length)]
    const head = j === len - 1
    const op = head ? 1 : (0.1 + (j / len) * 0.7).toFixed(2)
    const fill = head ? '#e6ffee' : '#05ffa1'

    return `<tspan x="${x}" dy="${size + 2}" fill="${fill}" opacity="${op}">${c}</tspan>`
  }).join('')

  return `<g class="rain" style="animation-duration:${dur}s;animation-delay:${delay}s"><text font-family="monospace" font-size="${size}" text-anchor="middle" y="0">${chars}</text></g>`
}).join('')

// 动态场景：地平线上的霓虹落日 + 流动透视网格 + 代码雨 + 扫描线。
const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
<style>
@keyframes flow{from{transform:translateY(0)}to{transform:translateY(60px)}}
@keyframes pulse{0%,100%{opacity:.85}50%{opacity:1}}
@keyframes scan{from{transform:translateY(-8px)}to{transform:translateY(8px)}}
@keyframes fall{from{transform:translateY(-420px)}to{transform:translateY(1000px)}}
.rain{animation:fall 8s linear infinite;filter:drop-shadow(0 0 1px #05ffa1)}
.grid{animation:flow 2.4s linear infinite}
.sun{animation:pulse 4s ease-in-out infinite}
.scan{animation:scan 3s ease-in-out infinite alternate}
</style>
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0614"/><stop offset=".6" stop-color="#2a0a4a"/><stop offset="1" stop-color="#5a0a5e"/></linearGradient>
<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe600"/><stop offset=".5" stop-color="#ff2a6d"/><stop offset="1" stop-color="#d100ff"/></linearGradient>
<clipPath id="below"><rect x="0" y="560" width="1600" height="340"/></clipPath>
</defs>
<rect width="1600" height="900" fill="url(#sky)"/>
<g class="sun"><circle cx="1180" cy="520" r="150" fill="url(#sun)" opacity=".9"/>
<g fill="#0a0614"><rect x="1020" y="500" width="320" height="6"/><rect x="1020" y="528" width="320" height="10"/><rect x="1020" y="560" width="320" height="14"/></g></g>
<g fill="#0a0614" stroke="#00f0ff" stroke-width="1.5" opacity=".9">
<rect x="80" y="400" width="90" height="160"/><rect x="190" y="340" width="70" height="220"/><rect x="280" y="430" width="110" height="130"/><rect x="420" y="370" width="60" height="190"/><rect x="500" y="440" width="100" height="120"/></g>
<rect x="0" y="560" width="1600" height="340" fill="#0a0614"/>
<line x1="0" y1="560" x2="1600" y2="560" stroke="#ff2a6d" stroke-width="3"/>
<g clip-path="url(#below)" stroke="#d100ff" stroke-width="1.5" opacity=".75">
<g class="grid"><line x1="0" y1="560" x2="1600" y2="560"/><line x1="0" y1="580" x2="1600" y2="580"/><line x1="0" y1="610" x2="1600" y2="610"/><line x1="0" y1="650" x2="1600" y2="650"/><line x1="0" y1="705" x2="1600" y2="705"/><line x1="0" y1="780" x2="1600" y2="780"/><line x1="0" y1="880" x2="1600" y2="880"/></g>
<g stroke="#00f0ff"><line x1="800" y1="560" x2="-800" y2="900"/><line x1="800" y1="560" x2="-200" y2="900"/><line x1="800" y1="560" x2="300" y2="900"/><line x1="800" y1="560" x2="800" y2="900"/><line x1="800" y1="560" x2="1300" y2="900"/><line x1="800" y1="560" x2="1800" y2="900"/><line x1="800" y1="560" x2="2400" y2="900"/></g></g>
<g opacity=".6">${RAIN}</g>
<g class="scan" opacity=".08" fill="#00f0ff"><rect y="0" width="1600" height="2"/><rect y="12" width="1600" height="2"/><rect y="24" width="1600" height="2"/></g>
</svg>`

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'cyberpunk-neon', glass: { blur: 0, tint: '#0a0614', opacity: 0.5 } },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const set = await $.theme.set(LOOK)

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }

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
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 64" width="620" height="64"><style>@keyframes drop{0%{transform:translateY(0);opacity:1;fill:#e6ffee}12%{fill:#05ffa1}100%{transform:translateY(46px);opacity:0;fill:#05ffa1}}.d{font:700 16px monospace;fill:#05ffa1;animation:drop ${LIFE}ms ease-in both}</style>${letters}</svg>`

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

    return <Svg source={SCENE} alt="霓虹落日与流动的透视网格" isInteractive />
  })
}
