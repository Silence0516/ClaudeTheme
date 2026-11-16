# ClaudeTheme · 赛博朋克霓虹

一个给 Claude 桌面应用用的赛博朋克霓虹主题插件（mod）：深紫黑底，青色、洋红、荧光绿霓虹点缀，再加几个会动的小特效。

## 效果

- **配色**：深色，紫黑底配青色、洋红、荧光绿的霓虹点缀，正文文字对比度充足。
- **动态背景**：霓虹落日、城市剪影、不断向前流动的透视网格，再叠一层黑客帝国式的绿色代码雨。
- **打字特效**：输入时，每个字符从输入框上方缓缓落下并渐隐，中英文混排不重叠。
- **鼓励语特效**：霓虹发光的古诗词逐字浮现，约 9 秒后渐隐。三种时机会出现：
  - 新会话开始时打招呼；
  - 每满 30 分钟提醒一次；
  - 你的消息里带"谢谢、太好了、搞定"等词时夸一句，带"累、烦、卡住、报错"等词时安慰一句（两次之间至少隔 3 分钟）。

## 安装

在 Claude Code 里依次执行：

```
/plugin marketplace add Silence0516/ClaudeTheme
/plugin install cyberpunk-neon@claudetheme
```

装好后重启，新会话会自动应用主题。

## 注意

- 主题和背景只在**桌面应用和手机端**绘制，终端里的会话不会有变化。
- 主题只做了深色版本。
- 打字掉落和鼓励语显示在输入框上方的提示条里，不会改动输入框本身的内容。

## 自定义

所有可调参数都在 [`cyberpunk-neon/hooks/register.tsx`](cyberpunk-neon/hooks/register.tsx) 里：

- 配色：`makeColors` 的 `roles` 和 `anchors`。
- 打字字符停留时间：`LIFE`（毫秒，越大落得越慢）。
- 鼓励语停留时间：`CHEER_LIFE`；提醒间隔：`HALF_HOUR`；触发冷却：`COOLDOWN`。
- 诗词和触发词：`OPEN`、`TIME`、`CHEER`、`COMFORT` 四组诗句，以及 `CHEERS` 里的正则。

## 许可证

[MIT](LICENSE)
