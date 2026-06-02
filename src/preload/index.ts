import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('kde', {
  getVirtualDesktops: () => ipcRenderer.invoke('kde:getVirtualDesktops'),
  getActiveWindow: () => ipcRenderer.invoke('kde:getActiveWindow'),
  moveWindowToDesktop: (windowId: string, desktopIndex: number) =>
    ipcRenderer.invoke('kde:moveWindowToDesktop', windowId, desktopIndex),
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
