# dsh-pwsh-patch 专属指南（pwsh 硬化补丁）

> 本文档是给 DSH Agent 执行的操作手册。宿主插件在每次 DSH 启动时自动检测并重打补丁；
> 本文档用于：更新总纲流程里的体检、以及 state=drift 时的人工移植。

## 0. 基线信息

- 插件：dsh-pwsh-patch 0.1.0（仓库 `Hua1Q1nG/dsh-pwsh-patch`，public / main）
- 作用对象（相对安装目录）：
  - `resources\app\node_modules\@deepseek-ai\dsh-pwsh-local\lib\index.js`
  - `resources\app\node_modules\@deepseek-ai\dsh-tool-pwsh\lib\index.js`
- 补丁内容：COMMAND_PREAMBLE（fail-fast + 进度条静默 + PS7 纯文本 + 原生退出码 + UTF-8）、
  ENV_OVERRIDES 遥测静默、工具描述/系统提示的 fail-fast 语义与 ConvertTo-Json 建议
- 基线：DSH Desktop 0.1.9 / @deepseek-ai/* 0.1.0-rc.6（payload.json 的 baseline 字段）
- 状态文件：`<DSH_HOME>\pwsh-patch\state.json`
- 补丁数据（单一事实源）：`profiles\node_modules\dsh-pwsh-patch\patch\payload.json`
- 人类可读记录：同目录 `patch\dsh-pwsh-hardening.diff`

## 1. 快速体检（每次「更新全局插件」流程必做）

1. 读 `state.json`：`ok: true` 且两个 target 均为 `ok/already applied`；
2. `GET /pwsh-patch/state` 返回 200；
3. 两个目标文件中存在 `COMMAND_PREAMBLE`（grep 确认）；
4. 对两个目标文件执行 `node --check` 通过。
任一失败 → 走第 3 节人工移植。

## 2. 完整体检（核心依赖版本变化时）

在第 1 节基础上，额外：
1. 自测：在插件目录执行 `node --test tests/host.test.mjs`（需要 `DSH_PWSH_TEST_INSTALL`
   指向真实安装目录，默认自动探测常见路径）；期望 6/6 通过（含字节级一致性：
   重建基线 → 重打 → 与真实文件逐字节相同）；
2. 浏览器：设置 →「pwsh 硬化补丁」页正常显示，点「立即检测并重打」无报错；
3. 启动图谱含 dsh-pwsh-patch 条目；`GET /plugins/dsh-pwsh-patch/client.js` 返回 200；
4. 实测 pwsh 工具：`Get-ChildItem C:\no-such-dir-xyz` 应报 `[exit code: 1]` 并终止后续语句
   （PowerShell 7.3+ 下原生命中失败同样 fail-fast；5.1 下仅 cmdlet 错误 fail-fast，
   原生命中失败仍可能 exit 0 —— 建议本机安装 PowerShell 7：`winget install Microsoft.PowerShell`）。

## 3. 人工移植（state=drift / 部分应用时）

上游升级导致基线文本找不到时，applier 会拒绝猜测并置 drift。移植步骤：
1. 打开漂移目标文件，对照 `patch/payload.json` 对应 hunk 的 find/replace 语义，
   把新基线代码改写为包含本补丁的等价版本（4 处 + 2 处，见第 0 节补丁内容清单）；
2. 更新 `payload.json`：hunk 的 `find` 改为新基线原文、`replace` 改为移植后结果
   （改完 `node --check` 校验 JSON 文件）；同步更新 `patch/dsh-pwsh-hardening.diff` 与
   `baseline` 字段的版本号；
3. 重跑 `node --test tests/host.test.mjs` 全绿后，用 `POST /pwsh-patch/run` 或重启应用重打一次；
4. 同步 GitHub：先普通 git push（插件目录已有 origin 指向仓库）；失败按总纲第 5 节用一次性 token 走 Git Data API 上传，用后撤销。

## 4. 报告模板

```
pwsh 硬化补丁体检：
- 状态：ok=true / drift（原因）
- 目标文件：2/2 already applied（或 已重打、需重启）
- 自测：tests 6/6；语法检查：通过
- 设置页 / 路由：正常
- 需要用户操作：重启应用 / 人工移植（drift）
```
