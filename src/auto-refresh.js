// Auto-refresh scheduling for the dashboard: while the page
// stays open, the SNS snapshot and history are re-fetched on an
// interval so an hourly collection lands on screen without a
// manual reload. The collection itself runs once an hour, so
// the interval stays coarse — ten minutes is soon enough to
// catch the new collection within a few minutes of it landing,
// and finer polling would only re-read the same payload.
//
// The scheduler owns no rendering: the caller hands it an
// onRefresh callback and applies whatever comes back. The rules
// it does own:
//   - a tick that finds the tab hidden is skipped, so a page
//     left open in a background tab costs no requests;
//   - when the tab becomes visible again and the interval has
//     elapsed since the last refresh, a refresh runs right
//     away instead of waiting out the rest of the interval;
//   - refreshes never overlap: a tick that lands while one is
//     still in flight is dropped, not queued;
//   - a failed refresh never stops the schedule — the next
//     tick retries.

export const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function createAutoRefresher({
  intervalMs = AUTO_REFRESH_INTERVAL_MS,
  onRefresh,
  isHidden = () => document.hidden,
  now = () => Date.now(),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
  addVisibilityListener = (fn) => {
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  },
} = {}) {
  let timer = null;
  let removeVisibilityListener = null;
  // The last time a refresh completed (or the schedule started:
  // the initial load has just landed, so the first interval is
  // measured from start).
  let lastRefreshAt = null;
  let inFlight = false;

  async function runRefresh() {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      await onRefresh();
    } catch {
      // A failed refresh leaves the caller's current display
      // untouched; the schedule carries on and the next tick
      // retries.
    } finally {
      inFlight = false;
      lastRefreshAt = now();
    }
  }

  function tick() {
    if (isHidden()) {
      return;
    }
    void runRefresh();
  }

  function onVisibilityChange() {
    if (isHidden() || lastRefreshAt === null) {
      return;
    }
    if (now() - lastRefreshAt >= intervalMs) {
      void runRefresh();
    }
  }

  return {
    // Starts the schedule from the moment the caller's initial
    // data has loaded. Starting twice keeps the first schedule.
    start() {
      if (timer !== null) {
        return;
      }
      lastRefreshAt = now();
      timer = setTimer(tick, intervalMs);
      removeVisibilityListener = addVisibilityListener(onVisibilityChange);
    },
    stop() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      if (removeVisibilityListener) {
        removeVisibilityListener();
        removeVisibilityListener = null;
      }
    },
    isRunning() {
      return timer !== null;
    },
  };
}
