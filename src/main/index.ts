import { createRequire } from 'node:module';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain } = require('electron') as typeof import('electron');
const execFileAsync = promisify(execFile);
const PROTOCOL = 'window-grid-kde';

type VirtualDesktop = {
  id: string;
  name: string;
  index: number;
};

type Activity = {
  id: string;
  name: string;
  index: number;
};

type ActiveWindow = {
  id: string;
  title: string;
  windowClass: string | null;
  desktopIds?: string[];
};

type KwinWindowPayload = {
  windowId: string;
  caption: string;
  resourceClass: string | null;
  desktopIds: string[];
};

const unavailableActiveWindow: ActiveWindow = {
  id: 'unavailable',
  title: 'No active window detected',
  windowClass: null
};

let selectedWindow: ActiveWindow | null = null;
let latestWindowCounts: Record<string, number> = {};
let mainWindowRef: import('electron').BrowserWindow | null = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

const runCommand = async (command: string, args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync(command, args, {
    timeout: 5000,
    maxBuffer: 1024 * 1024
  });

  return stdout.trim();
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
};

const readRequestBody = async (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;

      if (body.length > 64 * 1024) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

const isKwinWindowPayload = (value: unknown): value is KwinWindowPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.windowId === 'string' &&
    typeof candidate.caption === 'string' &&
    (typeof candidate.resourceClass === 'string' || candidate.resourceClass === null) &&
    Array.isArray(candidate.desktopIds) &&
    candidate.desktopIds.every((desktopId) => typeof desktopId === 'string')
  );
};

const broadcastSelectedWindow = (windowInfo: ActiveWindow): void => {
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    browserWindow.webContents.send('kde:selectedWindowFromKwin', windowInfo);
  }
};

const storeAndBroadcastSelectedWindow = (windowInfo: ActiveWindow, source: string): void => {
  selectedWindow = windowInfo;
  console.log(`Parsed selected window from ${source}:`, selectedWindow);
  broadcastSelectedWindow(selectedWindow);
};

const parseSelectedWindowUrl = (rawUrl: string): ActiveWindow | null => {
  const parsedUrl = new URL(rawUrl);
  const isSelectWindowUrl =
    parsedUrl.protocol === `${PROTOCOL}:` &&
    (parsedUrl.hostname === 'select-window' || parsedUrl.pathname === '/select-window');

  if (!isSelectWindowUrl) {
    return null;
  }

  const desktopIdsParam = parsedUrl.searchParams.get('desktopIds') ?? '';
  const resourceClass = parsedUrl.searchParams.get('resourceClass');

  return {
    id: parsedUrl.searchParams.get('windowId') ?? '',
    title: parsedUrl.searchParams.get('caption') ?? '',
    windowClass: resourceClass && resourceClass.length > 0 ? resourceClass : null,
    desktopIds:
      desktopIdsParam.length > 0
        ? desktopIdsParam.split(',').filter((desktopId) => desktopId.length > 0)
        : []
  };
};

const handleProtocolUrl = (rawUrl: string): void => {
  try {
    console.log('Received window-grid-kde URL:', rawUrl);
    const parsedWindow = parseSelectedWindowUrl(rawUrl);

    if (!parsedWindow) {
      console.log('Ignored window-grid-kde URL with unsupported action:', rawUrl);
      return;
    }

    storeAndBroadcastSelectedWindow(parsedWindow, 'URL');
  } catch (error) {
    console.error('Failed to parse window-grid-kde URL:', error);
  }
};

const handleProtocolUrlsFromArgv = (argv: string[]): void => {
  for (const argument of argv) {
    if (argument.startsWith(`${PROTOCOL}://`)) {
      handleProtocolUrl(argument);
    }
  }
};

const registerProtocolClient = (): void => {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]]);
    return;
  }

  app.setAsDefaultProtocolClient(PROTOCOL);
};

