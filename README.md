# dsh-sidebar-overflow

> **把左侧边栏里不常用的按钮收进「更多」，哪些留在外面由你决定。**
> 点一下收起、点一下放回，改完立刻生效，DSH 重启后依然记得。

[![release](https://img.shields.io/badge/release-v0.1.0-2ea44f)](https://github.com/cxv117793-blip/dsh-sidebar-overflow/releases/latest)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4d6bfe)](https://github.com/deepseek-ai)
[![node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**中文** ｜ [English](#english)

DSH 的左侧边栏装得下十几个入口之后就开始拥挤：插件、插件市场、自动化任务、灵枢、上下文洞察、WSL…… 常用的其实没几个。

这个插件在侧边栏底部加一个「更多」按钮，把当前所有入口列成一张清单，**每个都能单独决定留在侧边栏还是收进「更多」**。收进去的不是消失了 —— 点「更多」照样能打开。

```text
┌─────────────────────┐
│  ●  对话            │
│  ▣  文件            │   ← 你留下的
│  ◇  插件            │
│                     │
│        ⋮ 更多       │   ← 点开是完整清单
└─────────────────────┘
```

## 功能

| | |
|---|---|
| **逐个选择** | 菜单里列出全部入口，一行一个，右边一个按钮切换「收进『更多』 / 显示到侧边栏」 |
| **搜索过滤** | 入口多了以后菜单里有个搜索框，输两个字就筛出来 |
| **一键还原** | 「全部恢复」把所有收起的按钮一次放回来，按钮随之消失 |
| **底部工具区** | 侧边栏底部那排小按钮（用量、余额之类）也能隐藏，按顺序对齐 |
| **即时生效** | 点完就变，不用刷新、不用重启 |
| **重启保留** | 选择写进 profile 的 `cordis.patch.yml`，DSH 重启后自动回放 |

## 安装

桌面版**不要**用 `dsh plugin --profile desktop` 直接改 profile —— 它由应用内的插件管理器独占。二选一：

1. **应用内安装**：`设置 → 插件 → 添加插件 → 从本地目录`，选这个仓库的根目录；
2. **命令行**（只对非 desktop 的 profile）：

```bash
dsh plugin --profile <你的profile> add file:<这个仓库的绝对路径>
```

也可以直接用 [Releases](https://github.com/cxv117793-blip/dsh-sidebar-overflow/releases/latest) 里的 `.tgz`：

```bash
# 固定别名，永远指向最新版
https://github.com/cxv117793-blip/dsh-sidebar-overflow/releases/latest/download/dsh-sidebar-overflow.tgz

# 带版本号
https://github.com/cxv117793-blip/dsh-sidebar-overflow/releases/download/v0.1.0/dsh-sidebar-overflow-0.1.0.tgz
```

> 桌面版的安装框支持「npm 包、Git 仓库和本地目录」，把上面这条 URL 粘进去即可。

装完按 `文件 → 退出` **完全退出应用**再启动（不是刷新页面）。

## 怎么用

点侧边栏底部的「更多」：

- 上半区是**留在侧边栏**的，点右边「收进『更多』」把它挪走；
- 下半区是**已收进「更多」**的，点右边「显示到侧边栏」把它放回；
- 分组标题右边有「全部恢复」，一次清空所有收起项；
- 顶部的搜索框按名字过滤，搜索时只显示匹配行。

「插件」这个入口是**故意锁死**的 —— 它是插件管理器的入口，收起来就没地方装插件了。点它会提示「该面板不能收起」。

## 配置

选择存在 profile 的 `cordis.patch.yml` 里：

```yaml
- id: dsh-sidebar-overflow
  name: dsh-sidebar-overflow
  config:
    hidden:
      - panel:dsh-wsl
      - footer:2
```

键名规则：

| 前缀 | 含义 | 例子 |
|---|---|---|
| `panel:` | 主导航面板（`sidebar.panellist`） | `panel:dsh-wsl` |
| `footer:` | 底部工具区第 N 个按钮（按渲染顺序，从 0 数） | `footer:2` |

想手工改也行 —— 改完完全退出再启动即可。也可以直接删掉 `hidden` 整段来重置。

## 工作原理

全部走官方扩展点，不劫持 DOM 结构、不打补丁、不替换组件：

1. **让「更多」按钮出现**：左侧「更多」由官方 sidebar shell 渲染，出现条件是 `sidebar.panellist.actions` 槽位上至少有一条注册。我们注册一条进去，官方按钮就出现，菜单内容由我们渲染。
2. **控制主列表显示谁**：官方 shell 用 `panels.filter(({ id }) => id === "plugins" || !unpinned.includes(id))` 决定主列表，`unpinned` 来自 `createPanelPins()` 的内存 store。它的写入口 `setPinned(id, pinned)` 由 sidebar 插件通过 `injectProps()` 下发，我们在 `apply()` 里从 `ctx.slots.entriesOfSlot("sidebar")[0].inject()` 取到**同一份闭包**，所以启动时、不用打开菜单就能恢复收纳状态。
3. **持久化**：官方 store 是内存态（刷新即还原），落盘由本插件的 Host Config（`hidden: string[]`）承担，走 `configForms` 实时读写。
4. **底部工具区**：`sidebar.footer.action` 没有对应的官方 pin 机制，只能按 DOM 兄弟节点顺序做 best-effort 隐藏；匹配不到就静默跳过，不影响主功能。**换主题或插拔插件后可能需要重新点一次**，这也是它被单独归到一个分组、并在菜单里带说明的原因。

Host 半边（`lib/index.js`）只有 42 行，只声明设置项，`apply()` 是故意空的。

## 已知限制

| 限制 | 原因 |
|---|---|
| 底部工具区按**顺序**而不是按 id 记忆 | 那些按钮渲染进 DOM 时既不带 id 也没有 data 标记，只能数位置。加减插件后序号会变，表现为「隐藏错了一个」 |
| 换主题后底部隐藏可能失效 | 同上，主题可能改变节点层级 |
| 「插件」入口不能收 | 锁死的，见上 |
| 没有拖拽排序 | 这一版只做「收起 / 显示」，不做重排 |

如果底部那条「失效条目」的提示一直在，点「全部恢复」就能清干净。

## 安全边界

- **不写会话数据**、不联网、不上报，不读对话内容。
- 只写一个配置字段：profile 的 `cordis.patch.yml` 里 `dsh-sidebar-overflow` 的 `config.hidden`。
- 客户端半边崩溃只会影响侧边栏，不会白屏：所有 DOM 操作都包在 `try/catch` 里，取不到元素就静默跳过。
- 卸载插件后 `hidden` 配置会残留，但不影响任何东西；想干净就删掉那几行。

## 开发

```bash
git clone https://github.com/cxv117793-blip/dsh-sidebar-overflow.git
cd dsh-sidebar-overflow

# 语法校验（本插件没有构建步骤，源码直接就是产物）
node --check lib/client.js
node --check lib/index.js
```

装到本地 profile 调试：

```bash
# desktop 用应用内「从本地目录」安装；其它 profile 可以：
dsh plugin --profile <profile> add file:<本仓库绝对路径>
```

改完客户端代码后**完全退出应用**再启动；只刷新页面不会重新加载模块。

结构：

```text
lib/index.js      宿主半边：只声明 Config，42 行
lib/client.js     浏览器半边：菜单 UI + 收纳逻辑，约 820 行
locale/{zh,en}.json
cordis.patch.yml  loader 补丁，告诉 DSH 有这么一个插件
icon.svg
```

## English

**dsh-sidebar-overflow** adds a **More** button to the bottom of the DeepSeek Harness
sidebar, so you can choose — entry by entry — which icons stay visible and which
collapse into that menu.

DSH's left rail gets crowded fast once a handful of plugins are installed. This plugin
lists every entry in one menu and lets you toggle each of them between *in the sidebar*
and *collected into More*. Collected entries are not gone — one click on **More** and
they are back.

Highlights:

- **Per-entry control.** Every panel row has a button that flips it between visible and collected.
- **Search.** A filter box appears at the top of the menu once the list gets long.
- **Restore all.** One button puts everything back and makes the More button disappear again.
- **Footer actions.** The small buttons at the bottom of the rail (usage, balance, …) can be hidden too.
- **Instant, and it survives restarts.** Selections are written to the profile's `cordis.patch.yml`
  and replayed automatically on the next launch.

Install from *Settings → Plugins → Add plugin → From local directory*, or grab the
`.tgz` from [Releases](https://github.com/cxv117793-blip/dsh-sidebar-overflow/releases/latest).
Fully quit the app afterwards — reloading the page does not load the client module.

It works entirely through official extension points: the More button is the stock
`sidebar.panellist.actions` slot, and visibility is driven by the stock `setPinned()`
closure obtained from `ctx.slots.entriesOfSlot("sidebar")[0].inject()`. No DOM hijacking,
no monkey-patching, no component replacement.

Known limitation: footer actions are remembered **by position**, not by id, because those
buttons render without any identifier. After installing or removing plugins the indices
shift; toggle them again if a hide lands on the wrong button.

Requires Node `^22.19.0 || >=24.0.0`. The plugin declares no `engines.dsh` constraint —
it relies only on slot APIs that have been stable across the 0.2.x line.

## License

[MIT](LICENSE)
