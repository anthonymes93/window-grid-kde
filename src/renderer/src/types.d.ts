export type VirtualDesktop = {
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
      getActiveWindow: () => Promise<ActiveWindow>;
      moveWindowToDesktop: (windowId: string, desktopIndex: number) => Promise<void>;
      onSelectedWindowFromKwin: (callback: (windowInfo: ActiveWindow) => void) => () => void;
    };
  }
}
