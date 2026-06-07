
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type {
  ActiveWindow,
  Activity,
  VirtualDesktop,
  WorkspaceBackLocation,
  WorkspaceBackState
} from './types';

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

const makeActivityRenderKey = (activity: Activity, activityRowIndex: number): string =>
  `activity-row:${activityRowIndex}:${activity.index}:${activity.id}:${activity.name}`;

const makeDesktopRenderKey = (desktop: VirtualDesktop, desktopColumnIndex: number): string =>
  `desktop-column:${desktopColumnIndex}:${desktop.index}:${desktop.id}`;

const areActivityDesktopNamesEqual = (
  first: Record<string, string[]>,
  second: Record<string, string[]>
): boolean => JSON.stringify(first) === JSON.stringify(second);

const isKdeDefaultDesktopTitle = (title: string): boolean => {
  const normalizedTitle = title.trim();
  return /^new desktop$/i.test(normalizedTitle) || /^desktop\s+\d+$/i.test(normalizedTitle);
};

const cleanGridDesktopTitle = (title: string | undefined, kdeDefaultTitle = ''): string => {
  if (!title) return '';
  const normalizedTitle = title.trim();
  if (isKdeDefaultDesktopTitle(normalizedTitle)) return '';
  if (kdeDefaultTitle.trim().length > 0 && normalizedTitle === kdeDefaultTitle.trim()) return '';
  return title;
};

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
  const [isWorkspaceBacking, setIsWorkspaceBacking] = useState(false);
  const [isCreatingDesktop, setIsCreatingDesktop] = useState(false);
  const [workspaceBackState, setWorkspaceBackState] = useState<WorkspaceBackState>({
    current: null,
    previous: null
  });
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

  const loadWorkspaceBackState = useCallback(async (): Promise<void> => {
    try {
      const state = await window.kde.getWorkspaceBackState();
      setWorkspaceBackState(state);
    } catch (error) {
      console.debug('Unable to load Workspace Back state', error);
    }
  }, []);

  useEffect(() => {
    void loadActivities();
    void loadVirtualDesktops();
    void loadCurrentActivity();
    void loadWindowCounts();
    void loadActivityDesktopNames();
    void loadWorkspaceBackState();
  }, [
    loadActivities,
    loadVirtualDesktops,
    loadCurrentActivity,
    loadWindowCounts,
    loadActivityDesktopNames,
    loadWorkspaceBackState
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
      void loadWorkspaceBackState();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    loadActivities,
    loadVirtualDesktops,
    loadCurrentActivity,
    loadWindowCounts,
    loadWorkspaceBackState
  ]);

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
    const desktopTitle = cleanGridDesktopTitle(
      activityDesktopNames[selection.activity.id]?.[selection.desktop.index],
      selection.desktop.name
    ).trim();
    return `${selection.activity.name} / ${desktopTitle || `Desktop ${selection.desktop.index + 1}`}`;
  }, [activityDesktopNames, selection]);

  const getDesktopTitle = (
    activity: Activity,
    desktop: VirtualDesktop
  ): string => {
    return cleanGridDesktopTitle(activityDesktopNames[activity.id]?.[desktop.index], desktop.name);
  };

  const getWorkspaceBackLocationLabel = (location: WorkspaceBackLocation | null): string => {
    if (!location) return 'None';
    const activityName =
      activities.find((activity) => activity.id === location.activityId)?.name ??
      location.activityId.slice(0, 8);
    const desktopIndex = Math.max(0, location.desktopNumber - 1);
    const desktopTitle = cleanGridDesktopTitle(
      activityDesktopNames[location.activityId]?.[desktopIndex],
      location.desktopName
    );
    return `${activityName} / ${desktopTitle || `Desktop ${location.desktopNumber || '?'}`}`;
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

  const makeMovedActivityDesktopNames = (
    currentNames: Record<string, string[]>,
    source: GridDragCell,
    target: GridDragCell,
    nextDesktopCount = desktops.length,
    targetBlankIndex: number | null = null
  ): Record<string, string[]> => {
    const nextNames: Record<string, string[]> = { ...currentNames };

    activities.forEach((activity) => {
      nextNames[activity.id] = [...(nextNames[activity.id] ?? [])];
      while (nextNames[activity.id].length < nextDesktopCount) {
        nextNames[activity.id].push('');
      }
    });

    const sourceTitle = cleanGridDesktopTitle(
      currentNames[source.activity.id]?.[source.desktop.index],
      source.desktop.name
    );

    if (targetBlankIndex === null || targetBlankIndex === target.desktop.index) {
      nextNames[target.activity.id][target.desktop.index] = sourceTitle;
      nextNames[source.activity.id][source.desktop.index] = '';
      return nextNames;
    }

    const targetNames = nextNames[target.activity.id];
    if (source.activity.id === target.activity.id) {
      if (source.desktop.index > target.desktop.index) {
        for (let index = targetBlankIndex; index > target.desktop.index; index -= 1) {
          targetNames[index] = targetNames[index - 1] ?? '';
        }
        targetNames[target.desktop.index] = sourceTitle;
        if (targetBlankIndex !== source.desktop.index) {
          targetNames[source.desktop.index] = '';
        }
      } else {
        for (let index = source.desktop.index; index < target.desktop.index; index += 1) {
          targetNames[index] = targetNames[index + 1] ?? '';
        }
        targetNames[target.desktop.index] = sourceTitle;
      }
    } else {
      const sourceNames = nextNames[source.activity.id];
      sourceNames[source.desktop.index] = '';
      for (let index = targetBlankIndex; index > target.desktop.index; index -= 1) {
        targetNames[index] = targetNames[index - 1] ?? '';
      }
      targetNames[target.desktop.index] = sourceTitle;
    }

    return nextNames;
  };

  const makeMovedWindowCounts = (
    currentCounts: Record<string, number>,
    source: GridDragCell,
    target: GridDragCell,
    availableDesktops: VirtualDesktop[],
    targetBlankIndex: number | null = null
  ): Record<string, number> => {
    const nextCounts: Record<string, number> = { ...currentCounts };
    const sourceKey = `${source.activity.id}|${source.desktop.id}`;
    const sourceCount = currentCounts[sourceKey] ?? 0;

    if (targetBlankIndex === null || targetBlankIndex === target.desktop.index) {
      const targetKey = `${target.activity.id}|${target.desktop.id}`;
      nextCounts[targetKey] = sourceCount;
      nextCounts[sourceKey] = 0;
      return nextCounts;
    }

    const keyFor = (activity: Activity, desktopIndex: number): string => {
      const desktop = availableDesktops[desktopIndex];
      return `${activity.id}|${desktop.id}`;
    };

    if (source.activity.id === target.activity.id) {
      if (source.desktop.index > target.desktop.index) {
        for (let index = targetBlankIndex; index > target.desktop.index; index -= 1) {
          nextCounts[keyFor(target.activity, index)] =
            currentCounts[keyFor(target.activity, index - 1)] ?? 0;
        }
        nextCounts[keyFor(target.activity, target.desktop.index)] = sourceCount;
        if (targetBlankIndex !== source.desktop.index) {
          nextCounts[sourceKey] = 0;
        }
      } else {
        for (let index = source.desktop.index; index < target.desktop.index; index += 1) {
          nextCounts[keyFor(target.activity, index)] =
            currentCounts[keyFor(target.activity, index + 1)] ?? 0;
        }
        nextCounts[keyFor(target.activity, target.desktop.index)] = sourceCount;
      }
    } else {
      nextCounts[sourceKey] = 0;
      for (let index = targetBlankIndex; index > target.desktop.index; index -= 1) {
        nextCounts[keyFor(target.activity, index)] =
          currentCounts[keyFor(target.activity, index - 1)] ?? 0;
      }
      nextCounts[keyFor(target.activity, target.desktop.index)] = sourceCount;
    }

    return nextCounts;
  };

  const findBlankIndexForInsert = (
    source: GridDragCell,
    activity: Activity,
    targetDesktopIndex: number,
    availableDesktops: VirtualDesktop[]
  ): number | null => {
    if (source.activity.id === activity.id) {
      if (source.desktop.index > targetDesktopIndex) {
        for (let index = targetDesktopIndex; index < source.desktop.index; index += 1) {
          const desktop = availableDesktops[index];
          if ((windowCounts[`${activity.id}|${desktop.id}`] ?? 0) === 0) {
            return index;
          }
        }
      }
      return source.desktop.index;
    }

    for (let index = targetDesktopIndex; index < availableDesktops.length; index += 1) {
      const desktop = availableDesktops[index];
      if ((windowCounts[`${activity.id}|${desktop.id}`] ?? 0) === 0) {
        return index;
      }
    }

    return null;
  };

  const compactGridState = (
    currentNames: Record<string, string[]>,
    currentCounts: Record<string, number>,
    availableDesktops: VirtualDesktop[]
  ): {
    names: Record<string, string[]>;
    counts: Record<string, number>;
    removableDesktopIds: string[];
  } => {
    const nextNames: Record<string, string[]> = {};
    const nextCounts: Record<string, number> = {};

    activities.forEach((activity) => {
      const sourceNames = currentNames[activity.id] ?? [];
      const keptDesktopIndexes: number[] = [];

      availableDesktops.forEach((desktop) => {
        if ((currentCounts[`${activity.id}|${desktop.id}`] ?? 0) > 0) {
          keptDesktopIndexes.push(desktop.index);
        }
      });

      nextNames[activity.id] = Array.from({ length: availableDesktops.length }, () => '');

      keptDesktopIndexes.forEach((sourceDesktopIndex, targetDesktopIndex) => {
        const sourceDesktop = availableDesktops[sourceDesktopIndex];
        const targetDesktop = availableDesktops[targetDesktopIndex];
        if (!sourceDesktop || !targetDesktop) return;

        nextNames[activity.id][targetDesktopIndex] =
          cleanGridDesktopTitle(sourceNames[sourceDesktopIndex], sourceDesktop.name);
        nextCounts[`${activity.id}|${targetDesktop.id}`] =
          currentCounts[`${activity.id}|${sourceDesktop.id}`] ?? 0;
      });

      for (let desktopIndex = keptDesktopIndexes.length; desktopIndex < availableDesktops.length; desktopIndex += 1) {
        const desktop = availableDesktops[desktopIndex];
        nextCounts[`${activity.id}|${desktop.id}`] = 0;
      }
    });

    const MIN_DESKTOPS = 3;
    let keepDesktopCount = availableDesktops.length;
    while (keepDesktopCount > MIN_DESKTOPS) {
      const desktop = availableDesktops[keepDesktopCount - 1];
      const hasAnyWindows = activities.some(
        (activity) => (nextCounts[`${activity.id}|${desktop.id}`] ?? 0) > 0
      );
      if (hasAnyWindows) break;
      keepDesktopCount -= 1;
    }

    const removableDesktopIds = availableDesktops
      .slice(keepDesktopCount)
      .map((desktop) => desktop.id);

    activities.forEach((activity) => {
      nextNames[activity.id] = nextNames[activity.id].slice(0, keepDesktopCount);
    });

    return { names: nextNames, counts: nextCounts, removableDesktopIds };
  };

  const finishGridCellDrag = async (
    source: GridDragCell,
    target: GridDragCell
  ): Promise<void> => {
    let activeDesktops = desktops;
    let targetBlankIndex: number | null = null;
    let fromFlatIndex = getFlatGridIndex(source.activityRowIndex, source.desktopColumnIndex);
    let toFlatIndex = getFlatGridIndex(target.activityRowIndex, target.desktopColumnIndex);

    setDraggedGridCell(null);
    setDragOverFlatIndex(null);

    if (fromFlatIndex === toFlatIndex) {
      handleCellClick(target.activity, target.activityRowIndex, target.desktop, target.desktopColumnIndex);
      return;
    }

    try {
      const targetCount = windowCounts[`${target.activity.id}|${target.desktop.id}`] ?? 0;

      if (targetCount > 0) {
        targetBlankIndex = findBlankIndexForInsert(
          source,
          target.activity,
          target.desktop.index,
          activeDesktops
        );

        if (targetBlankIndex === null) {
          await window.kde.createVirtualDesktop();
          await wait(300);
          activeDesktops = await window.kde.getVirtualDesktops();
          desktopCountRef.current = activeDesktops.length;
          setDesktops(activeDesktops);

          const newDesktop = activeDesktops[activeDesktops.length - 1];
          if (!newDesktop) {
            throw new Error('KDE did not return the new virtual desktop.');
          }

          targetBlankIndex = activeDesktops.length - 1;
        }

        fromFlatIndex = source.activityRowIndex * activeDesktops.length + source.desktopColumnIndex;
        toFlatIndex = target.activityRowIndex * activeDesktops.length + target.desktopColumnIndex;
      }

      const movedNames = makeMovedActivityDesktopNames(
        activityDesktopNames,
        source,
        target,
        activeDesktops.length,
        targetBlankIndex
      );
      const movedCounts = makeMovedWindowCounts(
        windowCounts,
        source,
        target,
        activeDesktops,
        targetBlankIndex
      );
      const compactedGrid = compactGridState(movedNames, movedCounts, activeDesktops);

      setActivityDesktopNames(compactedGrid.names);
      setWindowCounts(compactedGrid.counts);
      handleCellClick(
        target.activity,
        target.activityRowIndex,
        target.desktop,
        target.desktopColumnIndex
      );

      const activityIds = activities.map((activity) => activity.id);
      await window.kde.setActivityDesktopNames(compactedGrid.names);
      await window.kde.reorderGridContents(activityIds, fromFlatIndex, toFlatIndex);

      if (compactedGrid.removableDesktopIds.length > 0) {
        await wait(500);
        for (const desktopId of compactedGrid.removableDesktopIds) {
          await window.kde.removeVirtualDesktop(desktopId);
        }
        await wait(300);
        activeDesktops = await window.kde.getVirtualDesktops();
        desktopCountRef.current = activeDesktops.length;
        setDesktops(activeDesktops);
      }

      const targetTitle = getDesktopTitle(target.activity, target.desktop);
      setEventLog((current) => [
        `✓ Grid cell moved → ${target.activity.name} / ${targetTitle || `Desktop ${target.desktop.index + 1}`}${
          compactedGrid.removableDesktopIds.length > 0
            ? `, removed ${compactedGrid.removableDesktopIds.length} empty desktop${compactedGrid.removableDesktopIds.length === 1 ? '' : 's'}`
            : ''
        }`,
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

  const handleWorkspaceBack = async (): Promise<void> => {
    setIsWorkspaceBacking(true);
    void window.kde.hideWindow();
    try {
      await window.kde.workspaceBack();
      await wait(300);
      await Promise.all([
        loadWorkspaceBackState(),
        loadCurrentActivity(),
        loadWindowCounts()
      ]);
      setEventLog((current) => ['✓ Workspace Back', ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Workspace Back failed: ${message}`, ...current]);
    } finally {
      setIsWorkspaceBacking(false);
    }
  };

  const handleCreateVirtualDesktop = async (): Promise<void> => {
    setIsCreatingDesktop(true);
    try {
      await window.kde.createVirtualDesktop();
      await wait(300);
      await Promise.all([
        loadVirtualDesktops(),
        loadActivityDesktopNames(),
        loadWindowCounts()
      ]);
      setEventLog((current) => ['✓ Virtual desktop created', ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setEventLog((current) => [`✗ Create desktop failed: ${message}`, ...current]);
    } finally {
      setIsCreatingDesktop(false);
    }
  };

  const canRestoreLayout = !isRestoringLayout && !isMovingCurrentDesktop;
  const canWorkspaceBack = !isWorkspaceBacking && Boolean(workspaceBackState.previous);
  const canCreateDesktop = !isCreatingDesktop && !isLoadingDesktops;

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

      <div className="workspace-back-panel">
        <div className="workspace-back-status">
          <div>
            <span>Current</span>
            <strong>{getWorkspaceBackLocationLabel(workspaceBackState.current)}</strong>
          </div>
          <div>
            <span>Previous</span>
            <strong>{getWorkspaceBackLocationLabel(workspaceBackState.previous)}</strong>
          </div>
        </div>
        <div className="workspace-action-buttons">
          <button
            className="action-btn workspace-back-btn"
            type="button"
            data-loading={String(isWorkspaceBacking)}
            onClick={() => void handleWorkspaceBack()}
            disabled={!canWorkspaceBack}
          >
            ← Workspace Back
          </button>
          <button
            className="action-btn"
            type="button"
            data-loading={String(isCreatingDesktop)}
            onClick={() => void handleCreateVirtualDesktop()}
            disabled={!canCreateDesktop}
          >
            + Desktop
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
              style={{ gridTemplateColumns: `120px repeat(${desktops.length}, 150px)` }}
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
                        <textarea
                          className="cell-title-input"
                          value={desktopTitle}
                          rows={2}
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
