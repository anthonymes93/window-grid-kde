
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveWindow, Activity, VirtualDesktop } from './types';

type Selection = {
  activity: Activity;
  desktop: VirtualDesktop;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

export function App(): JSX.Element {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [desktops, setDesktops] = useState<VirtualDesktop[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [isLoadingDesktops, setIsLoadingDesktops] = useState(false);
  const [activeWindow, setActiveWindow] = useState<ActiveWindow | null>(null);
  const [isLoadingActiveWindow, setIsLoadingActiveWindow] = useState(false);
  const [isMovingWindow, setIsMovingWindow] = useState(false);
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [isLoadingCurrentActivity, setIsLoadingCurrentActivity] = useState(false);
  const [isMoveAndSwitching, setIsMoveAndSwitching] = useState(false);
  const [isMovingActivityOnly, setIsMovingActivityOnly] = useState(false);
  const [isMovingCurrentDesktop, setIsMovingCurrentDesktop] = useState(false);
  const [isRestoringLayout, setIsRestoringLayout] = useState(false);
  const desktopCountRef = useRef(0);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [windowCounts, setWindowCounts] = useState<Record<string, number>>({});

  const loadActivities = useCallback(async (): Promise<void> => {
    setIsLoadingActivities(true);
    try {
      const nextActivities = await window.kde.getActivities();
      setActivities(nextActivities);
      setSelection((current) => {
        if (!current) return current;
        const refreshedActivity = nextActivities.find((a) => a.id === current.activity.id);
        return refreshedActivity ? { ...current, activity: refreshedActivity } : null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Failed to load activities: ${message}`, ...current]);
    } finally {
      setIsLoadingActivities(false);
    }
  }, []);

  const loadCurrentActivity = useCallback(async (): Promise<void> => {
    setIsLoadingCurrentActivity(true);
    try {
      const activityId = await window.kde.getCurrentActivity();
      setCurrentActivityId(activityId);
    } catch {
      // cosmetic — silently ignore
    } finally {
      setIsLoadingCurrentActivity(false);
    }
  }, []);

  const loadActiveWindow = useCallback(async (): Promise<void> => {
    setIsLoadingActiveWindow(true);
    try {
      const nextActiveWindow = await window.kde.getActiveWindow();
      setActiveWindow(nextActiveWindow);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Failed to load window: ${message}`, ...current]);
    } finally {
      setIsLoadingActiveWindow(false);
    }
  }, []);

  const loadVirtualDesktops = useCallback(async (): Promise<void> => {
    setIsLoadingDesktops(true);
    const previousCount = desktopCountRef.current;
    try {
      const nextDesktops = await window.kde.getVirtualDesktops();
      desktopCountRef.current = nextDesktops.length;
      setDesktops(nextDesktops);
      setSelection((current) => {
        if (!current) return current;
        const refreshedDesktop = nextDesktops.find((d) => d.id === current.desktop.id);
        return refreshedDesktop ? { ...current, desktop: refreshedDesktop } : null;
      });
      if (previousCount > 0 && previousCount !== nextDesktops.length) {
        setEventLog((current) => [
          `Desktop count changed: ${previousCount} → ${nextDesktops.length}`,
          ...current
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Failed to load desktops: ${message}`, ...current]);
    } finally {
      setIsLoadingDesktops(false);
    }
  }, []);

  const loadWindowCounts = useCallback(async (): Promise<void> => {
    try {
      const stored = await window.kde.getWindowCounts();
      if (Object.keys(stored).length > 0) setWindowCounts(stored);
    } catch {}
    try {
      await window.kde.requestWindowCounts();
    } catch {}
  }, []);

  useEffect(() => {
    void loadActivities();
    void loadVirtualDesktops();
    void loadCurrentActivity();
    void loadWindowCounts();
  }, [loadActivities, loadVirtualDesktops, loadCurrentActivity, loadWindowCounts]);

  useEffect(() => {
    const unsubscribe = window.kde.onWindowCountsUpdated((counts) => {
      setWindowCounts(counts);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.kde.onSelectedWindowFromKwin((nextSelectedWindow) => {
      setActiveWindow(nextSelectedWindow);
      setEventLog((current) => [
        `Window selected: ${nextSelectedWindow.title}`,
        ...current
      ]);
    });
    return unsubscribe;
  }, []);

  const selectedLabel = useMemo(() => {
    if (!selection) return null;
    return `${selection.activity.name} / ${selection.desktop.name}`;
  }, [selection]);

  const handleCellClick = (activity: Activity, desktop: VirtualDesktop): void => {
    setSelection({ activity, desktop });
  };

  const handleMoveActiveWindow = async (): Promise<void> => {
    if (!activeWindow || !selection) return;
    const storedWindow = activeWindow;
    const targetActivity = selection.activity;
    const targetDesktop = selection.desktop;

    setIsMovingWindow(true);
    try {
      await window.kde.moveWindowToActivityAndDesktop(storedWindow.id, targetActivity.id, targetDesktop.id);
      setEventLog((current) => [
        `✓ Moved "${storedWindow.title}" → ${targetActivity.name} / ${targetDesktop.name}`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Move failed: ${message}`, ...current]);
    } finally {
      setIsMovingWindow(false);
    }
  };

  const canMoveActiveWindow =
    Boolean(activeWindow && selection) &&
    activeWindow?.id !== 'unavailable' &&
    !isMovingWindow;

  const handleMoveAndSwitch = async (): Promise<void> => {
    if (!activeWindow || !selection) return;
    const storedWindow = activeWindow;
    const targetActivity = selection.activity;
    const targetDesktop = selection.desktop;
    const targetDesktopNumber = targetDesktop.index + 1;

    setIsMoveAndSwitching(true);
    void window.kde.hideWindow();
    try {
      await window.kde.moveWindowToActivityAndDesktop(storedWindow.id, targetActivity.id, targetDesktop.id);
      await wait(150);
      await window.kde.switchToActivity(targetActivity.id);
      setCurrentActivityId(targetActivity.id);
      await wait(80);
      await window.kde.switchToDesktopNumber(targetDesktopNumber);
      await wait(80);

      const [verifyActivityId, verifyDesktopNumber] = await Promise.all([
        window.kde.getCurrentActivity(),
        window.kde.getCurrentDesktopNumber()
      ]);

      if (verifyActivityId !== targetActivity.id) {
        await window.kde.switchToActivity(targetActivity.id);
        setCurrentActivityId(targetActivity.id);
      }

      if (verifyDesktopNumber !== targetDesktopNumber) {
        await window.kde.switchToDesktopNumber(targetDesktopNumber);
      }

      const finalActivityId = await window.kde.getCurrentActivity();
      setCurrentActivityId(finalActivityId);

      setEventLog((current) => [
        `✓ Moved "${storedWindow.title}" and switched → ${targetActivity.name} / ${targetDesktop.name}`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Move + switch failed: ${message}`, ...current]);
    } finally {
      setIsMoveAndSwitching(false);
    }
  };

  const canMoveAndSwitch =
    Boolean(activeWindow && selection) &&
    activeWindow?.id !== 'unavailable' &&
    !isMoveAndSwitching &&
    !isMovingWindow;

  const handleMoveToActivityOnly = async (): Promise<void> => {
    if (!activeWindow || !selection) return;
    const storedWindow = activeWindow;
    const targetActivity = selection.activity;

    setIsMovingActivityOnly(true);
    try {
      await window.kde.moveWindowToActivityOnly(storedWindow.id, targetActivity.id);
      setEventLog((current) => [
        `✓ Moved "${storedWindow.title}" to activity ${targetActivity.name}`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Activity move failed: ${message}`, ...current]);
    } finally {
      setIsMovingActivityOnly(false);
    }
  };

  const canMoveActivityOnly =
    Boolean(activeWindow && selection) &&
    activeWindow?.id !== 'unavailable' &&
    !isMovingActivityOnly;

  const handleMoveCurrentDesktop = async (): Promise<void> => {
    if (!selection) return;
    const targetActivity = selection.activity;
    const targetDesktop = selection.desktop;

    setIsMovingCurrentDesktop(true);
    void window.kde.hideWindow();
    try {
      await window.kde.moveCurrentDesktopToActivityAndDesktop(targetActivity.id, targetDesktop.id);
      setEventLog((current) => [
        `✓ Desktop moved → ${targetActivity.name} / ${targetDesktop.name}`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Desktop move failed: ${message}`, ...current]);
    } finally {
      setIsMovingCurrentDesktop(false);
    }
  };

  const canMoveCurrentDesktop =
    Boolean(selection) &&
    !isMovingCurrentDesktop &&
    !isMoveAndSwitching &&
    !isMovingWindow;

  const handleVisitDesktop = async (): Promise<void> => {
    if (!selection) return;
    const targetActivity = selection.activity;
    const targetDesktop = selection.desktop;
    const targetDesktopNumber = targetDesktop.index + 1;
    try {
      await window.kde.switchToActivity(targetActivity.id);
      setCurrentActivityId(targetActivity.id);
      await window.kde.switchToDesktopNumber(targetDesktopNumber);
      setEventLog((current) => [
        `✓ Switched to ${targetActivity.name} / ${targetDesktop.name}`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Visit failed: ${message}`, ...current]);
    }
  };

  const handleCloseAll = async (): Promise<void> => {
    try {
      await window.kde.closeAllOnCurrentDesktop();
      setEventLog((current) => ['✓ All windows closed', ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Close all failed: ${message}`, ...current]);
    }
  };

  const handleRestoreLastLayout = async (): Promise<void> => {
    setIsRestoringLayout(true);
    try {
      await window.kde.restoreLastLayout();
      setEventLog((current) => ['✓ Layout restored', ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Restore failed: ${message}`, ...current]);
    } finally {
      setIsRestoringLayout(false);
    }
  };

  const canRestoreLayout = !isRestoringLayout && !isMovingCurrentDesktop;

  const currentActivity = activities.find((a) => a.id === currentActivityId) ?? null;

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Window Grid KDE</h1>
        <div className="current-activity-pill">
          <span>Activity</span>
          <strong>{currentActivity?.name ?? '—'}</strong>
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              void loadCurrentActivity();
              void loadActivities();
              void loadVirtualDesktops();
              void loadWindowCounts();
            }}
            disabled={isLoadingCurrentActivity || isLoadingActivities || isLoadingDesktops}
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </header>

      <div className={`window-card${activeWindow ? ' has-window' : ' window-card-empty'}`}>
        <div className={`window-icon${activeWindow ? ' active' : ''}`}>⊡</div>
        <div className="window-info">
          <div className="window-title-text">
            {activeWindow?.title ?? 'No window selected'}
          </div>
          <div className="window-meta">
            {activeWindow
              ? (activeWindow.windowClass ?? '')
              : 'Right-click a window → "Open in Window Grid KDE"'}
          </div>
        </div>
        <div className="window-card-right">
          <div className={`target-badge${selectedLabel ? '' : ' empty'}`}>
            {selectedLabel ?? 'No target'}
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => void loadActiveWindow()}
            disabled={isLoadingActiveWindow}
            title="Refresh active window"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="grid-section">
        <div className="grid-header">
          <span className="grid-header-title">Activity / Desktop Grid</span>
          <button
            className="icon-button"
            type="button"
            onClick={() => { void loadActivities(); void loadVirtualDesktops(); void loadWindowCounts(); }}
            disabled={isLoadingActivities || isLoadingDesktops}
            title="Refresh grid"
          >
            ↻
          </button>
        </div>
        <div className="grid-scroll" role="region" aria-label="Activity and desktop grid">
          {(activities.length === 0 || desktops.length === 0) && !isLoadingDesktops && !isLoadingActivities ? (
            <div className="empty-grid">No KDE activities or virtual desktops found</div>
          ) : (
            <div
              className="target-grid"
              style={{ gridTemplateColumns: `100px repeat(${desktops.length}, 108px)` }}
            >
              <div className="grid-corner" />

              {desktops.map((desktop) => (
                <div className="desktop-header" key={desktop.id} title={desktop.id}>
                  <span>{desktop.name}</span>
                </div>
              ))}

              {activities.map((activity) => (
                <div className="grid-row-fragment" key={activity.id}>
                  <div className="activity-header" title={activity.id}>
                    {activity.name}
                  </div>

                  {desktops.map((desktop) => {
                    const isSelected =
                      selection?.activity.id === activity.id &&
                      selection.desktop.id === desktop.id;

                    const count = windowCounts[`${activity.id}|${desktop.id}`] ?? 0;
                    const MAX_THUMBS = 7;
                    const thumbs = Math.min(count, MAX_THUMBS);
                    const overflow = count > MAX_THUMBS ? count - MAX_THUMBS : 0;

                    return (
                      <button
                        className={isSelected ? 'grid-cell selected' : 'grid-cell'}
                        key={`${activity.id}-${desktop.id}`}
                        type="button"
                        onClick={() => handleCellClick(activity, desktop)}
                        aria-pressed={isSelected}
                        aria-label={`${activity.name}, ${desktop.name}, ${count} windows`}
                      >
                        <span className="cell-num">{desktop.index + 1}</span>
                        {count > 0 && (
                          <div className="cell-windows">
                            {Array.from({ length: thumbs }).map((_, i) => (
                              <span key={i} className="win-thumb" />
                            ))}
                            {overflow > 0 && (
                              <span className="win-overflow">+{overflow}</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="action-bar">
        <button
          className="action-btn primary"
          type="button"
          data-loading={String(isMovingWindow)}
          onClick={() => void handleMoveActiveWindow()}
          disabled={!canMoveActiveWindow}
        >
          Move Window
        </button>
        <button
          className="action-btn primary"
          type="button"
          data-loading={String(isMoveAndSwitching)}
          onClick={() => void handleMoveAndSwitch()}
          disabled={!canMoveAndSwitch}
        >
          Move + Switch
        </button>
        <button
          className="action-btn"
          type="button"
          data-loading={String(isMovingActivityOnly)}
          onClick={() => void handleMoveToActivityOnly()}
          disabled={!canMoveActivityOnly}
        >
          Activity Only
        </button>
        <button
          className="action-btn"
          type="button"
          data-loading={String(isMovingCurrentDesktop)}
          onClick={() => void handleMoveCurrentDesktop()}
          disabled={!canMoveCurrentDesktop}
        >
          Move Desktop
        </button>
        {selection && (
          <button
            className="action-btn"
            type="button"
            onClick={() => void handleVisitDesktop()}
          >
            Visit Desktop
          </button>
        )}
        <button
          className="action-btn"
          type="button"
          data-loading={String(isRestoringLayout)}
          onClick={() => void handleRestoreLastLayout()}
          disabled={!canRestoreLayout}
        >
          Restore Layout
        </button>
        <button
          className="action-btn danger"
          type="button"
          onClick={() => void handleCloseAll()}
        >
          Close All
        </button>
      </div>

      {eventLog.length > 0 && (
        <div className="event-log-bar">
          {eventLog.slice(0, 4).map((msg, i) => (
            <div
              key={`${msg}-${i}`}
              className={`event-log-entry${msg.startsWith('✓') ? ' success' : msg.startsWith('✗') ? ' error' : ''}`}
            >
              {msg}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
