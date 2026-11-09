# Changelog

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