const handleKwinWindowPost = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  try {
    const body = await readRequestBody(request);
    const parsedPayload = JSON.parse(body) as unknown;

    if (!isKwinWindowPayload(parsedPayload)) {
      sendJson(response, 400, { ok: false, error: 'Invalid KWin window payload.' });
      return;
    }

    const nextSelectedWindow = {
      id: parsedPayload.windowId,
      title: parsedPayload.caption,
      windowClass: parsedPayload.resourceClass,
      desktopIds: parsedPayload.desktopIds
    };

    console.log('Received KWin selected window over HTTP:', nextSelectedWindow);
    storeAndBroadcastSelectedWindow(nextSelectedWindow, 'HTTP');
    sendJson(response, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown request error.';
    sendJson(response, 400, { ok: false, error: message });
  }
};

app.on('second-instance', (_event, commandLine) => {
  handleProtocolUrlsFromArgv(commandLine);

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    if (mainWindowRef.isMinimized()) mainWindowRef.restore();
    mainWindowRef.focus();
  }
});

app.on('open-url', (event, rawUrl) => {
  event.preventDefault();
  handleProtocolUrl(rawUrl);
});

let itWorksWindow: import('electron').BrowserWindow | null = null;

const createItWorksWindow = (): void => {
  itWorksWindow = new BrowserWindow({
    frame: false,
    show: false,
    backgroundColor: '#0d1117',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  void itWorksWindow.loadURL(
    'data:text/html,' +
    encodeURIComponent(
      '<!DOCTYPE html><html><body tabindex="0" style="margin:0;background:#0d1117;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,ui-sans-serif,sans-serif;color:#e6edf3;cursor:pointer;outline:none" onclick="window.close()" onkeydown="window.close()"><h1 style="font-size:80px;font-weight:700;letter-spacing:-2px">it works</h1></body></html>'
    )
  );
  itWorksWindow.on('close', (e) => {
    e.preventDefault();
    itWorksWindow?.hide();
  });
  void pinToAllActivities(itWorksWindow);
};

const toggleItWorksWindow = (): void => {
  if (!itWorksWindow || itWorksWindow.isDestroyed()) {
    createItWorksWindow();
  }
  if (!itWorksWindow) return;

  if (itWorksWindow.isVisible() && !itWorksWindow.isMinimized()) {
    itWorksWindow.hide();
    return;
  }

  itWorksWindow.setAlwaysOnTop(true, 'screen-saver');
  itWorksWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  itWorksWindow.show();
  itWorksWindow.maximize();
  itWorksWindow.focus();
};

const hideWindow = (): void => {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.hide();
};

const pinToAllActivities = async (win: import('electron').BrowserWindow): Promise<void> => {
  if (win.isDestroyed()) return;
  try {
    const handle = win.getNativeWindowHandle();
    const winId = handle.length >= 8
      ? Number(handle.readBigUInt64LE(0))
      : handle.readUInt32LE(0);
    await execFileAsync('xprop', ['-id', String(winId), '-remove', '_KDE_NET_WM_ACTIVITIES'], {
      timeout: 2000
    });
  } catch {
    // non-fatal
  }
};

const toggleWindow = async (): Promise<void> => {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;

  if (mainWindowRef.isVisible() && !mainWindowRef.isMinimized()) {
    hideWindow();
  } else {
    await pinToAllActivities(mainWindowRef);
    mainWindowRef.setAlwaysOnTop(true, 'screen-saver');
    mainWindowRef.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindowRef.show();
    mainWindowRef.maximize();
    mainWindowRef.focus();
    void runCommand('qdbus6', [
      'com.anthony.WindowGridKDE', '/WindowGridKDE',
      'com.anthony.WindowGridKDE.RequestWindowCounts'
    ]);
  }
};

const kwinBridgeServer = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/toggle') {
    void toggleWindow();
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && request.url === '/it-works') {
    toggleItWorksWindow();
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && request.url === '/kwin/window-counts') {
    readRequestBody(request).then((body) => {
      try {
        latestWindowCounts = JSON.parse(body) as Record<string, number>;
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('kde:windowCountsUpdated', latestWindowCounts);
        }
        sendJson(response, 200, { ok: true });
      } catch {
        sendJson(response, 400, { ok: false, error: 'Invalid JSON' });
      }
    }).catch(() => sendJson(response, 400, { ok: false, error: 'Read error' }));
    return;
  }

  if (request.method !== 'POST' || request.url !== '/kwin/window') {
    sendJson(response, 404, { ok: false, error: 'Not found.' });
    return;
  }

  void handleKwinWindowPost(request, response);
});

