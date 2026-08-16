# dsh-pwsh-patch

自愈型宿主插件：把「pwsh 对 AI 友好」补丁持久化到 DSH 桌面端，桌面更新后自动重打。

## 补丁内容（payload 见 patch/payload.json）

- dsh-pwsh-local：命令前置 COMMAND_PREAMBLE（ErrorActionPreference=Stop 快速失败、
  进度条静默、PS7 纯文本输出、原生退出码传播、UTF-8 钉住）；ENV_OVERRIDES 增加
  遥测与更新检查静默变量；argv 模板与导出别名同步。
- dsh-tool-pwsh：pwsh 工具描述与系统提示加入 fail-fast 语义与 ConvertTo-Json 建议。

## 机制

- 每次 DSH 启动（含桌面更新后的首次启动）自动检测两个目标文件：已打 → ok；
  基线完好 → 自动重打并置 restartRequired（重启一次后生效）；上游代码已变 → drift 报警，
  不猜测、不静默跳过。
- 状态写入 <DSH_HOME>/pwsh-patch/state.json；路由 GET /pwsh-patch/state、POST /pwsh-patch/run；
  设置页「pwsh 硬化补丁」可查看与手动重打。
- 仓库：https://github.com/Hua1Q1nG/dsh-pwsh-patch（public / main）。本地改动同步：先普通 git push（插件目录已配 origin），失败按总纲第 5 节用一次性 token 走 Git Data API 上传。

## 自测

```
node --test tests/host.test.mjs
```

测试用 DSH_PWSH_TEST_INSTALL 指定真实安装目录（默认探测常见路径）。人工移植流程见
<DSH_HOME>/pwsh-patch/UPDATE-GUIDE.md 第 3 节。
