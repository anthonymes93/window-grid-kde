import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('kde', {
  getVirtualDesktops: () => ipcRenderer.invoke('kde:getVirtualDesktops'),
  getActivities: () => ipcRenderer.invoke('kde:getActivities'),
  getCurrentActivity: () => ipcRenderer.invoke('kde:getCurrentActivity'),
  getCurrentDesktopNumber: () => ipcRenderer.invoke('kde:getCurrentDesktopNumber'),
  switchToDesktopNumber: (desktopNumber: number) =>
    ipcRenderer.invoke('kde:switchToDesktopNumber', desktopNumber),
  getActiveWindow: () => ipcRenderer.invoke('kde:getActiveWindow'),
  moveWindowToDesktop: (windowId: string, desktopId: string) =>
    ipcRenderer.invoke('kde:moveWindowToDesktop', windowId, desktopId),
  moveWindowToActivityAndDesktop: (windowId: string, activityId: string, desktopId: string) =>
    ipcRenderer.invoke('kde:moveWindowToActivityAndDesktop', windowId, activityId, desktopId),
  switchToActivity: (activityId: string) =>
    ipcRenderer.invoke('kde:switchToActivity', activityId),
  moveWindowToActivityOnly: (windowId: string, activityId: string) =>
    ipcRenderer.invoke('kde:moveWindowToActivityOnly', windowId, activityId),
  onSelectedWindowFromKwin: (callback: (windowInfo: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, windowInfo: unknown): void => {
      callback(windowInfo);
    };

    ipcRenderer.on('kde:selectedWindowFromKwin', listener);

    return () => {
      ipcRenderer.removeListener('kde:selectedWindowFromKwin', listener);
    };
  }
});