const startKwinBridgeServer = (): void => {
  kwinBridgeServer.on('error', (error) => {
    console.error('KWin HTTP bridge server error:', error);
  });
  kwinBridgeServer.listen(48745, '127.0.0.1', () => {
    console.log('KWin HTTP bridge listening on http://127.0.0.1:48745');
  });
};

const parseVirtualDesktops = (output: string): VirtualDesktop[] => {
  const desktopPattern = /\[Argument: \([ui]ss\)\s+(\d+),\s+"([^"]+)",\s+"((?:\\"|[^"])*)"\]/g;
  const desktops: VirtualDesktop[] = [];

  for (const match of output.matchAll(desktopPattern)) {
    desktops.push({
      index: Number(match[1]),
      id: match[2],
      name: match[3].replace(/\\"/g, '"')
    });
  }

  if (desktops.length === 0 && output.trim().length > 0) {
    throw new Error('Unable to parse KWin virtual desktop data.');
  }

  return desktops;
};

const parseActivities = (output: string): Activity[] => {
  const activityPattern = /\[Argument: \(ssssi\)\s+"([^"]+)",\s+"((?:\\"|[^"])*)",\s+"(?:\\"|[^"])*",\s+"(?:\\"|[^"])*",\s+\d+\]/g;
  const activities: Activity[] = [];

  for (const match of output.matchAll(activityPattern)) {
    activities.push({
      id: match[1],
      name: match[2].replace(/\\"/g, '"'),
      index: activities.length
    });
  }

  if (activities.length === 0 && output.trim().length > 0) {
    throw new Error('Unable to parse KDE activity data.');
  }

  return activities;
};

