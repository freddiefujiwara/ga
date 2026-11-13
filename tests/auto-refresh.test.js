import { describe, it, expect, vi } from "vitest";
import {
  AUTO_REFRESH_INTERVAL_MS,
  createAutoRefresher,
} from "../src/auto-refresh.js";

// The scheduler's rules, exercised with a manual timer, a
// controllable clock and a visibility flag: a tick fires the
// refresh once per interval while the tab is visible, hidden
// ticks are skipped, returning to the tab after the interval
// refreshes at once, refreshes never overlap, and a failure
// neither escapes nor stops the schedule.
function harness({ intervalMs = 1000 } = {}) {
  let currentTime = 0;
  let hidden = false;
  let tickFn = null;
  let visibilityFn = null;
  const onRefresh = vi.fn(async () => {});
  const refresher = createAutoRefresher({
    intervalMs,
    onRefresh,
    isHidden: () => hidden,
    now: () => currentTime,
    setTimer: (fn) => {
      tickFn = fn;
      return "timer";
    },
    clearTimer: () => {
      tickFn = null;
    },
    addVisibilityListener: (fn) => {
      visibilityFn = fn;
      return () => {
        visibilityFn = null;
      };
    },
  });
  return {
    refresher,
    onRefresh,
    tick: () => tickFn && tickFn(),
    visibilityChange: () => visibilityFn && visibilityFn(),
    setHidden: (value) => {
      hidden = value;
    },
    advance: (ms) => {
      currentTime += ms;
    },
    hasTimer: () => tickFn !== null,
    hasVisibilityListener: () => visibilityFn !== null,
  };
}

// runRefresh is fire-and-forget from the tick, so a test waits
// a microtask turn for the callback to land.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("auto-refresh scheduler", () => {
  it("defaults to a ten-minute interval", () => {
    expect(AUTO_REFRESH_INTERVAL_MS).toBe(10 * 60 * 1000);
  });

  it("refreshes once per interval while the tab is visible", async () => {
    const h = harness();
    h.refresher.start();
    expect(h.refresher.isRunning()).toBe(true);
    h.tick();
    await flush();
    expect(h.onRefresh).toHaveBeenCalledTimes(1);
    h.advance(1000);
    h.tick();
    await flush();
    expect(h.onRefresh).toHaveBeenCalledTimes(2);
  });

  it("skips ticks while the tab is hidden", async () => {
    const h = harness();
    h.refresher.start();
    h.setHidden(true);
    h.tick();
    await flush();
    expect(h.onRefresh).not.toHaveBeenCalled();
  });

  it("refreshes at once when the tab returns after the interval", async () => {
    const h = harness();
    h.refresher.start();
    h.setHidden(true);
    h.advance(1500);
    h.setHidden(false);
    h.visibilityChange();
    await flush();
    expect(h.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh early when the tab returns within the interval", async () => {
    const h = harness();
    h.refresher.start();
    h.setHidden(true);
    h.advance(400);
    h.setHidden(false);
    h.visibilityChange();
    await flush();
    expect(h.onRefresh).not.toHaveBeenCalled();
  });

  it("never runs two refreshes at once", async () => {
    const h = harness();
    let release;
    h.onRefresh.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    h.refresher.start();
    h.tick();
    h.tick();
    await flush();
    expect(h.onRefresh).toHaveBeenCalledTimes(1);
    release();
    await flush();
    h.advance(1000);
    h.tick();
    await flush();
    expect(h.onRefresh).toHaveBeenCalledTimes(2);
  });

  it("keeps the schedule after a failed refresh", async () => {
    const h = harness();
    h.onRefresh.mockRejectedValueOnce(new Error("network down"));
    h.refresher.start();
    h.tick();
    await flush();
    expect(h.onRefresh).toHaveBeenCalledTimes(1);
    expect(h.refresher.isRunning()).toBe(true);
    h.advance(1000);
    h.tick();
    await flush();
    expect(h.onRefresh).toHaveBeenCalledTimes(2);
  });

  it("keeps a single schedule when started twice, and stops cleanly", async () => {
    const h = harness();
    h.refresher.start();
    h.refresher.start();
    expect(h.hasTimer()).toBe(true);
    h.refresher.stop();
    expect(h.refresher.isRunning()).toBe(false);
    expect(h.hasTimer()).toBe(false);
    expect(h.hasVisibilityListener()).toBe(false);
    h.tick();
    await flush();
    expect(h.onRefresh).not.toHaveBeenCalled();
  });
});
