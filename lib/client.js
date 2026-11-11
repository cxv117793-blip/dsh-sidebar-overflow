/**
 * dsh-sidebar-overflow — 浏览器半边
 *
 * 做的事：把 DSH 左侧侧边栏的按钮按用户选择「收进更多」。
 *
 * 为什么能成立（全部走官方机制，不碰 DOM 结构）：
 *   1. 左侧「更多」按钮由官方 sidebar shell 渲染，出现条件是
 *      `hasEntryActions` —— 即 `sidebar.panellist.actions` 槽位上至少有一条注册。
 *      我们注册一条进去，官方按钮就出现，且菜单内容由我们渲染。
 *   2. 官方 shell 用 `panels.filter(({ id }) => id === "plugins" || !unpinned.includes(id))`
 *      决定主列表显示谁，`unpinned` 来自 `createPanelPins()` 的内存 store。
 *      这个 store 的写入口 `setPinned(id, pinned)` 由 sidebar 插件通过
 *      `injectProps()` 下发，我们在 `apply()` 里从
 *      `ctx.slots.entriesOfSlot("sidebar")[0].inject()` 取到同一份闭包，
 *      所以启动时、不需要打开菜单就能恢复收纳状态。
 *   3. 官方 store 是内存态（刷新即还原），持久化由本插件自己的 Host Config
 *      （`hidden: string[]`，全部 .volatile()，由 configForms 实时读写）承担。
 *
 * 底部工具区（`sidebar.footer.action`）没有对应的官方 pin 机制，
 * 只能按 DOM 兄弟节点的顺序做 best-effort 隐藏；匹配不到就静默跳过，不影响主功能。
 */

