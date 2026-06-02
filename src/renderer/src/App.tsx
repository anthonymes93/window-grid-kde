import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveWindow, Activity, VirtualDesktop } from './types';

console.log('window.kde', window.kde);

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
  const [activityError, setActivityError] = useState<string | null>(null);
  const [isLoadingDesktops, setIsLoadingDesktops] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const [activeWindow, setActiveWindow] = useState<ActiveWindow | null>(null);
  const [isLoadingActiveWindow, setIsLoadingActiveWindow] = useState(false);
  const [isMovingWindow, setIsMovingWindow] = useState(false);
  const [activeWindowError, setActiveWindowError] = useState<string | null>(null);
  const [activeWindowRefreshTime, setActiveWindowRefreshTime] = useState<string>('Never');
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [isLoadingCurrentActivity, setIsLoadingCurrentActivity] = useState(false);
  const [isSwitchingActivity, setIsSwitchingActivity] = useState(false);
  const [isMoveAndSwitching, setIsMoveAndSwitching] = useState(false);
  const desktopCountRef = useRef(0);
  const [eventLog, setEventLog] = useState<string[]>([
    'UI shell initialized.'
  ]);

  const loadActivities = useCallback(async (): Promise<void> => {
    setIsLoadingActivities(true);
    setActivityError(null);

    try {
      const nextActivities = await window.kde.getActivities();
      setActivities(nextActivities);
      setSelection((current) => {
        if (!current) {
          return current;
        }

        const refreshedActivity = nextActivities.find(
          (activity) => activity.id === current.activity.id
        );

        return refreshedActivity ? { ...current, activity: refreshedActivity } : null;
      });
      const idNameLines = nextActivities.map((a) => `  ${a.id} -> "${a.name}"`).join('\n');
      console.log('Activity id -> name mapping:\n' + idNameLines);
      setEventLog((current) => [
        ...nextActivities.map((a) => `Activity: ${a.id} -> "${a.name}"`),
        `Loaded ${nextActivities.length} activities`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown KDE activity error.';
      setActivityError(message);
      setEventLog((current) => [`Failed to load KDE activities: ${message}`, ...current]);
    } finally {
      setIsLoadingActivities(false);
    }
  }, []);

  const loadCurrentActivity = useCallback(async (): Promise<void> => {
    setIsLoadingCurrentActivity(true);

    try {
      const activityId = await window.kde.getCurrentActivity();
      setCurrentActivityId(activityId);
      setEventLog((current) => [`Current activity id: ${activityId}`, ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      setEventLog((current) => [`Failed to get current activity: ${message}`, ...current]);
    } finally {
      setIsLoadingCurrentActivity(false);
    }
  }, []);

  const loadActiveWindow = useCallback(async (): Promise<void> => {
    setIsLoadingActiveWindow(true);
    setActiveWindowError(null);

    try {
      const nextActiveWindow = await window.kde.getActiveWindow();
      const refreshTime = new Date().toLocaleTimeString();

      setActiveWindow(nextActiveWindow);
      setActiveWindowRefreshTime(refreshTime);
      setEventLog((current) => [
        `Selected window stored: ${nextActiveWindow.title} (${nextActiveWindow.id})`,
        `Loaded active window: ${nextActiveWindow.title}`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown active window error.';
      setActiveWindowError(message);
      setEventLog((current) => [`Failed to load active window: ${message}`, ...current]);
    } finally {
      setIsLoadingActiveWindow(false);
    }
  }, []);

  const loadVirtualDesktops = useCallback(async (isManualRefresh = false): Promise<void> => {
    setIsLoadingDesktops(true);
    setDesktopError(null);

    const previousCount = desktopCountRef.current;

    try {
      if (isManualRefresh) {
        setEventLog((current) => ['Refreshing desktops...', ...current]);
        await wait(250);
      }

      const nextDesktops = await window.kde.getVirtualDesktops();
      desktopCountRef.current = nextDesktops.length;
      setDesktops(nextDesktops);
      setSelection((current) => {
        if (!current) {
          return current;
        }

        const refreshedDesktop = nextDesktops.find(
          (desktop) => desktop.id === current.desktop.id
        );

        return refreshedDesktop
          ? { ...current, desktop: refreshedDesktop }
          : null;
      });

      const messages = [`Loaded ${nextDesktops.length} desktops`];

      if (previousCount !== nextDesktops.length) {
        messages.push(`Desktop count changed from ${previousCount} to ${nextDesktops.length}`);
      }

      setEventLog((current) => [...messages, ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown KDE desktop error.';
      setDesktopError(message);
      setEventLog((current) => [`Failed to load KDE virtual desktops: ${message}`, ...current]);
    } finally {
      setIsLoadingDesktops(false);
    }
  }, []);

  useEffect(() => {
    void loadActivities();
    void loadVirtualDesktops();
    void loadCurrentActivity();
  }, [loadActivities, loadVirtualDesktops, loadCurrentActivity]);

  useEffect(() => {
    const unsubscribe = window.kde.onSelectedWindowFromKwin((nextSelectedWindow) => {
      const refreshTime = new Date().toLocaleTimeString();

      setActiveWindow(nextSelectedWindow);
      setActiveWindowError(null);
      setActiveWindowRefreshTime(refreshTime);
      setEventLog((current) => [
        `Received KWin window: ${nextSelectedWindow.title} (${nextSelectedWindow.id})`,
        ...current
      ]);
    });

    return unsubscribe;
  }, []);

  const selectedLabel = useMemo(() => {
    if (!selection) {
      return 'No target selected';
    }

    return `${selection.activity.name} / ${selection.desktop.name}`;
  }, [selection]);

  const handleCellClick = (activity: Activity, desktop: VirtualDesktop): void => {
    setSelection({ activity, desktop });
    setEventLog((current) => [
      `Selected ${activity.name} → ${desktop.name}`,
      ...current
    ]);
  };

  const handleMoveActiveWindow = async (): Promise<void> => {
    if (!activeWindow || !selection) {
      return;
    }

    const storedWindow = activeWindow;
    const selectedActivity = selection.activity;
    const selectedDesktop = selection.desktop;
    const sourceActivityId = currentActivityId ?? 'unknown';
    const sourceActivity = activities.find((a) => a.id === sourceActivityId);
    const sourceActivityName = sourceActivity?.name ?? 'unknown';

    setIsMovingWindow(true);
    setEventLog((current) => [
      `[MOVE] Source activity: "${sourceActivityName}" (${sourceActivityId})`,
      `[MOVE] Destination activity: "${selectedActivity.name}" (${selectedActivity.id})`,
      `[MOVE] Destination desktop: "${selectedDesktop.name}" (${selectedDesktop.id})`,
      `[MOVE] Window: "${storedWindow.title}" (${storedWindow.id})`,
      `Moving window to ${selectedActivity.name} / ${selectedDesktop.name}...`,
      ...current
    ]);

    try {
      await window.kde.moveWindowToActivityAndDesktop(
        storedWindow.id,
        selectedActivity.id,
        selectedDesktop.id
      );
      setEventLog((current) => [
        `[MOVE] Success: "${storedWindow.title}" -> "${selectedActivity.name}" / "${selectedDesktop.name}"`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown move error.';
      setEventLog((current) => [`Move failed: ${message}`, ...current]);
    } finally {
      setIsMovingWindow(false);
    }
  };

  const handleSwitchToSelectedActivity = async (): Promise<void> => {
    if (!selection) {
      return;
    }

    const targetActivity = selection.activity;

    setIsSwitchingActivity(true);
    setEventLog((current) => [
      `[SWITCH] Switching to activity: "${targetActivity.name}" (${targetActivity.id})`,
      ...current
    ]);

    try {
      await window.kde.switchToActivity(targetActivity.id);
      setCurrentActivityId(targetActivity.id);
      setEventLog((current) => [
        `[SWITCH] Now on activity: "${targetActivity.name}" (${targetActivity.id})`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown switch error.';
      setEventLog((current) => [`Switch failed: ${message}`, ...current]);
    } finally {
      setIsSwitchingActivity(false);
    }
  };

  const canMoveActiveWindow =
    Boolean(activeWindow && selection) &&
    activeWindow?.id !== 'unavailable' &&
    !isMovingWindow;

  const canSwitchActivity = Boolean(selection) && !isSwitchingActivity;

  const handleMoveAndSwitch = async (): Promise<void> => {
    if (!activeWindow || !selection) {
      return;
    }

    const storedWindow = activeWindow;
    const targetActivity = selection.activity;
    const targetDesktop = selection.desktop;

    setIsMoveAndSwitching(true);
    setEventLog((current) => [
      `[MOVE+SWITCH] Window: "${storedWindow.title}" (${storedWindow.id})`,
      `[MOVE+SWITCH] Target activity: "${targetActivity.name}" (${targetActivity.id})`,
      `[MOVE+SWITCH] Target desktop: "${targetDesktop.name}" (${targetDesktop.id})`,
      `[MOVE+SWITCH] Moving then switching...`,
      ...current
    ]);

    try {
      await window.kde.moveWindowToActivityAndDesktop(
        storedWindow.id,
        targetActivity.id,
        targetDesktop.id
      );
      setEventLog((current) => [`[MOVE+SWITCH] Move completed, switching activity...`, ...current]);

      await window.kde.switchToActivity(targetActivity.id);
      setCurrentActivityId(targetActivity.id);
      setEventLog((current) => [
        `[MOVE+SWITCH] Done — now on "${targetActivity.name}" (${targetActivity.id})`,
        ...current
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      setEventLog((current) => [`[MOVE+SWITCH] Failed: ${message}`, ...current]);
    } finally {
      setIsMoveAndSwitching(false);
    }
  };

  const canMoveAndSwitch =
    Boolean(activeWindow && selection) &&
    activeWindow?.id !== 'unavailable' &&
    !isMoveAndSwitching &&
    !isMovingWindow;

  const currentActivity = activities.find((a) => a.id === currentActivityId) ?? null;
  const selectedActivity = selection?.activity ?? null;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Window Grid KDE</h1>
          <p>KDE window routing by Activity and Virtual Desktop.</p>
        </div>
      </header>

      <section className="dashboard">
        <aside className="side-panels" aria-label="Selection details">
          <section className="panel selected-window-panel">
            <div className="panel-heading">
              <h2>Selected Window</h2>
              <button
                className="refresh-button"
                type="button"
                onClick={() => void loadActiveWindow()}
                disabled={isLoadingActiveWindow}
              >
                Manual Refresh Active Window (fallback)
              </button>
            </div>
            {isLoadingActiveWindow && <p className="panel-status">Loading active window...</p>}
            {activeWindowError && <p className="panel-error">{activeWindowError}</p>}
            <dl className="window-details">
              <div>
                <dt>Title</dt>
                <dd>{activeWindow?.title ?? 'Not loaded'}</dd>
              </div>
              <div>
                <dt>Window Id</dt>
                <dd>{activeWindow?.id ?? 'Not loaded'}</dd>
              </div>
              <div>
                <dt>Window Class</dt>
                <dd>{activeWindow?.windowClass ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Desktop Ids</dt>
                <dd>{activeWindow?.desktopIds?.join(', ') ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{selectedLabel}</dd>
              </div>
              <div>
                <dt>Last Refresh</dt>
                <dd>{activeWindowRefreshTime}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Current Activity</h2>
              <button
                className="refresh-button"
                type="button"
                onClick={() => void loadCurrentActivity()}
                disabled={isLoadingCurrentActivity}
              >
                Refresh
              </button>
            </div>
            {isLoadingCurrentActivity && <p className="panel-status">Loading...</p>}
            <dl className="window-details">
              <div>
                <dt>Name</dt>
                <dd>{currentActivity?.name ?? (currentActivityId ? '(name unknown)' : 'Not loaded')}</dd>
              </div>
              <div>
                <dt>Id</dt>
                <dd>{currentActivityId ?? 'Not loaded'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Selected Activity</h2>
              <button
                className="refresh-button"
                type="button"
                onClick={() => void handleSwitchToSelectedActivity()}
                disabled={!canSwitchActivity}
              >
                Switch To Selected Activity
              </button>
            </div>
            <dl className="window-details">
              <div>
                <dt>Name</dt>
                <dd>{selectedActivity?.name ?? 'None selected'}</dd>
              </div>
              <div>
                <dt>Id</dt>
                <dd>{selectedActivity?.id ?? 'None selected'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Activities</h2>
            </div>
            {isLoadingActivities && <p className="panel-status">Loading KDE activities...</p>}
            {activityError && <p className="panel-error">{activityError}</p>}
            <div className="activity-list">
              {activities.map((activity) => (
                <span key={activity.id} title={activity.id}>{activity.name}</span>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Virtual Desktops</h2>
              <button
                className="refresh-button"
                type="button"
                onClick={() => void loadVirtualDesktops(true)}
                disabled={isLoadingDesktops}
              >
                Refresh Desktops
              </button>
            </div>
            {isLoadingDesktops && <p className="panel-status">Loading KDE desktops...</p>}
            {desktopError && <p className="panel-error">{desktopError}</p>}
            <div className="desktop-list">
              {desktops.map((desktop) => (
                <span key={desktop.id} title={desktop.id}>
                  {desktop.name}
                </span>
              ))}
            </div>
          </section>
        </aside>

        <section className="workspace">
          <section className="panel grid-panel">
            <div className="panel-heading">
              <h2>Activity/Desktop Grid</h2>
              <div className="grid-actions">
              <span>{activities.length} activities x {desktops.length} desktops</span>
                <button
                  className="refresh-button"
                  type="button"
                  onClick={() => void handleMoveActiveWindow()}
                  disabled={!canMoveActiveWindow}
                >
                  Move Active Window
                </button>
                <button
                  className="refresh-button"
                  type="button"
                  onClick={() => void handleMoveAndSwitch()}
                  disabled={!canMoveAndSwitch}
                >
                  Move + Switch Activity
                </button>
              </div>
            </div>

            <div className="grid-scroll" role="region" aria-label="Activity and desktop grid">
              {(activities.length === 0 || desktops.length === 0) && !isLoadingDesktops && !isLoadingActivities ? (
                <div className="empty-grid">
                  {desktopError || activityError
                    ? 'KDE grid data unavailable.'
                    : 'No KDE activities or virtual desktops found.'}
                </div>
              ) : (
              <div
                className="target-grid"
                style={{ gridTemplateColumns: `104px repeat(${desktops.length}, 112px)` }}
              >
                <div className="grid-corner" />
                {desktops.map((desktop) => (
                  <div className="desktop-header" key={desktop.id} title={desktop.id}>
                    <span>{desktop.name}</span>
                  </div>
                ))}

                {activities.map((activity) => (
                  <div className="grid-row-fragment" key={activity.id}>
                    <div className="activity-header" title={activity.id}>{activity.name}</div>
                    {desktops.map((desktop) => {
                      const isSelected =
                        selection?.activity.id === activity.id && selection.desktop.id === desktop.id;

                      return (
                        <button
                          className={isSelected ? 'grid-cell selected' : 'grid-cell'}
                          key={`${activity.id}-${desktop.id}`}
                          type="button"
                          onClick={() => handleCellClick(activity, desktop)}
                          aria-pressed={isSelected}
                          aria-label={`${activity.name}, ${desktop.name}`}
                        >
                          <span>{desktop.index + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              )}
            </div>
          </section>

          <section className="panel event-log-panel">
            <div className="panel-heading">
              <h2>Event Log</h2>
            </div>
            <ol className="event-log">
              {eventLog.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ol>
          </section>
        </section>
      </section>
    </main>
  );
}
