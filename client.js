/**
 * dsh-session-stepper — browser half.
 *
 * Steps through the sessions that NEED you, in priority order:
 *   1. an agent is blocked on a question        (projectionValues.userQuestions.active)
 *   2. queued work is waiting                   (projectionValues.inbox[*])
 *   3. the agent is running                     (row.running)
 *   4. the session was updated just now         (row.updatedAt within RECENT_WINDOW_MS)
 *
 * Within one priority the most recently updated comes first; the list wraps and skips
 * the session you are already on. If nothing needs you the command reports that instead
 * of jumping somewhere arbitrary.
 *
 * Adapted from `dsh-session-switch` v1.0.0 by chenjiamian (MIT): the command
 * registration, session-list reads and `uiWorkspace.openSession` navigation are theirs.
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-stepper',
  factory(require) {
    const NS = 'dsh-session-stepper'

    /** A session updated within this window counts as "just changed" (the green dot). */
    const RECENT_WINDOW_MS = 15 * 60 * 1000

    const DICT = {
      zh: {
        'command.prev': '上一个需要我的会话',
        'command.next': '下一个需要我的会话',
        'shortcut.none': '现在没有需要你的会话',
        'shortcut.unavailable': '会话列表还没就绪',
      },
      en: {
        'command.prev': 'Previous session that needs me',
        'command.next': 'Next session that needs me',
        'shortcut.none': 'Nothing needs you right now',
        'shortcut.unavailable': 'Session list is not ready yet',
      },
    }

    /** Locale-bound translator with a built-in fallback. */
    function makeTranslate(ctx) {
      return (key) => {
        let locale
        try {
          locale = ctx.get('locale')
        } catch (error) {
          locale = undefined
        }
        try {
          const translate =
            locale !== undefined && locale !== null && typeof locale.bind === 'function'
              ? locale.bind(NS)
              : undefined
          if (typeof translate === 'function') {
            const raw = translate(key)
            if (typeof raw === 'string' && raw !== '' && raw !== key) return raw
          }
        } catch (error) {
          /* fall through to the embedded dictionary */
        }
        const id =
          locale !== undefined && locale !== null && typeof locale.getLocale === 'function'
            ? locale.getLocale()?.id
            : undefined
        const table = id === 'en' ? DICT.en : DICT.zh
        return table[key] ?? DICT.zh[key] ?? key
      }
    }

    /** Pending questions in one row (agents blocked on a human). */
    function pendingQuestions(row) {
      const active = row?.projectionValues?.userQuestions?.active
      return Array.isArray(active) ? active.length : 0
    }

    /** Messages queued for the next turn/step in one row. */
    function pendingInbox(row) {
      const inbox = row?.projectionValues?.inbox
      if (inbox === null || typeof inbox !== 'object') return 0
      let total = 0
      for (const key of ['next-turn', 'next-step']) {
        const list = inbox[key]
        if (Array.isArray(list)) total += list.length
      }
      return total
    }

    /**
     * Why a session needs a human, as an ordering rank; null when it does not.
     * Lower rank wins.
     */
    function needsRank(row, now) {
      if (row === undefined || row === null) return null
      if (row.blank === true) return null
      if (pendingQuestions(row) > 0) return 1
      if (pendingInbox(row) > 0) return 2
      if (row.running === true) return 3
      const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : 0
      if (updatedAt > 0 && now - updatedAt <= RECENT_WINDOW_MS) return 4
      return null
    }

    function createStepper(ctx) {
      const listOf = () => {
        const sessions = ctx.get('sessions')
        const list = sessions?.list
        if (list === undefined || list === null || typeof list.getSnapshot !== 'function') return undefined
        return list.getSnapshot()
      }

      const archivedIds = () => {
        try {
          const workspaces = ctx.get('workspaces')
          const snapshot = workspaces?.list?.getSnapshot?.()
          const archived = snapshot?.archivedSessionIds
          return Array.isArray(archived) ? new Set(archived) : new Set()
        } catch (error) {
          return new Set()
        }
      }

      /** Which session the main view currently retains. */
      const readCurrent = () => {
        const list = listOf()
        if (list === undefined) return undefined
        const ids = Array.isArray(list.ids) ? list.ids : []
        return ids.find((id) => (list.byId?.[id]?.retainedBy?.mainView ?? 0) > 0)
      }

      /**
       * Sessions that need a human, best first: rank, then most recently updated.
       * Archived, blank and missing rows are dropped. The current session is kept so
       * the queue has a position to step from; navigation skips it explicitly.
       */
      const needsList = (list) => {
        const now = Date.now()
        const archived = archivedIds()
        const ids = Array.isArray(list.ids) ? list.ids : []
        const entries = []
        for (const id of ids) {
          if (archived.has(id)) continue
          const row = list.byId?.[id]
          if (row === undefined) continue
          const rank = needsRank(row, now)
          if (rank === null) continue
          entries.push({ id, rank, updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0 })
        }
        entries.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : b.updatedAt - a.updatedAt))
        return entries.map((entry) => entry.id)
      }

      const navigate = (sessionId, t) => {
        let uiWorkspace
        try {
          uiWorkspace = ctx.get('uiWorkspace')
        } catch (error) {
          uiWorkspace = undefined
        }
        if (
          uiWorkspace === undefined ||
          uiWorkspace === null ||
          typeof uiWorkspace.openSession !== 'function'
        ) {
          console.warn('[dsh-session-stepper]', t('shortcut.unavailable'))
          return
        }
        try {
          uiWorkspace.openSession(sessionId)
        } catch (error) {
          console.error('[dsh-session-stepper] session switch failed:', error)
        }
      }

      /** Compute one step through the needs list. */
      const step = (delta, t) => {
        const list = listOf()
        if (list === undefined) return { status: 'blocked', reason: t('shortcut.unavailable') }

        const queue = needsList(list)
        if (queue.length === 0) return { status: 'blocked', reason: t('shortcut.none') }

        const current = readCurrent()
        const index = current === undefined ? -1 : queue.indexOf(current)

        if (index < 0) {
          // The session you are on is not in the queue: enter from the matching end.
          const pick = delta > 0 ? queue[0] : queue[queue.length - 1]
          return { status: 'handled', run: () => navigate(pick, t) }
        }

        // Walking from inside the queue: skip the current session, wrap once.
        const n = queue.length
        for (let k = 1; k <= n; k++) {
          const candidate = queue[(((index + delta * k) % n) + n) % n]
          if (candidate !== current) {
            return { status: 'handled', run: () => navigate(candidate, t) }
          }
        }
        return { status: 'blocked', reason: t('shortcut.none') }
      }

      return { step }
    }

    function registerCommand(ctx, t, api, spec) {
      ctx.effect(
        () => {
          try {
            return ctx.shortcuts.register({
              id: spec.id,
              label: () => t(spec.labelKey),
              aliases: spec.aliases,
              defaults: {
                'desktop:windows': spec.binding,
              },
              regions: ['page', 'editable'],
              modals: [],
              resolve: () => api.step(spec.delta, t),
            })
          } catch (error) {
            console.error(`[dsh-session-stepper] could not register ${spec.id}:`, error)
            return () => {}
          }
        },
        `session-stepper: ${spec.id}`,
      )
    }

    return {
      inject: ['shortcuts', 'locale', 'sessions'],

      apply(ctx) {
        const t = makeTranslate(ctx)

        const locale = ctx.get('locale')
        if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, DICT), 'session-stepper: dictionaries')
        }

        const api = createStepper(ctx)

        registerCommand(ctx, t, api, {
          id: 'dsh-session-stepper.prev',
          labelKey: 'command.prev',
          aliases: ['previous session needing attention', '上一个需要我的会话'],
          delta: -1,
          binding: { code: 'Tab', modifiers: ['primary', 'shift'] },
        })

        registerCommand(ctx, t, api, {
          id: 'dsh-session-stepper.next',
          labelKey: 'command.next',
          aliases: ['next session needing attention', '下一个需要我的会话'],
          delta: 1,
          binding: { code: 'Tab', modifiers: ['primary'] },
        })
      },
    }
  },
})