window.__ModuleLoader__.load({
	id: "dsh-sidebar-overflow",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const { jsx, jsxs } = require("react/jsx-runtime");
		const react = require("react");

		// ── 身份 ─────────────────────────────────────────────────────────
		// NS 必须等于 cordis.patch.yml 里那一行的 id：Host 的 settings 服务按
		// 「profile 条目 id」把 Config 里 .volatile() 的字段聚成命名空间。
		const NS = "dsh-sidebar-overflow";
		const MENU_SLOT = "sidebar.panellist.actions";
		const FOOTER_SLOT = "sidebar.footer.action";
		const PANEL_SLOT = "sidebar.panellist";
		// 永远不能被收纳的面板（官方 setPinned 里也有同样的硬保护）。
		const ALWAYS_PINNED = "plugins";

		const inject = ["slots"];

		// ── 文案 ─────────────────────────────────────────────────────────
		const zh = {
			title: "侧边栏收纳",
			search: "搜索面板…",
			hiddenGroup: "已收进「更多」",
			hiddenGeneric: "已隐藏",
			shownGroup: "留在侧边栏",
			empty: "没有匹配的面板",
			noHidden: "还没有收起来的按钮。点右边的「收起」把不常用的面板放进这里。",
			show: "显示到侧边栏",
			hide: "收进「更多」",
			restoreAll: "全部恢复",
			footerGroup: "底部工具区",
			footerHint: "底部按钮只能按顺序隐藏，换主题或插拔插件后可能需要重新点一次。",
			unavailable: "设置还不可写。",
			staleHidden: "另有 {n} 个条目已失效（对应插件可能已卸载或按钮已移除），点「全部恢复」清理。",
			locked: "该面板不能收起。",
		};

		const en = {
			title: "Sidebar overflow",
			search: "Search panels…",
			hiddenGroup: "Collected into More",
			hiddenGeneric: "Hidden",
			shownGroup: "In the sidebar",
			empty: "No matching panel",
			noHidden: "Nothing collected yet. Use “Collect” on the right to move rarely used panels here.",
			show: "Show in sidebar",
			hide: "Collect into More",
			restoreAll: "Restore all",
			footerGroup: "Footer actions",
			footerHint: "Footer buttons are hidden by position; after a theme change or plugin install you may need to toggle again.",
			unavailable: "Settings are not writable.",
			staleHidden: "{n} entr(y/ies) no longer exist (plugin uninstalled or button removed); use Restore all to clean up.",
			locked: "This panel cannot be collected.",
		};

		const CSS_TAG = "dsh-sidebar-overflow/menu.css";
		const CSS = `
.dso-menu{display:flex;flex-direction:column;gap:2px;min-width:248px;max-width:340px;padding:2px 0}
.dso-search{display:flex;padding:2px 6px 6px}
.dso-search input{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-primary,rgba(128,128,128,.28));border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:12px;line-height:20px;padding:2px 8px;outline:none}
.dso-search input:focus{border-color:var(--dsw-alias-label-secondary,rgba(128,128,128,.6))}
.dso-scroll{overflow-y:auto;display:flex;flex-direction:column;gap:1px;padding:0 2px;min-height:0}
.dso-group{display:flex;flex-direction:column;gap:1px}
.dso-hint{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.72));font-size:10px;font-weight:400}
.dso-groupTitle{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 4px;color:var(--dsw-alias-label-secondary,inherit);font-size:11px;line-height:16px;letter-spacing:.02em}
.dso-restore{border:0;background:0 0;padding:0;font:inherit;font-size:11px;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;text-decoration:underline}
.dso-restore:hover{color:var(--dsw-alias-label-primary,inherit)}
.dso-row{display:flex;align-items:center;gap:6px;border-radius:var(--dsw-radius-sm,6px);min-height:28px;padding:0 4px 0 8px}
.dso-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.dso-rowMain{display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0;border:0;background:0 0;padding:0;font:inherit;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;text-align:left;font-size:12px;line-height:28px}
.dso-rowMain span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dso-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-secondary,currentColor);flex:none;opacity:.55}
.dso-dot[data-active=true]{opacity:1;background:var(--dsw-alias-label-primary,currentColor)}
.dso-act{flex:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;font-size:11px;line-height:22px;padding:0 6px;border-radius:var(--dsw-radius-sm,6px)}
.dso-act:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16));color:var(--dsw-alias-label-primary,inherit)}
.dso-act[disabled]{opacity:.35;cursor:default}
.dso-note{margin:0;padding:2px 10px 6px;color:var(--dsw-alias-label-secondary,inherit);font-size:11px;line-height:16px}
.dso-empty{margin:0;padding:6px 10px 10px;color:var(--dsw-alias-label-secondary,inherit);font-size:12px;line-height:18px}
.dso-error{color:var(--dsw-alias-state-error-primary,#d33)}
`;

		// ── 配置读写 ─────────────────────────────────────────────────────
		// 服务是 ConfigFormController：getSnapshot() / subscribe(fn) / mutate(ops, revision)
		function useSnapshot(form) {
			const [tick, setTick] = react.useState(0);
			react.useEffect(() => {
				if (!form || typeof form.subscribe !== "function") return undefined;
				const off = form.subscribe(() => setTick((n) => n + 1));
				return typeof off === "function" ? off : undefined;
			}, [form]);
			return form && typeof form.getSnapshot === "function" ? form.getSnapshot() : undefined;
		}

		function hiddenOf(state) {
			const value = state && state.value;
			const list = value && Array.isArray(value.hidden) ? value.hidden : [];
			return list.filter((entry) => typeof entry === "string");
		}

		// 每个配置表单一条串行写入链。ConfigFormController 的 mutate 需要
		// 当前的 revision，两次并发写会第二次读到旧 revision 而被拒（表现为
		// 连点两个条目只有一个生效）。这里按 form 排队，保证后一次在前一次
		// 提交完成后再读快照。
		const writeQueues = new WeakMap();
		function enqueueWrite(form, task) {
			const key = form || writeQueues;
			const prev = writeQueues.get(key) || Promise.resolve();
			const next = prev.then(task, task);
			writeQueues.set(key, next.catch(() => {}));
			return next;
		}
		async function writeHidden(form, next) {
			if (!form || typeof form.getSnapshot !== "function") return false;
			const snap = form.getSnapshot();
			if (!snap || !snap.writable || snap.status !== "ready") return false;
			try {
				// 整体覆盖写：hidden 是纯数组，set 一把写完比增删单条更不容易错。
				const ops = [{ op: "set", path: ["hidden"], value: next.slice() }];
				const ok = await form.mutate(ops, snap.revision);
				return ok !== false;
			} catch {
				return false;
			}
		}

		// ── 底部工具区条目（按 DOM 顺序枚举） ────────────────────────────
		// `sidebar.footer.action` 是 list 槽位，渲染进 DOM 的条目既不带 id 也没有
		// data 标记，条件性返回 null 的条目根本不进 DOM。所以序号只能按**真实渲染
		// 节点**重算：菜单枚举、启动恢复、写入后应用必须共用下面这套函数，否则三处
		// index 语义一旦分叉，表现就是点了「收起」却什么都没藏掉。
		function footerItemNodes(container) {
			const out = [];
			if (!container) return out;
			const walk = (parent, depth) => {
				if (!parent || depth > 4) return;
				let children = [];
				try {
					children = Array.from(parent.children || []);
				} catch {
					return;
				}
				for (const el of children) {
					if (!el || typeof el.getAttribute !== "function") continue;
					if (el.hasAttribute("data-dso-probe")) continue;
					// 官方 renderSlot 会套一层 display:contents 包裹层；个别条目自己
					// 也可能再套一层。只解一层不够，递归下去但限制深度防环。
					let contents = false;
					try {
						contents = typeof getComputedStyle === "function" && getComputedStyle(el).display === "contents";
					} catch {
						contents = false;
					}
					if (contents) {
						walk(el, depth + 1);
						continue;
					}
					out.push(el);
				}
			};
			walk(container, 0);
			return out;
		}

		// 容器优先用官方 renderSlot 输出的 `data-slot` 标记：它比 CSS module 的 hash
		// 类名稳定（hash 每次构建都变），也比探针可靠（菜单先打开时探针可能还没挂）。
		function footerContainer() {
			if (typeof document === "undefined") return undefined;
			let slot;
			try {
				slot = document.querySelector('[data-slot="sidebar.footer.action"]');
			} catch {
				slot = undefined;
			}
			if (slot) return slot;
			const probe = document.querySelector("[data-dso-probe]");
			return probe ? probe.parentElement || probe.parentNode : undefined;
		}

		// `innerText` 依赖布局：元素一旦被我们藏起来（display:none），它会退化成
		// `textContent`，多行文案直接粘成一行（「今日¥4.943856M tokens余额¥54…」）。
		// 所以读之前临时把 display 恢复一下，读完立刻还原，保证菜单里的名字和
		// 视觉上的第一行一致。
		function visibleTextOf(el) {
			let restore;
			try {
				const cs = typeof getComputedStyle === "function" ? getComputedStyle(el) : undefined;
				if (cs && cs.display === "none") {
					restore = el.style.display;
					el.style.display = el.getAttribute("data-dso-display") || "";
				}
			} catch {
				restore = undefined;
			}
			let text = "";
			try {
				text = typeof el.innerText === "string" ? el.innerText : String(el.textContent || "");
			} catch {
				text = String(el.textContent || "");
			}
			if (restore !== undefined) {
				try {
					el.style.display = restore;
				} catch {
					/* 忽略 */
				}
			}
			return text;
		}

		function footerLabel(el) {
			const clip = (value) => {
				const text = String(value || "").replace(/\s+/g, " ").trim();
				if (text.length === 0) return "";
				return text.length > 24 ? text.slice(0, 24) + "…" : text;
			};
			try {
				// 先看节点自身的标签，再退回可见文字；后代 aria-label 放最后，
				// 否则会取到「打开充值页」这类链接说明，读起来完全不像条目名。
				const own = clip(el.getAttribute("aria-label") || el.getAttribute("title"));
				if (own.length > 0) return own;
				// 底部条目常常是多行堆叠（用量 / 余额 / 时段）。textContent 会把几行
				// 粘成一长串（「今日¥4.943856M tokens余额¥54…」），innerText 保留换行；
				// 取前几行用空格接起来，既像条目标题又能和别的条目区分开。
				const inner = visibleTextOf(el);
				const merged = clip(
					inner
						.split(/\r?\n/)
						.map((line) => line.trim())
						.filter((line) => line.length > 0)
						.join(" ")
				);
				if (merged.length > 0) return merged;
				const firstRow = el.querySelector("div, span, p");
				const rowText = firstRow && firstRow !== el ? clip(firstRow.textContent) : "";
				if (rowText.length > 0) return rowText;
				const text = clip(el.textContent);
				if (text.length > 0) return text;
				const named = el.querySelector("[aria-label]");
				const aria = named && clip(named.getAttribute("aria-label"));
				if (aria && aria.length > 0) return aria;
			} catch {
				/* 忽略 */
			}
			const cls = String(el.className || "").split(/\s+/)[0];
			return cls.length > 0 ? cls : "footer";
		}

		function readFooterItems() {
			return footerItemNodes(footerContainer()).map((el, index) => ({ index, label: footerLabel(el) }));
		}

		// 底部收纳的唯一字节：把配置里的 footer:<index> 落到 DOM。启动恢复、配置
		// 变化、低频巡检都调它，三处行为必然一致。
		function applyFooterHidden(hidden) {
			const items = footerItemNodes(footerContainer());
			if (items.length === 0) return false;
			const collected = new Set(hidden || []);
			for (let index = 0; index < items.length; index += 1) {
				const el = items[index];
				if (!el || !el.style) continue;
				if (collected.has("footer:" + index)) {
					// 记住原始行内值：直接清成 "" 会把别人写的 display 一并抹掉。
					if (el.getAttribute("data-dso-hid") !== "1") {
						el.setAttribute("data-dso-hid", "1");
						el.setAttribute("data-dso-display", el.style.display);
					}
					el.style.display = "none";
				} else if (el.getAttribute("data-dso-hid") === "1") {
					el.style.display = el.getAttribute("data-dso-display") || "";
					el.removeAttribute("data-dso-hid");
					el.removeAttribute("data-dso-display");
				}
			}
			return true;
		}

		// 停用/卸载时把藏起来的底部条目还回去，否则会一直 display:none 到整页刷新。
		// 不依赖 ref：直接按标记全文档扫一遍，探针早被卸载也能还原。
		function restoreFooterHidden() {
			if (typeof document === "undefined") return;
			let nodes = [];
			try {
				nodes = Array.from(document.querySelectorAll('[data-dso-hid="1"]'));
			} catch {
				return;
			}
			for (const el of nodes) {
				try {
					el.style.display = el.getAttribute("data-dso-display") || "";
					el.removeAttribute("data-dso-hid");
					el.removeAttribute("data-dso-display");
				} catch {
					/* 节点已移除 */
				}
			}
		}

		function toggleKey(list, key, present) {
			const without = list.filter((entry) => entry !== key);
			return present ? without : without.concat([key]);
		}

		// ── 取官方收纳开关 ───────────────────────────────────────────────
		// sidebar 插件用 `inject: injectProps` 注册进 `sidebar` 槽位；
		// `StoredEntry.inject` 是注册项上的**顶层字段**（不在 options 里），
		// 直接调用就能拿到与 SidebarRoot 同一份闭包里的 setPinned 与 hooks。
		function grabSidebarControls(ctx) {
			let entries = [];
			try {
				entries = ctx.slots.entriesOfSlot("sidebar") || [];
			} catch {
				return undefined;
			}
			for (const entry of entries) {
				const face = entry && entry.inject;
				if (typeof face !== "function") continue;
				let injected;
				try {
					injected = face();
				} catch {
					continue;
				}
				if (injected && typeof injected.setPinned === "function") return injected;
			}
			return undefined;
		}

		// 把配置里的 panel:<id> 同步进官方内存 pin store。
		// 幂等：setPinned 在 pin 态与目标一致时会直接 return。
		function applyPanelPins(face, hidden) {
			if (!face || typeof face.setPinned !== "function") return false;
			const hooks = face.hooks;
			const panels = hooks && hooks.panels;
			if (!panels || typeof panels.getSnapshot !== "function") return false;
			let snapshot = [];
			try {
				snapshot = panels.getSnapshot() || [];
			} catch {
				return false;
			}
			const collected = new Set(hidden);
			for (const panel of snapshot) {
				if (!panel || typeof panel.id !== "string") continue;
				if (panel.id === ALWAYS_PINNED) continue;
				face.setPinned(panel.id, !collected.has("panel:" + panel.id));
			}
			return true;
		}

		// ── 菜单本体 ─────────────────────────────────────────────────────
		function OverflowMenu(props) {
			const { entries, onOpen, onPinnedChange, onDismiss, t } = props;
			const overflow = props.overflow || {};
			const form = overflow.form;
			const state = useSnapshot(form);
			const hidden = hiddenOf(state);
			const collected = new Set(hidden);
			const [query, setQuery] = react.useState("");

			// 官方浮层不会把自己封顶，锚点又可能落在侧边栏中段，
			// 所以高度上限必须按「当前顶边到视口底部还剩多少」算；
			// 写死 70vh 在矮窗口下会把菜单底边顶出屏幕。
			//
			// 注意时序：这个组件先渲染、然后官方浮层才把它摆到锚点下方，
			// 首帧量到的 top 还是 0。只算一次会得到一个偏大的上限（按 top=0 算），
			// 于是菜单照样把底边顶出视口。这里连跑几帧收敛，并在滚动内容尺寸
			// 变化时重算，保证「先按内容长高、再按真实 top 收回来」。
			react.useLayoutEffect(() => {
				// react/jsx-runtime 的 jsx() 不处理 ref（那是 createElement 的特权），
				// 所以根节点拿不到 ref，只能用选择器找。同一时刻只会开一个菜单。
				const el = document.querySelector(".dso-menu");
				if (!el) return undefined;
				let timer = 0;
				let frames = 0;
				const fit = () => {
					const rect = el.getBoundingClientRect();
					if (rect.height <= 0) return;
					const room = window.innerHeight - rect.top - 16;
					const next = Math.max(160, room) + "px";
					if (el.style.maxHeight !== next) el.style.maxHeight = next;
				};
				// 收敛必须用 setTimeout，不能用 requestAnimationFrame：
				// 窗口切到后台 / 标签页不可见时 rAF 会被整个暂停，回调永远不来，
				// 菜单就会一直顶着原高度冲出视口。setTimeout 只会被节流、不会停死。
				const schedule = () => {
					window.clearTimeout(timer);
					fit();
					frames = 6;
					const step = () => {
						fit();
						frames -= 1;
						if (frames > 0) timer = window.setTimeout(step, 16);
					};
					timer = window.setTimeout(step, 16);
				};
				schedule();
				window.addEventListener("resize", schedule);
				let observer;
				try {
					observer = new window.ResizeObserver(() => fit());
					const scroll = el.querySelector(".dso-scroll");
					if (scroll) observer.observe(scroll);
				} catch {
					/* 老内核没有 ResizeObserver，退化成 resize 监听 */
				}
				return () => {
					window.clearTimeout(timer);
					window.removeEventListener("resize", schedule);
					if (observer) observer.disconnect();
				};
			}, []);

			const ready = Boolean(state && state.status === "ready" && state.writable);
			const rows = Array.isArray(entries) ? entries : [];

			// next 既可以是数组，也可以是 (当前 hidden) => 新数组 的函数。
			// 函数形式在真正写入前才求值，因此连点多个条目时每一步都基于
			// 上一步提交后的最新快照，不会互相覆盖。
			// onApplied 只在配置真的写成功后执行；写失败时不能先动官方 store，
				// 否则界面显示「已收起」、刷新后又自己变回来。
				const apply = (next, onApplied) =>
					enqueueWrite(form, () => {
						const latest =
							form && typeof form.getSnapshot === "function" ? hiddenOf(form.getSnapshot()) : hidden;
						const value = typeof next === "function" ? next(latest) : next;
						return writeHidden(form, value).then((ok) => {
							if (!ok) return false;
							const face = grabSidebarControls(overflow.ctx);
							if (face) applyPanelPins(face, value);
							// 底部条目按 DOM 顺序收纳，不走官方 pin：写完立刻落一次，
							// 不必等 form.subscribe 的下一轮通知。
							applyFooterHidden(value);
							if (typeof onApplied === "function") {
								try {
									onApplied(value);
								} catch {
									/* 官方 store 不在就只写配置 */
								}
							}
							return true;
						});
					});

			const setPanelPinned = (id, pinned) => {
				// toggleKey(list, key, present)：present=true 表示「key 已在列表里」→ 移除。
				// 目标是「pinned === true 时不在 hidden 里」，所以直接把 pinned 当 present 传。
				// 官方 store 的写入口放在成功回调里：配置写失败时绝不能让两边脱节。
				return apply(
					(current) => toggleKey(current, "panel:" + id, pinned),
					() => {
						if (typeof onPinnedChange === "function") onPinnedChange(id, pinned);
					}
				);
			};

			const isCollected = (row) => collected.has("panel:" + row.id) || row.pinned === false;
			// `plugins` 是官方硬保护的面板（setPinned 里直接 return，永远钉住）。
			// 它通常不出现在 panellist 里，但一旦出现，绝不能让它进「可收起」集合：
			// 否则配置里会留下 panel:plugins，而重启后 applyPanelPins 又跳过它，
			// 菜单就会谎称它「已收进」，实际按钮还在侧边栏。
			const isLocked = (row) => row.id === ALWAYS_PINNED;

			const shown = rows.filter((row) => !isCollected(row));
			const hiddenRows = rows.filter((row) => isCollected(row));
			const term = query.trim().toLowerCase();
			const match = (row) => {
				if (term.length === 0) return true;
				const label = typeof row.label === "string" ? row.label : String(row.id || "");
				return label.toLowerCase().includes(term) || String(row.id || "").toLowerCase().includes(term);
			};

			const openPanel = (id) => {
				try {
					if (typeof onOpen === "function") onOpen(id);
				} catch {
					/* 忽略 */
				}
				if (typeof onDismiss === "function") onDismiss();
			};

			const restorePanel = (id) => {
				setPanelPinned(id, true);
				openPanel(id);
			};

			const rowView = (row, mode) =>
				jsxs(
					"div",
					{
						className: "dso-row",
						key: mode + ":" + row.id,
						children: [
							jsxs(
								"button",
								{
									type: "button",
									className: "dso-rowMain",
									title: row.id,
									onClick: () => (mode === "hidden" ? restorePanel(row.id) : openPanel(row.id)),
									children: [
										jsx("i", { className: "dso-dot", "data-active": row.active === true ? "true" : "false" }),
										jsx("span", { children: typeof row.label === "string" ? row.label : row.id }),
									],
								}
							),
							mode === "hidden"
								? jsx("button", {
										type: "button",
										className: "dso-act",
										disabled: !ready,
										title: t("show"),
										onClick: () => setPanelPinned(row.id, true),
										children: t("show"),
									})
								: jsx("button", {
										type: "button",
										className: "dso-act",
										// 受保护面板（plugins）既不能收，也不该被点成「已收进」。
										// 禁用 + 给出原因，比默默失败诚实。
										disabled: !ready || isLocked(row),
										title: isLocked(row) ? t("locked") : t("hide"),
										onClick: () => {
											if (isLocked(row)) return;
											setPanelPinned(row.id, false);
										},
										children: t("hide"),
									}),
						],
					}
				);

			const visibleHidden = hiddenRows.filter(match);
			// footerItems 必须先算：下面判「失效键」要拿它的长度。
			// 底部工具区：DOM 顺序枚举，index 语义与 FooterProbe 的 footer:<index> 必须一致。
			const footerItems = readFooterItems();
			const footerRows = footerItems.filter((item) => match({ id: "footer:" + item.index, label: item.label }));
			const setFooterHidden = (index, hide) => {
				apply((current) => toggleKey(current, "footer:" + index, !hide));
			};
			// hidden 里同时存着 panel:<id> 与 footer:<index> 两类键；
			// 第三类（没有任何前缀的脏数据）也要能清掉。
			const panelHidden = hidden.filter((entry) => entry.slice(0, 6) === "panel:");
			const footerHidden = hidden.filter((entry) => entry.slice(0, 7) === "footer:");
			const otherHidden = hidden.filter((entry) => entry.slice(0, 6) !== "panel:" && entry.slice(0, 7) !== "footer:");
			// 配置里可能残留已卸载插件的 panel:<id>。
			// 这类键没有对应行可渲染，但必须能被「全部恢复」清掉，
			// 否则会永久卡在配置里。
			const stalePanelHidden = panelHidden.filter(
				(key) => !rows.some((row) => row && "panel:" + row.id === key)
			);
			// 底部键是按下标定位的。按钮数变少后，超出范围的
			// footer:<index> 没有对应行可渲染，同样得能被清掉，
			// 否则下次真有新按钮落到那个下标时会被默默藏掉。
			const staleFooterHidden = footerHidden.filter((key) => {
				const index = Number(key.slice(7));
				return !Number.isInteger(index) || index < 0 || index >= footerItems.length;
			});
			// 计数只数真正渲染出来的行数。
			// 早先用 panelHidden.length 去数已卸载面板，会出现「· 2」但只有 1 行。
			const hiddenCount = visibleHidden.length;
			// 分组里只会出现面板行（底部键自有「底部工具区」那一组），
			// 所以只有有效底部键时就不要渲染它——否则会出现只有标题和
			// 「全部恢复」、一行都没有的空分组。只剩失效键时却必须渲染，
			// 否则那些键永远清不掉（它们在底部那组里也没有对应行）。
			const orphanKeys = stalePanelHidden.length + staleFooterHidden.length + otherHidden.length;
			// 判据要跟着「真的有行被收起来」走，不能只看配置里有没有 panel: 键。
			// 官方 pin store 里被置为 unpinned 的面板同样算收起（见 isCollected 的兜底），
			// 这种条目配置里没有键；若此时仍按 panelHidden 判断，分组不渲染，
			// 该面板既不在「留在侧边栏」也不在「已收进「更多」」里，等于凭空消失且无法恢复。
			const showHiddenGroup =
				term.length > 0
					? visibleHidden.length > 0
					: hiddenRows.length > 0 || orphanKeys > 0;
			// 分组名只在真有面板被收起时叫「已收进「更多」」。
			// 标题要跟真正渲染出来的面板行走：
			// 只剩失效键时不能叫「已收进「更多」」（那里一行面板都没有）。
			const hiddenTitle = hiddenRows.length > 0 ? t("hiddenGroup") : t("hiddenGeneric");
			// 失效键单独说明；底部键的状态已经在底部工具区那组里逐行标出，不重复。
			const staleNote =
				term.length === 0 && orphanKeys > 0
					? t("staleHidden").replace("{n}", String(orphanKeys))
					: null;
			const visibleShown = shown.filter(match);

			return jsxs(
				"div",
				{
					className: "dso-menu",
					// 官方 Menu 外层已经有 role="menu"，这里只补一个分组名，
					// 让读屏软件说得出「侧边栏收纳」而不是一串裸按钮。
					role: "group",
					"aria-label": t("title"),
					// 菜单内部点击不该冒泡到官方 Menu 的关闭逻辑
					onPointerDown: (event) => event.stopPropagation(),
					onClick: (event) => event.stopPropagation(),
					children: [
						jsx("div", {
							className: "dso-search",
							children: jsx("input", {
								type: "search",
								value: query,
								placeholder: t("search"),
								"aria-label": t("search"),
								onChange: (event) => setQuery(event.target.value),
								// 这里不接管 Esc：官方 Menu 在更外层用捕获监听处理 Esc
								// 关闭菜单，元素级的 onKeyDown 根本收不到。清空搜索词靠
								// type="search" 自带的清除按钮（×）即可。
							}),
						}),
						jsxs(
							"div",
							{
								className: "dso-scroll",
								children: [
									showHiddenGroup
										? jsxs(
											"div",
											{
												className: "dso-group",
												children: [
													jsxs("div", {
														className: "dso-groupTitle",
														children: [
															jsx("span", { children: hiddenTitle + (hiddenCount > 0 ? " · " + hiddenCount : "") }),
															ready
																? jsx("button", {
																	type: "button",
																	className: "dso-restore",
																	onClick: () => {
																		// 清空整个 hidden：panel: 与 footer: 一起恢复。历史遗留的 panel:plugins
																		// 也会被一并抹掉（空数组即全清），不需要额外过滤。
																		apply([]);
																	},
																	children: t("restoreAll"),
																})
																: null,
														],
													}),
													visibleHidden.length > 0
														? jsx("div", { className: "dso-group", children: visibleHidden.map((row) => rowView(row, "hidden")) })
														: null,
													staleNote ? jsx("p", { className: "dso-note", children: staleNote }) : null,
												],
											}
										)
										: term.length > 0
											? null
											: jsx("p", { className: "dso-note", children: t("noHidden") }),
									visibleShown.length > 0
										? jsxs(
												"div",
												{
													className: "dso-group",
													children: [
														jsx("div", {
															className: "dso-groupTitle",
															children: jsx("span", { children: t("shownGroup") + " · " + visibleShown.length }),
														}),
														jsx("div", { className: "dso-group", children: visibleShown.map((row) => rowView(row, "shown")) }),
													],
												}
											)
										: null,
									term.length > 0 &&
									visibleHidden.length === 0 &&
									visibleShown.length === 0 &&
									footerRows.length === 0
										? jsx("p", { className: "dso-empty", children: t("empty") })
										: null,
									footerRows.length > 0
										? jsxs(
											"div",
											{
												className: "dso-group",
												children: [
													jsxs("div", {
														className: "dso-groupTitle",
														children: [
															jsx("span", { children: t("footerGroup") + " · " + footerRows.length }),
															jsx("span", { className: "dso-hint", children: t("footerHint") }),
														],
													}),
													jsx("div", {
														className: "dso-group",
														children: footerRows.map((item) => {
															const key = "footer:" + item.index;
															const held = collected.has(key);
															return jsxs(
																"div",
																{
																	className: "dso-row",
																	key,
																	children: [
																		jsxs("div", {
																			className: "dso-rowMain",
																			title: item.label,
																			children: [
																				jsx("i", {
																					className: "dso-dot",
																					"data-active": held ? "false" : "true",
																				}),
																				jsx("span", { children: item.label }),
																			],
																		}),
																		jsx("button", {
																			type: "button",
																			className: "dso-act",
																			disabled: !ready,
																			title: held ? t("show") : t("hide"),
																			onClick: () => setFooterHidden(item.index, !held),
																			children: held ? t("show") : t("hide"),
																		}),
																	],
																}
															);
														}),
													}),
												],
											}
										)
										: null,
									!ready && state && state.status === "ready"
										? jsx("p", { className: "dso-note dso-error", children: t("unavailable") })
										: null,
								],
							}
						),
					],
				}
			);
		}

		// ── 底部工具区：best-effort 隐藏探针 ─────────────────────────────
		// `sidebar.footer.action` 没有官方 pin 机制，只能按渲染顺序对齐 DOM。
		// 探针只当锚点用，真正干活的是 applyFooterHidden —— 它和菜单枚举共用
		// footerItemNodes，保证「看到第几行」和「藏掉第几行」永远是同一行。
		function FooterProbe(props) {
			const overflow = props.overflow || {};
			const form = overflow.form;
			const state = useSnapshot(form);
			const hidden = hiddenOf(state);

			// 没有依赖数组：每次渲染都重新对齐一次，配置变化由 useSnapshot 触发。
			react.useEffect(() => {
				applyFooterHidden(hidden);
			});

			// 底部条目可能在我们之后才渲染（插件多、条件性返回 null 的条目在数据
			// 到位后才出现）。观察容器结构变化再补一次，否则「第一次没对齐」会一直
			// 错到下次配置变化。
			react.useEffect(() => {
				if (typeof MutationObserver !== "function") return undefined;
				const container = footerContainer();
				if (!container) return undefined;
				let queued = false;
				const flush = () => {
					queued = false;
					applyFooterHidden(hidden);
				};
				const observer = new MutationObserver(() => {
					if (queued) return;
					queued = true;
					if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
					else setTimeout(flush, 16);
				});
				try {
					observer.observe(container, { childList: true, subtree: true });
				} catch {
					return undefined;
				}
				return () => {
					try {
						observer.disconnect();
					} catch {
						/* 忽略 */
					}
				};
			}, [form]);

			// 卸载/禁用插件时把被藏起来的底部按钮还回去。没有这一步，插件一禁用，
			// 那些按钮会一直 display:none 到下次整页刷新。
			react.useEffect(() => () => restoreFooterHidden(), []);

			return jsx("span", { "data-dso-probe": "1", "aria-hidden": "true", style: { display: "none" } });
		}

		// ── 挂载 ─────────────────────────────────────────────────────────
		function apply(ctx) {
			ctx.effect(() => {
				if (typeof document === "undefined") return undefined;
				if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]") !== null) return undefined;
				const tag = document.createElement("style");
				tag.dataset.plugin = NS;
				tag.dataset.pluginCss = CSS_TAG;
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "dsh-sidebar-overflow: styles");

			// locale 与 configForms 都是启动后期才就位的服务：locale 自己 inject 了
			// remote + configForms，而 configForms 的宿主 ui-settings 挂在 remote →
			// connection 这条重连链下游。把它们写进主条目的 inject，就等于让主条目在
			// 启动末尾的连接事件里再做一次 unload → reload；宿主 boot 检查点恰好在
			// 那个窗口读状态，就会读到 LOADING 并判定 "entry did not activate"，
			// 整个 UI 挂载随之中止。
			// 所以改成子纤维注入：主条目只依赖稳定的 slots，服务到齐后子纤维自己加载，
			// 中途的 load/unload 抖动不再波及主条目。
			ctx.inject(["locale", "configForms"], (sub) => {
				const t = sub.locale.bind(NS);
				sub.effect(() => sub.locale.register(NS, { zh, en }), "dsh-sidebar-overflow: dictionaries");

				const form = sub.configForms.get(NS);

				// 启动恢复：不等菜单打开，直接拿官方 setPinned 把配置回放进去。
				// 这里的三个时序陷阱都必须兜住，否则表现就是「重启后全显示，点一下才生效」：
				//  1) 官方 pin store 是纯内存的（sidebar 每次 apply 都新建 unpinned 存储），
				//     sidebar 条目重建一次，我们回放进去的 pin 就全丢；
				//  2) sidebar 槽位、panellist 列表都可能比我们晚注册，早跑一次 sync 拿到
				//     的是空列表，之后没人再叫我们；
				//  3) 面板列表变化（其它插件后注册）不会触发 sidebar 槽位的订阅。
				// 所以：订阅 slots + form + hooks.panels，再加一段退避重试与低频巡检。
				sub.effect(() => {
					let stopped = false;
					let lastFace;
					let retryTimer;
					let retry = 0;

					const sync = () => {
						if (stopped) return false;
						const snap = form && typeof form.getSnapshot === "function" ? form.getSnapshot() : undefined;
						if (!snap || snap.status !== "ready") return false;
						const face = grabSidebarControls(sub);
						if (!face) return false;
						lastFace = face;
						const hidden = hiddenOf(snap);
						applyPanelPins(face, hidden);
						// 底部条目走 DOM，不依赖官方 pin；启动时一并回放。
						applyFooterHidden(hidden);
						// 成功一次就把退避预算清零：后面再遇到时序抖动还能重新重试。
						retry = 0;
						return true;
					};

					// 退避重试：120ms 起，最多 12 次（约 5s），专治「重启后槽位还没就位」。
					const scheduleRetry = () => {
						if (stopped || retry >= 12) return;
						const delay = Math.min(120 * Math.pow(1.6, retry), 1500);
						retry += 1;
						retryTimer = setTimeout(() => {
							retryTimer = undefined;
							if (stopped) return;
							if (!sync()) scheduleRetry();
						}, delay);
					};

					if (!sync()) scheduleRetry();

					const disposers = [];
					const onSlotsChange = () => {
						if (stopped) return;
						if (!sync()) scheduleRetry();
					};
					if (typeof sub.slots.subscribe === "function") {
						disposers.push(sub.slots.subscribe("sidebar", onSlotsChange));
						disposers.push(sub.slots.subscribe(PANEL_SLOT, onSlotsChange));
					}
					if (form && typeof form.subscribe === "function") {
						disposers.push(form.subscribe(onSlotsChange));
					}
					// 面板列表本身：hooks.panels 是官方快照 store，面板增减时它会通知。
					// 放在 sync 成功后补订阅（第一次拿不到 hooks 也要能补上）。
					const watchPanels = () => {
						if (stopped) return;
						const face = lastFace || grabSidebarControls(sub);
						const panels = face && face.hooks && face.hooks.panels;
						if (!panels || typeof panels.subscribe !== "function") return;
						try {
							disposers.push(panels.subscribe(() => {
								if (!stopped) sync();
							}));
						} catch {
							/* 忽略 */
						}
					};
					watchPanels();
					if (!lastFace) {
						// 第一次没拿到 face 时，等重试成功后补订阅 panels。
						const timer = setTimeout(watchPanels, 1200);
						disposers.push(() => clearTimeout(timer));
					}

					// 低频巡检：pin store 被官方重建（sidebar unload→reload）后，
					// 订阅可能整体失效而没有任何通知。巡检代价极小（只比内存数组）。
					const patrol = setInterval(() => {
						if (stopped) return;
						if (!sync()) scheduleRetry();
					}, 4000);

					// 从后台切回前台时补一次：Electron 里标签页被挂起过，
					// 期间的通知可能整段丢失。
					const onVisible = () => {
						if (stopped) return;
						if (document.visibilityState === "visible") sync();
					};
					if (typeof document !== "undefined" && document.addEventListener) {
						document.addEventListener("visibilitychange", onVisible);
						disposers.push(() => document.removeEventListener("visibilitychange", onVisible));
					}

					return () => {
						stopped = true;
						if (retryTimer !== undefined) clearTimeout(retryTimer);
						clearInterval(patrol);
						for (const off of disposers) {
							try {
								if (typeof off === "function") off();
							} catch {
								/* 忽略 */
							}
						}
						// 停用/卸载时把官方内存 pin 与底部隐藏全部还原。
						// 官方 pin store 是内存态，而「更多」按钮是由我们的菜单槽位撑起来的：
						// 插件一停，按钮跟着消失，被收起的面板在当前页面既看不见、也没有
						// 任何入口能放回来（只剩刷新页面自救）。所以这里主动还原成全可见。
						try {
							applyPanelPins(lastFace || grabSidebarControls(sub), []);
						} catch {
							/* 忽略 */
						}
						try {
							restoreFooterHidden();
						} catch {
							/* 忽略 */
						}
					};
				}, "dsh-sidebar-overflow: restore pins");

				const injection = () => ({ overflow: { form, ctx: sub } });

				// 菜单内容：注册进官方「更多」菜单，同时因为这个槽位非空，
				// 官方「更多」按钮才会出现。
				sub.effect(
					() =>
						sub.configForms.whileServed([NS], () =>
							sub.slots.register(
								{
									name: MENU_SLOT,
									id: "dsh-sidebar-overflow.menu",
									order: -1000,
									locale: NS,
									inject: injection,
								},
								OverflowMenu
							)
						),
					"dsh-sidebar-overflow: more menu"
				);

				// 底部工具区探针
				sub.effect(
					() =>
						sub.configForms.whileServed([NS], () =>
							sub.slots.register(
								{
									name: FOOTER_SLOT,
									id: "dsh-sidebar-overflow.probe",
									order: 100000,
									locale: NS,
									inject: injection,
								},
								FooterProbe
							)
						),
					"dsh-sidebar-overflow: footer probe"
				);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
