export type VirtualDesktop = {
  id: string;
  name: string;
  index: number;
};

export type Activity = {
  id: string;
  name: string;
  index: number;
};

export type ActiveWindow = {
  id: string;
  title: string;
  windowClass: string | null;
  desktopIds?: string[];
};

declare global {
  interface Window {
    kde: {
      getVirtualDesktops: () => Promise<VirtualDesktop[]>;
      getActivities: () => Promise<Activity[]>;
      getCurrentActivity: () => Promise<string>;
      getCurrentDesktopNumber: () => Promise<number>;
      switchToDesktopNumber: (desktopNumber: number) => Promise<void>;
      getActiveWindow: () => Promise<ActiveWindow>;
      moveWindowToDesktop: (windowId: string, desktopId: string) => Promise<void>;
      moveWindowToActivityAndDesktop: (
        windowId: string,
        activityId: string,
        desktopId: string
      ) => Promise<void>;
      moveCurrentDesktopToActivityAndDesktop: (
        targetActivityId: string,
        targetDesktopId: string
      ) => Promise<void>;
      reorderGridContents: (
        activityIds: string[],
        fromIndex: number,
        toIndex: number
      ) => Promise<void>;
      switchToActivity: (activityId: string) => Promise<void>;
      moveWindowToActivityOnly: (windowId: string, activityId: string) => Promise<void>;
      restoreLastLayout: () => Promise<void>;
      closeAllOnCurrentDesktop: () => Promise<void>;
      hideWindow: () => Promise<void>;
      getWindowCounts: () => Promise<Record<string, number>>;
      requestWindowCounts: () => Promise<void>;
      getActivityDesktopNames: () => Promise<Record<string, string[]>>;
      updateActivityDesktopName: (
        activityId: string,
        desktopIndex: number,
        name: string
      ) => Promise<Record<string, string[]>>;
      setActivityDesktopNames: (
        names: Record<string, string[]>
      ) => Promise<Record<string, string[]>>;
      onWindowCountsUpdated: (callback: (counts: Record<string, number>) => void) => () => void;
      onSelectedWindowFromKwin: (callback: (windowInfo: ActiveWindow) => void) => () => void;
    };
  }
}
