window.__ModuleLoader__.load({
	id: "dsh-pwsh-patch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		var createElement = react.createElement;
		var Fragment = react.Fragment;
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useCallback = react.useCallback;
		var Button = primitives.Button;

		const name = "pwsh-patch";
		const inject = ["slots", "locale"];
		const NS = "pwsh-patch";

		const zh = {
			nav: "pwsh 硬化补丁",
			title: "pwsh 硬化补丁（自愈）",
			description: "把「pwsh 对 AI 友好」补丁（fail-fast / 关进度条 / 纯文本输出 / UTF-8）打到 DSH 桌面端的 dsh-pwsh-local 与 dsh-tool-pwsh 上。每次启动自动检测，桌面更新覆盖后自动重打；若上游代码变化导致无法自动重打，会在此报警。",
			run: "立即检测并重打",
			running: "检测中…",
			lastRun: "上次检测",
			restart: "补丁刚被打上：重启 DSH 桌面端后生效",
			loading: "加载中…",
			loadFailed: "加载失败：",
			none: "暂无记录"
		};
		const en = {
			nav: "pwsh Hardening Patch",
			title: "pwsh Hardening Patch (self-healing)",
			description: "Keeps the agent-friendly pwsh patch (fail-fast errors, silent progress, plain-text output, UTF-8 pinning) applied to dsh-pwsh-local and dsh-tool-pwsh. Re-checked on every boot and re-applied automatically after desktop updates; raises an alarm when upstream code drift requires a manual re-port.",
			run: "Check & Re-apply",
			running: "Running…",
			lastRun: "Last run",
			restart: "Patch just applied: restart DSH desktop to take effect",
			loading: "Loading…",
			loadFailed: "Failed to load: ",
			none: "No records yet"
		};

		const text = "var(--dsw-alias-label-primary)";
		const muted = "var(--dsw-alias-label-tertiary)";
		const border = "var(--dsw-alias-border-l1)";
		const okGreen = "#2f9e5f";
		const warnAmber = "#c98a1b";
		const failRed = "var(--dsw-alias-state-error-primary)";

		const card = { border: "1px solid " + border, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8, background: "var(--dsw-alias-bg-base)" };
		const row = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: text };
		const mono = { fontFamily: "ui-monospace, monospace", fontSize: 11 };

		function stateColor(s) {
			if (s === "ok" || s === "applied") return okGreen;
			if (s === "drift" || s === "error") return failRed;
			return muted;
		}

		function TargetRow({ item }) {
			const color = stateColor(item.state);
			return createElement("div", { style: { ...card, padding: 10 } },
				createElement("div", { style: row },
					createElement("span", { style: { width: 10, height: 10, borderRadius: "50%", background: color, flex: "none" } }),
					createElement("span", { style: { fontWeight: 600, wordBreak: "break-all", ...mono } }, item.rel),
					createElement("span", { style: { marginLeft: "auto", fontSize: 12, color, flex: "none" } }, item.state)
				),
				createElement("div", { style: { fontSize: 12, color: muted, wordBreak: "break-all" } }, item.detail)
			);
		}

		function Viewer({ t }) {
			const tr = (k) => (t ? t(k) : zh[k]);
			const [state, setState] = useState({ loading: true });
			const [running, setRunning] = useState(false);
			const load = useCallback(() => {
				fetch("/pwsh-patch/state").then((r) => r.json()).then((s) => setState(s)).catch((e) => setState({ loading: false, error: e instanceof Error ? e.message : String(e) }));
			}, []);
			useEffect(() => { load(); const timer = window.setInterval(() => { load(); }, 3000); return () => window.clearInterval(timer); }, [load]);
			const run = useCallback(() => {
				if (running) return;
				setRunning(true);
				fetch("/pwsh-patch/run", { method: "POST" }).then(() => window.setTimeout(load, 300)).catch(() => {}).finally(() => setRunning(false));
			}, [running, load]);

			const results = state.results ?? [];
			const healthy = state.ok === true;
			return createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12, padding: "4px 0 16px 0", width: "100%" } },
				createElement("div", { style: { ...card, flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" } },
					createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2, marginRight: "auto", minWidth: 0 } },
						createElement("div", { style: { fontSize: 15, fontWeight: 600, color: text } }, tr("title")),
						createElement("div", { style: { fontSize: 12, color: muted, maxWidth: 560 } }, tr("description"))
					),
					createElement(Button, { variant: "primary", size: "md", disabled: running, onClick: run }, running ? tr("running") : tr("run"))
				),
				state.ranAt ? createElement("div", { style: { fontSize: 12, color: muted } }, tr("lastRun") + "：" + new Date(state.ranAt).toLocaleString()) : null,
				state.restartRequired ? createElement("div", { style: { fontSize: 12, color: warnAmber, fontWeight: 600 } }, "⚠ " + tr("restart")) : null,
				healthy ? createElement("div", { style: { fontSize: 12, color: okGreen, fontWeight: 600 } }, "✅ " + tr("nav")) : null,
				...(results.map((item) => createElement(TargetRow, { key: item.rel, item: item }))),
				state.error ? createElement("div", { style: { fontSize: 12, color: failRed } }, tr("loadFailed") + state.error) : null,
				results.length === 0 && !state.error ? createElement("div", { style: { fontSize: 12, color: muted } }, state.loading ? tr("loading") : tr("none")) : null
			);
		}

		function Section({ renderSlot, t }) {
			return createElement("div", { style: { width: "100%" } }, renderSlot("settings.pwsh-patch.item", {}));
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "pwsh-patch: dictionaries");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "pwsh-patch",
				order: 96,
				label: () => (ctx.locale ? ctx.locale.bind(NS)("nav") : zh.nav),
				locale: NS,
				children: { "settings.pwsh-patch.item": { kind: "list", scope: "root" } }
			}, Section));
			ctx.slots.inject("settings.pwsh-patch.item", () => ctx.slots.register({
				name: "settings.pwsh-patch.item",
				id: "viewer",
				order: 0,
				locale: NS
			}, Viewer));
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return exports;
	}
});
