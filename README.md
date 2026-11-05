# dsh-session-stepper

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin: **step through the
sessions that actually need you**, instead of walking the list by date.

Stock DSH has no previous/next-session command. This adds two, and orders them by attention
rather than by timestamp — so one keystroke takes you to the agent that is blocked on a question,
not to whichever session happens to have been touched most recently.

| Command | Default (desktop Windows) |
|---|---|
| `dsh-session-stepper.next` | `Ctrl+Tab` |
| `dsh-session-stepper.prev` | `Ctrl+Shift+Tab` |

Both are registered in the official shortcut service, so they appear in the cheatsheet
(`Ctrl+/`) and can be rebound there like any built-in command.

## What counts as "needs you"

Lower rank wins; ties break on the most recent `updatedAt`.

| Rank | Condition | Read from |
|---|---|---|
| 1 | an agent is blocked on a question | `projectionValues.userQuestions.active.length > 0` |
| 2 | queued work is waiting | `projectionValues.inbox['next-turn' \| 'next-step'].length > 0` |
| 3 | the agent is running | `row.running` |
| 4 | the session changed recently (the sidebar's green dot) | `row.updatedAt` within 15 minutes |

Blank rows, archived sessions and rows without data never qualify. The session you are on stays
in the queue as a position to step from but is never a destination; when it is the only one,
the command reports "nothing needs you" rather than jumping in place. Nothing qualifies ⇒ the
command is blocked and the view does not move.

## Install

From a checkout or a local directory:

```
plugin_manager install_bundle --target /path/to/dsh-session-stepper
```

From GitHub (once published):

```
dsh plugin add github:OWNER/dsh-session-stepper
```

Client halves are hot-applied: after changing `client.js`, remove and reinstall the bundle and the
new commands appear without restarting DSH.

## How it works

1. `ctx.shortcuts.register(...)` registers both commands, with a `desktop:windows` default only.
2. On press the plugin reads the `ctx.sessions.list` snapshot, ranks the rows as above, and
3. calls `ctx.uiWorkspace.openSession(id)` — the same navigation path the sidebar uses, so drafts,
   panels and history loading stay the host's business.

It does **not** listen for `keydown`: on Desktop the keyboard passes through the Electron main
process first, and only combinations registered in the official catalogue reach the page.

**Polled, not evented.** A probe measured zero events on `approval/request`, `question/request`,
`session/activity` and similar names, so the queue is computed from the list snapshot. Every row
in the list — background sessions included — carries its projections, so no session has to be
opened first.

### Why only the Windows desktop binding

Tab is a reserved key in the Web build, is never delivered on the Linux desktop, and is taken by
the system app switcher on macOS. Declaring a default there would make the whole registration
throw, so only `desktop:windows` carries one. The commands still exist everywhere and can be
bound by hand in `Ctrl+/`.

## Known limits

- Rides `ctx.sessions.list` and `ctx.uiWorkspace.openSession`. Both are internal to the client; a
  DSH release that renames or reshapes them breaks this plugin until updated.
- **Pending approvals are not a lane.** The list rows carry `userQuestions`, `inbox` and
  `permissions` — where `permissions` is the policy value, not a request — and no pending-approval
  field was found. Under the "ask for approval" policy an approval can pend without appearing in
  this queue. If DSH exposes a signal for it, adding rank 0 is a small change.
- The 15-minute recency window is a constant (`RECENT_WINDOW_MS` in `client.js`), not a setting.

## Test

```
npm test        # or: node test/needs.test.mjs
```

Covers priority order, recency tie-break, wraparound in both directions, entering the queue from
outside, blank/archived filtering, and the empty-queue block.

## Credit

Adapted from [`dsh-session-switch`](https://www.npmjs.com/package/dsh-session-switch) v1.0.0 by
**chenjiamian** (MIT): the command registration, the session-list reads and the
"navigate through `uiWorkspace.openSession`" approach are theirs. The needs-queue selection,
ranking and stepping behaviour are what this plugin adds.

## License

MIT — see [LICENSE](LICENSE).
