# ClaudeTheme

给 Claude 桌面应用用的主题插件（mod）合集，目前有两个主题，选一个安装即可：

| 主题 | 插件名 | 版本 | 风格 |
|---|---|---|---|
| 护眼绿 | `calm-green` | 2.0.0 | 墨绿底配低饱和柔绿，星空下的夜间森林，安静不刺眼 |
| 赛博朋克霓虹 | `cyberpunk-neon` | 0.2.0 | 深紫黑底配青色、洋红、荧光绿霓虹，动感强 |

两个主题都会接管颜色和背景，同时安装时只有一个能生效，建议只装一个。

## 护眼绿 calm-green（2.0）

### 效果

- **配色**：只做深色。墨绿底，柔绿为主色，报错、警告等状态色也压低了饱和度，没有刺眼的高亮。
- **动态背景**：三层柔和起伏的远山，上方是一闪一闪的星空，没有日出落日；动画都很慢，每次加载画面一致。
- **打字特效**：输入时，每个字符从输入框上方缓缓落下并渐隐，中英文混排不重叠。
- **鼓励语特效**：柔绿发光的古诗词逐字浮现，约 9 秒后渐隐，出现时机与霓虹主题相同（新会话打招呼、每满 30 分钟提醒、消息里的语气词触发）。
- **命令**：`/theme-reload` 可在颜色或背景没刷出来时重新应用主题。

### 安装

在 Claude Code 里依次执行：

```
/plugin marketplace add Silence0516/ClaudeTheme
/plugin install calm-green@claudetheme
```

装好后重启，新会话会自动应用主题。之前装过霓虹主题的，先卸载它：`/plugin uninstall cyberpunk-neon@claudetheme`。

### 自定义

参数都在 [`calm-green/hooks/register.tsx`](calm-green/hooks/register.tsx) 里：配色在 `makeColors` 的 `roles` 和 `anchors`，星星数量和闪烁快慢在 `STARS`，远山和天空在 `SCENE`，其余参数与霓虹主题同名。

## 赛博朋克霓虹 cyberpunk-neon

### 效果

- **配色**：深色，紫黑底配青色、洋红、荧光绿的霓虹点缀，正文文字对比度充足。
- **动态背景**：霓虹落日、城市剪影、不断向前流动的透视网格，再叠一层黑客帝国式的绿色代码雨。
- **打字特效**：输入时，每个字符从输入框上方缓缓落下并渐隐，中英文混排不重叠。
- **鼓励语特效**：霓虹发光的古诗词逐字浮现，约 9 秒后渐隐。三种时机会出现：
  - 新会话开始时打招呼；
  - 每满 30 分钟提醒一次；
  - 你的消息里带"谢谢、太好了、搞定"等词时夸一句，带"累、烦、卡住、报错"等词时安慰一句（两次之间至少隔 3 分钟）。

### 安装

在 Claude Code 里依次执行：

```
/plugin marketplace add Silence0516/ClaudeTheme
/plugin install cyberpunk-neon@claudetheme
```

装好后重启，新会话会自动应用主题。

### 注意

- 主题只做了深色版本。

### 自定义

所有可调参数都在 [`cyberpunk-neon/hooks/register.tsx`](cyberpunk-neon/hooks/register.tsx) 里：

- 配色：`makeColors` 的 `roles` 和 `anchors`。
- 打字字符停留时间：`LIFE`（毫秒，越大落得越慢）。
- 鼓励语停留时间：`CHEER_LIFE`；提醒间隔：`HALF_HOUR`；触发冷却：`COOLDOWN`。
- 诗词和触发词：`OPEN`、`TIME`、`CHEER`、`COMFORT` 四组诗句，以及 `CHEERS` 里的正则。

## 两个主题共同的注意事项

- 主题和背景只在**桌面应用和手机端**绘制，终端里的会话不会有变化；Claude 聊天页（非 Code 页）也不会加载插件。
- 打字掉落和鼓励语显示在输入框上方的提示条里，不会改动输入框本身的内容。

## 许可证

[MIT](LICENSE)
