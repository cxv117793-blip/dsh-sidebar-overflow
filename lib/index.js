/**
 * dsh-sidebar-overflow — 宿主端（Host half）
 *
 * 只做一件事：声明本插件的设置项，让浏览器端能通过 `ctx.configForms` 读写，
 * 从而把「哪些左侧栏按钮被收进『更多』」持久化进 desktop profile 的 cordis 配置。
 *
 * 为什么设置项全部 `.volatile()`：`.volatile()` 的语义是「值变化不触发插件重载」，
 * 不是「不落盘」。配置照旧写进 `cordis.patch.yml` 的 config 段（实测确认），
 * 由 Host 的 settings 服务按「profile 条目 id」聚成命名空间、通过 configForms
 * 实时下发与回写。所以点一下眼睛立刻落盘、立刻生效，不用重启，DSH 重启后依然保留。
 *
 * 键名约定（浏览器端解析同一套）：
 *   panel:<panelId>   —— 主导航面板（sidebar.panellist）
 *   footer:<entryId>  —— 底部工具区按钮（sidebar.footer.action）
 * 统一进一个 `hidden` 数组，读的时候按前缀分流，写的时候整组回写。
 */

import Schema from '@deepseek-ai/schemastery'

export const name = 'dsh-sidebar-overflow'

/** 不强制依赖任何服务：Host 端只是设置项的一个提供者，服务缺失也不会炸。 */
export const inject = []

/**
 * 插件入口。cordis 要求模块导出一个 `apply` 函数（或模块对象本身带 apply），
 * 否则报 `invalid plugin, expect function or object with an "apply" method`。
 *
 * 本插件 Host 端没有任何活动逻辑：设置项由 `Config` 声明，`configForms`
 * 服务自动接管读写。所以这里是**故意的空实现**，不要往里加东西。
 */
export function apply() {}

/** 被收进「更多」的入口键。顺序即写入顺序，读的时候按前缀分组。 */
export const Config = Schema.object({
  hidden: Schema.array(Schema.string())
    .default([])
    .description(
      '被收进「更多」的入口键：panel:<面板 id> 表示主导航面板，footer:<条目 id> 表示底部工具区按钮。'
    )
    .volatile(),
})
