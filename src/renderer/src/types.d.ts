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
      getActiveWindow: () => Promise<ActiveWindow>;
      moveWindowToDesktop: (windowId: string, desktopId: string) => Promise<void>;
      moveWindowToActivityAndDesktop: (
        windowId: string,
        activityId: string,
        desktopId: string
      ) => Promise<void>;
      switchToActivity: (activityId: string) => Promise<void>;
      onSelectedWindowFromKwin: (callback: (windowInfo: ActiveWindow) => void) => () => void;
    };
  }
}
