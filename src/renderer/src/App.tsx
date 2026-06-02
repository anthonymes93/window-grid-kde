import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveWindow, VirtualDesktop } from './types';

console.log('window.kde', window.kde);

const activities = ['Work', 'Business', 'Personal', 'TV'];

type Selection = {
  activity: string;
  desktop: VirtualDesktop;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

export function App(): JSX.Element {
  const [desktops, setDesktops] = useState<VirtualDesktop[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isLoadingDesktops, setIsLoadingDesktops] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const [activeWindow, setActiveWindow] = useState<ActiveWindow | null>(null);
  const [isLoadingActiveWindow, setIsLoadingActiveWindow] = useState(false);
  const [isMovingWindow, setIsMovingWindow] = useState(false);
  const [activeWindowError, setActiveWindowError] = useState<string | null>(null);
  const [activeWindowRefreshTime, setActiveWindowRefreshTime] = useState<string>('Never');
  const desktopCountRef = useRef(0);
  const [eventLog, setEventLog] = useState<string[]>([
    'UI shell initialized with mock Activities.'
  ]);

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
    void loadVirtualDesktops();
  }, [loadVirtualDesktops]);

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

    return `${selection.activity} / ${selection.desktop.name}`;
  }, [selection]);

  const handleCellClick = (activity: string, desktop: VirtualDesktop): void => {
    setSelection({ activity, desktop });
    setEventLog((current) => [
      `Selected ${activity} → ${desktop.name}`,
      ...current
    ]);
  };

  const handleMoveActiveWindow = async (): Promise<void> => {
    if (!activeWindow || !selection) {
      return;
    }

    const storedWindow = activeWindow;
    const selectedDesktop = selection.desktop;

    setIsMovingWindow(true);
    setEventLog((current) => [
      `Moving stored window ID ${storedWindow.id}`,
      `Moving window "${storedWindow.title}" to Desktop ${selectedDesktop.index + 1}`,
      ...current
    ]);

    try {
      await window.kde.moveWindowToDesktop(storedWindow.id, selectedDesktop.index);
      setEventLog((current) => ['Move completed', ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown move error.';
      setEventLog((current) => [`Move failed: ${message}`, ...current]);
    } finally {
      setIsMovingWindow(false);
    }
  };

  const canMoveActiveWindow =
    Boolean(activeWindow && selection) &&
    activeWindow?.id !== 'unavailable' &&
    !isMovingWindow;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Window Grid KDE</h1>
          <p>Phase 2 UI shell with real KDE virtual desktop detection.</p>
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
              <h2>Activities</h2>
            </div>
            <div className="activity-list">
              {activities.map((activity) => (
                <span key={activity}>{activity}</span>
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
                  Move Active Window to Selected Desktop
                </button>
              </div>
            </div>

            <div className="grid-scroll" role="region" aria-label="Activity and desktop grid">
              {desktops.length === 0 && !isLoadingDesktops ? (
                <div className="empty-grid">
                  {desktopError ? 'Desktop data unavailable.' : 'No KDE virtual desktops found.'}
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
                  <div className="grid-row-fragment" key={activity}>
                    <div className="activity-header">{activity}</div>
                    {desktops.map((desktop) => {
                      const isSelected =
                        selection?.activity === activity && selection.desktop.id === desktop.id;

                      return (
                        <button
                          className={isSelected ? 'grid-cell selected' : 'grid-cell'}
                          key={`${activity}-${desktop.id}`}
                          type="button"
                          onClick={() => handleCellClick(activity, desktop)}
                          aria-pressed={isSelected}
                          aria-label={`${activity}, ${desktop.name}`}
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
