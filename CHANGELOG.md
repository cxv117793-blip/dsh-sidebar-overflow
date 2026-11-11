# Changelog

## 0.1.2

**修复：底部工具区（「底部工具区」分组）收不起来、重启后收纳全部失效。**

### 症状

- 「更多」菜单里的「底部工具区」分组要么整组不出现，要么只有一行、名字还是
  `今日¥4.943856M tokens余额¥54…` 这种几条文案粘在一起的乱码；点「收进「更多」」
  没有任何反应。
- 重启 DSH 后，之前收起来的侧边栏面板全都又冒出来；再点一次「收起」才恢复。
  也就是「重启不生效，操作后才生效」。

### 原因一：footer 容器选错了一层

`sidebar.footer.action` 是 list 槽位，但官方 `renderSlot()` 会先套一层
`<div data-slot="sidebar.footer.action" style="display: contents">`，真正的条目是这层
**包裹层**的子节点。v0.1.1 用的是探针的 `parentElement`：

```js
const probe = document.querySelector("[data-dso-probe]");
const container = probe && probe.parentElement; // ← 就是那层 display:contents
```

而它 `children` 里只有探针自己，兄弟数组长度为 0，于是「一个也藏不掉」；
`readFooterItems()` 同样枚举到 0 条，菜单分组因此不显示。

v0.1.2 新增 `footerItemNodes()`：从 `[data-slot="sidebar.footer.action"]` 出发，遇到
`display: contents` 的包裹层就下钻（深度上限 4），把真实条目按渲染顺序收集起来。
菜单枚举、启动恢复、写入后应用三处共用同一个函数，`footer:<index>` 的语义不再分叉。

容器定位也换掉了 CSS module 的 hash 类名（`wtg9ga_` / `hHd-Xa_` 每次构建都会变），
改用官方稳定的 `data-slot` 标记。

### 原因二：`innerText` 在 `display: none` 上退化成 `textContent`

底部条目是多行堆叠（用量 / 余额 / 时段）。节点一旦被我们藏起来，读 `innerText`
拿到的就是 `textContent`，几行粘成一行。v0.1.2 的 `visibleTextOf()` 在读取前临时
把 `display` 还原、读完立刻改回去，再按行用空格拼接后截断：

```text
修复前：今日¥4.943856M tokens余额¥54…
修复后：今日 ¥5.0509 58.8M tokens …
```

### 原因三：启动恢复只跑一次，错过了就永久错过

官方 `createPanelPins()` 每次都新建 `unpinned: NO_PANELS` 的**纯内存**存储，
sidebar 条目重建一次，回放进去的 pin 就全丢。而 v0.1.1 的 `sync()` 在
`snap.status !== "ready"` 或 `grabSidebarControls()` 失败时直接 `return`，
之后能不能补上全靠是否恰好有一次通知 —— 表现就是「重启后全显示」。

v0.1.2 把恢复改成多重兜底：

| 兜底 | 作用 |
| --- | --- |
| 退避重试（120ms 起，最多 12 次约 5s） | 槽位 / 配置还没就位时自动补跑 |
| 订阅 `sidebar`、`sidebar.panellist`、`form` | 任一变化立即重放 |
| 订阅 `hooks.panels` | 其它插件后注册面板时重放 |
| 4s 低频巡检 | pin store 被官方重建、通知整段丢失时兜底 |
| `visibilitychange` | Electron 挂起标签页后回前台补跑 |
| 写入成功后立刻 `applyFooterHidden` | 不必等 `form.subscribe` 的下一轮 |

### 行为变化

- 底部条目名字不再粘连，能区分不同条目。
- 「底部工具区」分组在有条目时稳定出现。
- 重启后无需手动点一次。
- 卸载/禁用插件时，`restoreFooterHidden()` 会按 `data-dso-hid` 标记全文档还原，
  不再依赖组件 ref。

配置格式、槽位 id、`cordis.patch.yml` 里的 `config.hidden` 全部不变，
`footer:<index>` 的历史值继续有效。

## 0.1.1

**修复：部分机器上偶发启动失败（弹「DeepSeek Harness 无法使用」）。**

崩溃日志形如：

```text
Error: web boot: 1 entry did not activate
dsh-sidebar-overflow: loading
```

### 原因

宿主的 boot 检查会遍历 loader 条目并读取 `fiber.state`，只要有一个不是 `active`
就抛错并中止整个 UI 挂载。而 cordis 里 `inject` 数组**全是必需依赖**——其中任一
服务被重新 `provide`（分配新 `uid`）都会让纤维先 `unload` 再 `reload`，这段时间
状态就是 `UNLOADING` / `LOADING`。

v0.1.0 声明的是：

```js
const inject = ["slots", "locale", "configForms"];
```

其中 `slots` 稳定，另两个不是：

- `dsh-client-locale` 自己注入 `remote` + `configForms`
- `configForms` 的宿主 `dsh-client-ui-settings` 注入 `remote` + `remote.settings`
- `remote` 在 `loader.await()` 结算**之后**才 `connection.start()`，首次
  `onConnected` 时发 `connection/reset`，`ui-settings` 收到后 `mirror.load()`

也就是说，**首次连接成功必然晚于 boot 检查点**。两者谁先谁后决定这次启动崩不崩，
这就是它表现为偶发（同一 profile 上一次崩、下一次正常）的原因。

### 改动

只硬注入 `slots`，把依赖晚到服务的部分下沉到子纤维：

```js
const inject = ["slots"];

ctx.inject(["locale", "configForms"], (sub) => {
  // 字典注册、configForms 取用、pin 恢复、两处槽位注册
});
```

子纤维不在 loader 的条目表里，它内部的加载/卸载不参与 boot 检查。功能、配置格式、
槽位 id 全部不变，`cordis.patch.yml` 里的 `config.hidden` 原样沿用。

### 验证

用本机 cordis 4.0.5 跑对照实验，对每个微任务采样一次主条目状态：

```text
mode A（易抖服务写进主 inject）  sampled = ACTIVE,UNLOADING,LOADING
mode B（易抖服务放子纤维）        sampled = ACTIVE
```

## 0.1.0

首次发布。
