
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { ActiveWindow, Activity, VirtualDesktop } from './types';

type Selection = {
  activity: Activity;
  activityRowIndex: number;
  desktop: VirtualDesktop;
  desktopColumnIndex: number;
};

type GridDragCell = {
  activity: Activity;
  activityRowIndex: number;
  desktop: VirtualDesktop;
  desktopColumnIndex: number;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const moveArrayItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

const makeActivityRenderKey = (activity: Activity, activityRowIndex: number): string =>
  `activity-row:${activityRowIndex}:${activity.index}:${activity.id}:${activity.name}`;

const makeDesktopRenderKey = (desktop: VirtualDesktop, desktopColumnIndex: number): string =>
  `desktop-column:${desktopColumnIndex}:${desktop.index}:${desktop.id}`;

const areActivityDesktopNamesEqual = (
  first: Record<string, string[]>,
  second: Record<string, string[]>
): boolean => JSON.stringify(first) === JSON.stringify(second);

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
  const [activityDesktopNames, setActivityDesktopNames] = useState<Record<string, string[]>>({});
  const [draggedGridCell, setDraggedGridCell] = useState<GridDragCell | null>(null);
  const [dragOverFlatIndex, setDragOverFlatIndex] = useState<number | null>(null);

  const loadActivities = useCallback(async (): Promise<void> => {
    setIsLoadingActivities(true);
    try {
      const nextActivities = await window.kde.getActivities();
      setActivities(nextActivities);
      setSelection((current) => {
        if (!current) return current;
        const refreshedActivity = nextActivities[current.activityRowIndex];
        return refreshedActivity
          ? { ...current, activity: refreshedActivity }
          : null;
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
        const refreshedDesktop = nextDesktops[current.desktopColumnIndex];
        return refreshedDesktop
          ? { ...current, desktop: refreshedDesktop }
          : null;
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
    } catch (error) {
      console.debug('Unable to load cached window counts', error);
    }
    try {
      await window.kde.requestWindowCounts();
    } catch (error) {
      console.debug('Unable to request window counts', error);
    }
  }, []);

  const loadActivityDesktopNames = useCallback(async (): Promise<void> => {
    try {
      const names = await window.kde.getActivityDesktopNames();
      setActivityDesktopNames((current) =>
        areActivityDesktopNamesEqual(current, names) ? current : names
      );
    } catch (error) {
      console.debug('Unable to load activity desktop names', error);
    }
  }, []);

  useEffect(() => {
    void loadActivities();
    void loadVirtualDesktops();
    void loadCurrentActivity();
    void loadWindowCounts();
    void loadActivityDesktopNames();
  }, [
    loadActivities,
    loadVirtualDesktops,
    loadCurrentActivity,
    loadWindowCounts,
    loadActivityDesktopNames
  ]);

  useEffect(() => {
    const unsubscribe = window.kde.onWindowCountsUpdated((counts) => {
      setWindowCounts(counts);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadActivityDesktopNames();
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadActivityDesktopNames]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadActivities();
      void loadVirtualDesktops();
      void loadCurrentActivity();
      void loadWindowCounts();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadActivities, loadVirtualDesktops, loadCurrentActivity, loadWindowCounts]);

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
    const desktopTitle =
      activityDesktopNames[selection.activity.id]?.[selection.desktop.index]?.trim() ||
      selection.desktop.name;
    return `${selection.activity.name} / ${desktopTitle}`;
  }, [activityDesktopNames, selection]);

  const getDesktopTitle = (
    activity: Activity,
    desktop: VirtualDesktop
  ): string => {
    return activityDesktopNames[activity.id]?.[desktop.index] ?? desktop.name;
  };

  const handleDesktopTitleChange = (
    activity: Activity,
    desktop: VirtualDesktop,
    title: string
  ): void => {
    setActivityDesktopNames((current) => {
      const next = { ...current };
      const names = [...(next[activity.id] ?? [])];

      while (names.length <= desktop.index) {
        names.push('');
      }

      names[desktop.index] = title;
      next[activity.id] = names;
      return next;
    });

    void window.kde
      .updateActivityDesktopName(activity.id, desktop.index, title)
      .then((names) => setActivityDesktopNames(names))
      .catch((error) => {
        console.debug('Unable to save activity desktop name', error);
      });
  };

  const handleCellClick = (
    activity: Activity,
    activityRowIndex: number,
    desktop: VirtualDesktop,
    desktopColumnIndex: number
  ): void => {
    setSelection({ activity, activityRowIndex, desktop, desktopColumnIndex });
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    activity: Activity,
    activityRowIndex: number,
    desktop: VirtualDesktop,
    desktopColumnIndex: number
  ): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleCellClick(activity, activityRowIndex, desktop, desktopColumnIndex);
  };

  const getFlatGridIndex = (activityRowIndex: number, desktopColumnIndex: number): number =>
    activityRowIndex * desktops.length + desktopColumnIndex;

  const makeReorderedActivityDesktopNames = (
    currentNames: Record<string, string[]>,
    fromFlatIndex: number,
    toFlatIndex: number
  ): Record<string, string[]> => {
    const cells = activities.flatMap((activity) =>
      desktops.map((desktop) => ({
        activityId: activity.id,
        desktopIndex: desktop.index,
        title: currentNames[activity.id]?.[desktop.index] ?? desktop.name
      }))
    );
    const reorderedCells = moveArrayItem(cells, fromFlatIndex, toFlatIndex);
    const nextNames: Record<string, string[]> = { ...currentNames };

    activities.forEach((activity) => {
      nextNames[activity.id] = [...(nextNames[activity.id] ?? [])];
      while (nextNames[activity.id].length < desktops.length) {
        nextNames[activity.id].push('');
      }
    });

    reorderedCells.forEach((cell, flatIndex) => {
      const targetActivity = activities[Math.floor(flatIndex / desktops.length)];
      const targetDesktop = desktops[flatIndex % desktops.length];
      if (!targetActivity || !targetDesktop) return;
      nextNames[targetActivity.id][targetDesktop.index] = cell.title;
    });

    return nextNames;
  };

  const makeReorderedWindowCounts = (
    currentCounts: Record<string, number>,
    fromFlatIndex: number,
    toFlatIndex: number
  ): Record<string, number> => {
    const countCells = activities.flatMap((activity) =>
      desktops.map((desktop) => currentCounts[`${activity.id}|${desktop.id}`] ?? 0)
    );
    const reorderedCounts = moveArrayItem(countCells, fromFlatIndex, toFlatIndex);
    const nextCounts: Record<string, number> = { ...currentCounts };

    reorderedCounts.forEach((count, flatIndex) => {
      const targetActivity = activities[Math.floor(flatIndex / desktops.length)];
      const targetDesktop = desktops[flatIndex % desktops.length];
      if (!targetActivity || !targetDesktop) return;
      nextCounts[`${targetActivity.id}|${targetDesktop.id}`] = count;
    });

    return nextCounts;
  };

  const finishGridCellDrag = async (
    source: GridDragCell,
    target: GridDragCell
  ): Promise<void> => {
    const fromFlatIndex = getFlatGridIndex(source.activityRowIndex, source.desktopColumnIndex);
    const toFlatIndex = getFlatGridIndex(target.activityRowIndex, target.desktopColumnIndex);

    setDraggedGridCell(null);
    setDragOverFlatIndex(null);

    if (fromFlatIndex === toFlatIndex) {
      handleCellClick(target.activity, target.activityRowIndex, target.desktop, target.desktopColumnIndex);
      return;
    }

    const nextNames = makeReorderedActivityDesktopNames(
      activityDesktopNames,
      fromFlatIndex,
      toFlatIndex
    );

    setActivityDesktopNames(nextNames);
    setWindowCounts((current) => makeReorderedWindowCounts(current, fromFlatIndex, toFlatIndex));
    handleCellClick(target.activity, target.activityRowIndex, target.desktop, target.desktopColumnIndex);

    try {
      const activityIds = activities.map((activity) => activity.id);
      await window.kde.setActivityDesktopNames(nextNames);
      await window.kde.reorderGridContents(activityIds, fromFlatIndex, toFlatIndex);
      setEventLog((current) => [
        `✓ Grid cell moved → ${target.activity.name} / ${getDesktopTitle(target.activity, target.desktop)}`,
        ...current
      ]);
      window.setTimeout(() => {
        void loadActivityDesktopNames();
        void loadWindowCounts();
      }, 1200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Grid reorder failed: ${message}`, ...current]);
      void loadActivityDesktopNames();
      void loadWindowCounts();
    }
  };

  const handleGridCellDragStart = (
    event: DragEvent<HTMLDivElement>,
    cell: GridDragCell
  ): void => {
    setDraggedGridCell(cell);
    setDragOverFlatIndex(getFlatGridIndex(cell.activityRowIndex, cell.desktopColumnIndex));
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'application/x-window-grid-cell',
      String(getFlatGridIndex(cell.activityRowIndex, cell.desktopColumnIndex))
    );
  };

  const handleGridCellDragOver = (
    event: DragEvent<HTMLDivElement>,
    activityRowIndex: number,
    desktopColumnIndex: number
  ): void => {
    if (!draggedGridCell) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverFlatIndex(getFlatGridIndex(activityRowIndex, desktopColumnIndex));
  };

  const handleGridCellDrop = (
    event: DragEvent<HTMLDivElement>,
    target: GridDragCell
  ): void => {
    event.preventDefault();
    if (!draggedGridCell) return;
    void finishGridCellDrag(draggedGridCell, target);
  };

  const handleMoveActiveWindow = async (): Promise<void> => {
    if (!activeWindow || !selection) return;
    const storedWindow = activeWindow;
    const targetActivity = selection.activity;
    const targetDesktop = selection.desktop;
    const targetDesktopTitle = getDesktopTitle(targetActivity, targetDesktop);

    setIsMovingWindow(true);
    try {
      await window.kde.moveWindowToActivityAndDesktop(storedWindow.id, targetActivity.id, targetDesktop.id);
      setEventLog((current) => [
        `✓ Moved "${storedWindow.title}" → ${targetActivity.name} / ${targetDesktopTitle}`,
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
    const targetDesktopTitle = getDesktopTitle(targetActivity, targetDesktop);
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
        `✓ Moved "${storedWindow.title}" and switched → ${targetActivity.name} / ${targetDesktopTitle}`,
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
    const targetDesktopTitle = getDesktopTitle(targetActivity, targetDesktop);

    setIsMovingCurrentDesktop(true);
    void window.kde.hideWindow();
    try {
      await window.kde.moveCurrentDesktopToActivityAndDesktop(targetActivity.id, targetDesktop.id);
      setEventLog((current) => [
        `✓ Desktop moved → ${targetActivity.name} / ${targetDesktopTitle}`,
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
    const targetDesktopTitle = getDesktopTitle(targetActivity, targetDesktop);
    const targetDesktopNumber = targetDesktop.index + 1;
    try {
      await window.kde.switchToActivity(targetActivity.id);
      setCurrentActivityId(targetActivity.id);
      await window.kde.switchToDesktopNumber(targetDesktopNumber);
      setEventLog((current) => [
        `✓ Switched to ${targetActivity.name} / ${targetDesktopTitle}`,
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
              void loadActivityDesktopNames();
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
            onClick={() => {
              void loadActivities();
              void loadVirtualDesktops();
              void loadWindowCounts();
              void loadActivityDesktopNames();
            }}
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

              {desktops.map((desktop, desktopColumnIndex) => (
                <div
                  className="desktop-header"
                  key={makeDesktopRenderKey(desktop, desktopColumnIndex)}
                  title={desktop.id}
                >
                  <span>{desktop.name}</span>
                </div>
              ))}

              {activities.map((activity, activityRowIndex) => (
                <div
                  className="grid-row-fragment"
                  key={makeActivityRenderKey(activity, activityRowIndex)}
                >
                  <div className="activity-header" title={activity.id}>
                    {activity.name}
                  </div>

	                  {desktops.map((desktop, desktopColumnIndex) => {
	                    const isSelected =
	                      selection?.activity.id === activity.id &&
	                      selection.activityRowIndex === activityRowIndex &&
	                      selection.desktop.id === desktop.id &&
	                      selection.desktopColumnIndex === desktopColumnIndex;
	                    const flatGridIndex = getFlatGridIndex(activityRowIndex, desktopColumnIndex);
	                    const isDraggingCell =
	                      draggedGridCell?.activity.id === activity.id &&
	                      draggedGridCell.desktop.id === desktop.id &&
	                      draggedGridCell.activityRowIndex === activityRowIndex &&
	                      draggedGridCell.desktopColumnIndex === desktopColumnIndex;
	                    const isDragTarget =
	                      draggedGridCell !== null &&
	                      dragOverFlatIndex === flatGridIndex &&
	                      !isDraggingCell;

	                    const desktopTitle = getDesktopTitle(activity, desktop);
	                    const count = windowCounts[`${activity.id}|${desktop.id}`] ?? 0;
                    const MAX_THUMBS = 7;
                    const thumbs = Math.min(count, MAX_THUMBS);
                    const overflow = count > MAX_THUMBS ? count - MAX_THUMBS : 0;

	                    return (
	                      <div
	                        className={[
	                          'grid-cell',
	                          isSelected ? 'selected' : '',
	                          isDraggingCell ? 'dragging' : '',
	                          isDragTarget ? 'drag-target' : ''
	                        ].filter(Boolean).join(' ')}
	                        key={`${makeActivityRenderKey(
	                          activity,
	                          activityRowIndex
	                        )}-${makeDesktopRenderKey(desktop, desktopColumnIndex)}`}
	                        role="button"
	                        tabIndex={0}
	                        draggable
	                        onDragStart={(event) =>
	                          handleGridCellDragStart(event, {
	                            activity,
	                            activityRowIndex,
	                            desktop,
	                            desktopColumnIndex
	                          })
	                        }
	                        onDragOver={(event) =>
	                          handleGridCellDragOver(event, activityRowIndex, desktopColumnIndex)
	                        }
	                        onDrop={(event) =>
	                          handleGridCellDrop(event, {
	                            activity,
	                            activityRowIndex,
	                            desktop,
	                            desktopColumnIndex
	                          })
	                        }
	                        onDragEnd={() => {
	                          setDraggedGridCell(null);
	                          setDragOverFlatIndex(null);
	                        }}
	                        onClick={() =>
	                          handleCellClick(activity, activityRowIndex, desktop, desktopColumnIndex)
	                        }
                        onKeyDown={(event) =>
                          handleCellKeyDown(
                            event,
                            activity,
                            activityRowIndex,
                            desktop,
                            desktopColumnIndex
                          )
                        }
                        aria-pressed={isSelected}
                        aria-label={`${activity.name}, ${desktopTitle}, ${count} windows`}
                      >
                        <span className="cell-num">{desktop.index + 1}</span>
                        <input
                          className="cell-title-input"
                          type="text"
                          value={desktopTitle}
                          title={`${activity.name} / ${desktopTitle}`}
                          aria-label={`Title for ${activity.name}, desktop ${desktop.index + 1}`}
                          onChange={(event) =>
                            handleDesktopTitleChange(
                              activity,
                              desktop,
                              event.target.value
                            )
                          }
	                          onClick={(event) => event.stopPropagation()}
	                          onDragStart={(event) => event.preventDefault()}
	                          onFocus={(event) => event.currentTarget.select()}
	                          onKeyDown={(event) => event.stopPropagation()}
	                        />
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
                      </div>
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