const parseVariantMapValue = (output: string, key: string): string | null => {
  const pattern = new RegExp(
    `\\[Argument: \\{sv\\}\\s+"${key}",\\s+\\[Variant\\([^)]*\\):\\s+"((?:\\\\"|[^"])*)"\\]\\]`
  );
  const match = output.match(pattern);

  return match ? match[1].replace(/\\"/g, '"') : null;
};

const parseWindowClass = (output: string): string | null => {
  const match = output.match(/WM_CLASS\(STRING\)\s+=\s+"[^"]*",\s+"([^"]+)"/);

  return match?.[1] ?? null;
};

const getVirtualDesktops = async (): Promise<VirtualDesktop[]> => {
  const { stdout } = await execFileAsync(
    'qdbus6',
    ['--literal', 'org.kde.KWin', '/VirtualDesktopManager', 'desktops'],
    {
      timeout: 5000,
      maxBuffer: 1024 * 1024
    }
  );

  const desktops = parseVirtualDesktops(stdout);

  console.log('qdbus6 virtual desktops raw output:', stdout);
  console.log('qdbus6 virtual desktops parsed:', desktops);

  return desktops;
};

const getActivities = async (): Promise<Activity[]> => {
  const output = await runCommand('qdbus6', [
    '--literal',
    'org.kde.ActivityManager',
    '/ActivityManager/Activities',
    'ListActivitiesWithInformation'
  ]);
  const activities = parseActivities(output);

  console.log('qdbus6 activities raw output:', output);
  console.log('qdbus6 activities parsed:', activities);
  console.log('Activity id -> name mapping:');
  for (const activity of activities) {
    console.log(`  ${activity.id} -> "${activity.name}"`);
  }

  return activities;
};

const getCurrentActivity = async (): Promise<string> => {
  const output = await runCommand('qdbus6', [
    'org.kde.ActivityManager',
    '/ActivityManager/Activities',
    'CurrentActivity'
  ]);

  console.log('qdbus6 CurrentActivity output:', output);

  return output;
};

const getCurrentDesktopNumber = async (): Promise<number> => {
  const output = await runCommand('qdbus6', [
    'org.kde.KWin',
    '/KWin',
    'currentDesktop'
  ]);
  console.log('qdbus6 /KWin currentDesktop output:', output);
  const parsed = parseInt(output, 10);
  if (isNaN(parsed)) {
    throw new Error(`Could not parse currentDesktop number from: ${output}`);
  }
  return parsed;
};

const switchToDesktopNumber = async (desktopNumber: number): Promise<void> => {
  if (!Number.isInteger(desktopNumber) || desktopNumber < 1) {
    throw new Error(`Invalid desktop number: ${desktopNumber}`);
  }

  console.log('[Electron] BEFORE switchToDesktopNumber:', desktopNumber);

  await runCommand('qdbus6', [
    'org.kde.KWin',
    '/KWin',
    'org.kde.KWin.setCurrentDesktop',
    String(desktopNumber)
  ]);

  console.log('[Electron] AFTER switchToDesktopNumber:', desktopNumber);
};

const moveWindowToActivityOnly = async (
  windowId: string,
  activityId: string
): Promise<void> => {
  if (windowId.trim().length === 0) {
    throw new Error(`Invalid window id: ${windowId}`);
  }

  if (activityId.trim().length === 0) {
    throw new Error(`Invalid activity id: ${activityId}`);
  }

  console.log('Requesting activity-only move:', { windowId, activityId });

  await runCommand('qdbus6', [
    'com.anthony.WindowGridKDE',
    '/WindowGridKDE',
    'com.anthony.WindowGridKDE.MoveWindowToActivityOnly',
    windowId,
    activityId
  ]);
};

const switchToActivity = async (activityId: string): Promise<void> => {
  if (activityId.trim().length === 0) {
    throw new Error(`Invalid activity id: ${activityId}`);
  }

  console.log('[Electron] BEFORE switchToActivity:', activityId);

  await runCommand('qdbus6', [
    'org.kde.ActivityManager',
    '/ActivityManager/Activities',
    'SetCurrentActivity',
    activityId
  ]);

  console.log('[Electron] AFTER switchToActivity:', activityId);
};

const getWindowInfoFromKWin = async (windowId: string): Promise<ActiveWindow | null> => {
  const output = await runCommand('qdbus6', [
    '--literal',
    'org.kde.KWin',
    '/KWin',
    'getWindowInfo',
    windowId
  ]);

  console.log('qdbus6 active window getWindowInfo raw output:', output);

  if (!output || output.includes('a{sv} {}')) {
    return null;
  }

  const title =
    parseVariantMapValue(output, 'caption') ??
    parseVariantMapValue(output, 'title') ??
    parseVariantMapValue(output, 'resourceName') ??
    'Unknown window';
  const windowClass =
    parseVariantMapValue(output, 'resourceClass') ??
    parseVariantMapValue(output, 'class') ??
    null;

  return {
    id: windowId,
    title,
    windowClass
  };
};

const getActiveWindowFromX = async (): Promise<ActiveWindow> => {
  const id = await runCommand('xdotool', ['getactivewindow']);
  const [titleResult, classResult] = await Promise.allSettled([
    runCommand('xdotool', ['getwindowname', id]),
    runCommand('xprop', ['-id', id, 'WM_CLASS'])
  ]);
  const title =
    titleResult.status === 'fulfilled' && titleResult.value.length > 0
      ? titleResult.value
      : 'Unknown window';
  const windowClass =
    classResult.status === 'fulfilled' ? parseWindowClass(classResult.value) : null;

  return {
    id,
    title,
    windowClass
  };
};

const getActiveWindow = async (): Promise<ActiveWindow> => {
  try {
    const activeWindowId = await runCommand('qdbus6', [
      'org.kde.KWin',
      '/KWin',
      'activeWindow'
    ]);

    console.log('qdbus6 activeWindow output:', activeWindowId);

    if (activeWindowId) {
      const kwinWindow = await getWindowInfoFromKWin(activeWindowId);

      if (kwinWindow) {
        console.log('active window parsed from KWin:', kwinWindow);
        return kwinWindow;
      }
    }
  } catch (error) {
    console.log('qdbus6 activeWindow unavailable, falling back:', error);
  }

  try {
    const activeWindow = await getActiveWindowFromX();
    console.log('active window parsed from X:', activeWindow);
    return activeWindow;
  } catch (error) {
    console.log('active window detection failed:', error);
    return unavailableActiveWindow;
  }
};

const moveWindowToDesktop = async (
  windowId: string,
  desktopId: string
): Promise<void> => {
  if (windowId.trim().length === 0) {
    throw new Error(`Invalid window id: ${windowId}`);
  }

  if (desktopId.trim().length === 0) {
    throw new Error(`Invalid desktop id: ${desktopId}`);
  }

  console.log('Requesting KWin DBus helper move:', {
    service: 'com.anthony.WindowGridKDE',
    path: '/WindowGridKDE',
    interface: 'com.anthony.WindowGridKDE',
    method: 'MoveWindowToDesktop',
    windowId,
    desktopId
  });
  console.log('Selected window id from Electron:', windowId);

  await runCommand('qdbus6', [
    'com.anthony.WindowGridKDE',
    '/WindowGridKDE',
    'com.anthony.WindowGridKDE.MoveWindowToDesktop',
    windowId,
    desktopId
  ]);
};

const moveWindowToActivityAndDesktop = async (
  windowId: string,
  activityId: string,
  desktopId: string
): Promise<void> => {
  if (windowId.trim().length === 0) {
    throw new Error(`Invalid window id: ${windowId}`);
  }

  if (activityId.trim().length === 0) {
    throw new Error(`Invalid activity id: ${activityId}`);
  }

  if (desktopId.trim().length === 0) {
    throw new Error(`Invalid desktop id: ${desktopId}`);
  }

  console.log('[Electron] BEFORE MoveWindowToActivityAndDesktop:', { windowId, activityId, desktopId });

  await runCommand('qdbus6', [
    'com.anthony.WindowGridKDE',
    '/WindowGridKDE',
    'com.anthony.WindowGridKDE.MoveWindowToActivityAndDesktop',
    windowId,
    activityId,
    desktopId
  ]);

  console.log('[Electron] AFTER MoveWindowToActivityAndDesktop: move DELIVERED to KWin (qdbus6 returned)');
};

const triggerRestoreLayout = async (): Promise<void> => {
  console.log('[Electron] BEFORE TriggerRestoreLayout');

  await runCommand('qdbus6', [
    'com.anthony.WindowGridKDE',
    '/WindowGridKDE',
    'com.anthony.WindowGridKDE.TriggerRestoreLayout'
  ]);

  console.log('[Electron] AFTER TriggerRestoreLayout');
};

const moveCurrentDesktopToActivityAndDesktop = async (
  targetActivityId: string,
  targetDesktopId: string
): Promise<void> => {
  if (targetActivityId.trim().length === 0) {
    throw new Error(`Invalid target activity id: ${targetActivityId}`);
  }

  if (targetDesktopId.trim().length === 0) {
    throw new Error(`Invalid target desktop id: ${targetDesktopId}`);
  }

  console.log('[Electron] BEFORE MoveCurrentDesktopToActivityAndDesktop:', {
    targetActivityId,
    targetDesktopId
  });

  await runCommand('qdbus6', [
    'com.anthony.WindowGridKDE',
    '/WindowGridKDE',
    'com.anthony.WindowGridKDE.MoveCurrentDesktopToActivityAndDesktop',
    targetActivityId,
    targetDesktopId
  ]);

  console.log(
    '[Electron] AFTER MoveCurrentDesktopToActivityAndDesktop: move DELIVERED to KWin (qdbus6 returned)'
  );
};

ipcMain.handle('kde:hideWindow', () => hideWindow());
ipcMain.handle('kde:getWindowCounts', () => latestWindowCounts);
ipcMain.handle('kde:requestWindowCounts', () => {
  void runCommand('qdbus6', [
    'com.anthony.WindowGridKDE', '/WindowGridKDE',
    'com.anthony.WindowGridKDE.RequestWindowCounts'
  ]);
});
ipcMain.handle('kde:getVirtualDesktops', async () => getVirtualDesktops());
ipcMain.handle('kde:getActivities', async () => getActivities());
ipcMain.handle('kde:getCurrentActivity', async () => getCurrentActivity());
ipcMain.handle('kde:getCurrentDesktopNumber', async () => getCurrentDesktopNumber());
ipcMain.handle('kde:switchToDesktopNumber', async (_event, desktopNumber: number) => {
  console.log('IPC kde:switchToDesktopNumber received desktopNumber:', desktopNumber);
  return switchToDesktopNumber(desktopNumber);
});
ipcMain.handle('kde:getActiveWindow', async () => getActiveWindow());
ipcMain.handle('kde:switchToActivity', async (_event, activityId: string) => {
  console.log('IPC kde:switchToActivity received activityId:', activityId);
  return switchToActivity(activityId);
});
ipcMain.handle(
  'kde:moveWindowToActivityOnly',
  async (_event, windowId: string, activityId: string) => {
    console.log('IPC kde:moveWindowToActivityOnly received:', { windowId, activityId });
    return moveWindowToActivityOnly(windowId, activityId);
  }
);
ipcMain.handle(
  'kde:moveWindowToDesktop',
  async (_event, windowId: string, desktopId: string) => {
    console.log('IPC kde:moveWindowToDesktop received stored window id:', windowId);
    console.log('IPC kde:moveWindowToDesktop received selected desktop id:', desktopId);
    return moveWindowToDesktop(windowId, desktopId);
  }
);
ipcMain.handle(
  'kde:moveWindowToActivityAndDesktop',
  async (_event, windowId: string, activityId: string, desktopId: string) => {
    console.log('IPC kde:moveWindowToActivityAndDesktop received:', {
      windowId,
      activityId,
      desktopId
    });
    return moveWindowToActivityAndDesktop(windowId, activityId, desktopId);
  }
);
ipcMain.handle('kde:restoreLastLayout', async () => {
  console.log('IPC kde:restoreLastLayout received');
  return triggerRestoreLayout();
});

ipcMain.handle(
  'kde:moveCurrentDesktopToActivityAndDesktop',
  async (_event, targetActivityId: string, targetDesktopId: string) => {
    console.log('IPC kde:moveCurrentDesktopToActivityAndDesktop received:', {
      targetActivityId,
      targetDesktopId
    });
    return moveCurrentDesktopToActivityAndDesktop(targetActivityId, targetDesktopId);
  }
);

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    center: true,
    resizable: true,
    frame: false,
    show: false,
    title: 'Window Grid KDE',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindowRef = mainWindow;

  mainWindow.webContents.once('did-finish-load', () => {
    if (selectedWindow) {
      mainWindow.webContents.send('kde:selectedWindowFromKwin', selectedWindow);
    }
  });
};

app.whenReady().then(() => {
  registerProtocolClient();
  startKwinBridgeServer();
  createWindow();
  createItWorksWindow();
  handleProtocolUrlsFromArgv(process.argv);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  kwinBridgeServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
