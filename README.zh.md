# dsh-session-stepper

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：**按「谁在等我」切换会话**，
而不是按时间顺序翻。

原版 DSH 没有「上一个 / 下一个会话」命令。这个插件补上两条，并按**注意力**排序——一次按键直达卡在
提问上的那个 Agent，而不是最近被碰过的那个会话。

| 命令 | 桌面版 Windows 默认键 |
|---|---|
| `dsh-session-stepper.next` | `Ctrl+Tab` |
| `dsh-session-stepper.prev` | `Ctrl+Shift+Tab` |

两条命令都注册进官方快捷键服务，所以在速查表（`Ctrl+/`）里能看到，也能像内置命令一样改绑。

## 什么算「需要我」

排名靠前者优先；同排名按 `updatedAt` 从新到旧。

| 优先级 | 条件 | 读取位置 |
|---|---|---|
| 1 | Agent 卡在提问上等人回答 | `projectionValues.userQuestions.active.length > 0` |
| 2 | 有排队等执行的消息 | `projectionValues.inbox['next-turn' \| 'next-step'].length > 0` |
| 3 | Agent 正在运行 | `row.running` |
| 4 | 会话刚刚更新（侧边栏的绿点） | `row.updatedAt` 在 15 分钟内 |

空白会话、已归档会话、没有数据的行一律不计。当前所在的会话留在队列里作为「起点」，但永远不会成为目标；
队列只剩它自己时，命令会报告「现在没有需要你的会话」而不是原地打转。一条都不满足时，命令被**阻止**，视图不动。

## 安装

从本地目录安装：

```
plugin_manager install_bundle --target /path/to/dsh-session-stepper
```

从 GitHub 安装（发布后）：

```
dsh plugin add github:Ghostdogge/dsh-session-stepper
```

客户端半区是热应用的：改完 `client.js` 后移除再安装这个 bundle，命令即刻生效，无需重启 DSH。

## 实现方式

1. `ctx.shortcuts.register(...)` 注册两条命令，只声明 `desktop:windows` 的默认键。
2. 触发时读 `ctx.sessions.list` 快照，按上面的规则排序。
3. 调 `ctx.uiWorkspace.openSession(id)`——和点侧边栏走同一条导航路径，草稿、面板、历史加载都交给宿主。

它**不监听 `keydown`**：桌面版的键盘先在 Electron 主进程过一遍，只有登记进官方命令目录的组合才会送到页面。

**轮询，不是事件。** 探针实测 `approval/request`、`question/request`、`session/activity` 等名字上零事件，
所以队列由列表快照计算。列表里每一行——包括后台会话——都带着自己的 projection，不需要先打开会话。

### 为什么只给 Windows 桌面版默认键

Tab 在 Web 版是浏览器保留键，Linux 桌面收不到，macOS 被系统应用切换器吃掉。在这些平台声明默认键会让整条注册抛错，
因此只有 `desktop:windows` 带默认键。其他平台命令依然存在，可在 `Ctrl+/` 里自行改绑。

## 已知限制

- 依赖 `ctx.sessions.list` 与 `ctx.uiWorkspace.openSession` 两个客户端内部接口；DSH 若重命名或改结构，插件需跟随更新。
- **审批不是一条通道。** 列表行带 `userQuestions`、`inbox`、`permissions`——其中 `permissions` 是策略值而非请求——
  没有找到「待审批」字段。在「询问用户批准」策略下，审批可能挂起却不进入这个队列。若 DSH 暴露该信号，加一个 0 级通道是很小的改动。
- 15 分钟的新鲜度窗口是 `client.js` 里的常量（`RECENT_WINDOW_MS`），不是配置项。

## 测试

```
npm test        # 或：node test/needs.test.mjs
```

覆盖：优先级排序、同排名按时间、双向环绕、从队列外进入、空白/归档过滤、空队列时阻止。

## 来源说明

改编自 [`dsh-session-switch`](https://www.npmjs.com/package/dsh-session-switch) v1.0.0（作者 **chenjiamian**，MIT）：
命令注册、会话列表读取、以及「通过 `uiWorkspace.openSession` 导航」的做法来自该项目。本插件新增的是
「需要我」队列的筛选、排序与步进行为。

## 许可

MIT，见 [LICENSE](LICENSE)。
