# Changelog

All notable changes to this plugin. Format loosely follows Keep a Changelog; versions follow SemVer.

## [0.2.0] — 2026-11-06

### Changed
- Stepping is now **needs-queue based** instead of chronological: rank 1 = agent blocked on a
  question, 2 = queued work waiting, 3 = running, 4 = updated within 15 minutes; ties break on
  `updatedAt`.
- Command labels and aliases updated to "previous/next session that needs me" (中英双语).
- The current session is kept in the queue as a position but never becomes a destination; a queue
  of one reports "nothing needs you" instead of jumping in place.

### Fixed
- Excluding the current session from the queue made stepping degenerate (always re-entering at the
  head). Covered by tests.

## [0.1.1] — 2026-11-06

### Fixed
- Stepping used raw `ctx.sessions.list.ids` order, which is not the sidebar order. Candidates are
  now sorted by `updatedAt` descending first, matching what the user sees.

## [0.1.0] — 2026-11-06

### Added
- Two commands (`prev` / `next`) stepping the session list, `desktop:windows` defaults
  `Ctrl+Shift+Tab` / `Ctrl+Tab`.
- Navigation through `ctx.uiWorkspace.openSession`, i.e. the sidebar's own path.
