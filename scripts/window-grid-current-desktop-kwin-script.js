/* global callDBus, workspace */

const SERVICE_NAME = 'com.anthony.WindowGridKDE';
const OBJECT_PATH = '/WindowGridKDE';
const INTERFACE_NAME = 'com.anthony.WindowGridKDE';

function log(message) {
  console.log(`Window Grid KDE: ${message}`);
}

log('[SECTION 2] loaded at t=' + Date.now());

function getWorkspaceWindows() {
  if (typeof workspace.windowList === 'function') {
    return workspace.windowList();
  }

  if (Array.isArray(workspace.windows)) {
    return workspace.windows;
  }

  if (Array.isArray(workspace.stackingOrder)) {
    return workspace.stackingOrder;
  }

  return [];
}

function getWorkspaceDesktops() {
  if (typeof workspace.desktops === 'function') {
    return workspace.desktops();
  }

  if (Array.isArray(workspace.desktops)) {
    return workspace.desktops;
  }

  if (
    workspace.desktops &&
    typeof workspace.desktops.length === 'number' &&
    Number.isFinite(workspace.desktops.length)
  ) {
    const desktops = [];

    for (let index = 0; index < workspace.desktops.length; index += 1) {
      desktops.push(workspace.desktops[index]);
    }

    return desktops;
  }

  return [];
}

function getId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.id === 'string') return value.id;
  if (typeof value.uuid === 'string') return value.uuid;
  return String(value);
}

function describeValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'undefined';

  try {
    return String(value);
  } catch (error) {
    return `[unstringifiable: ${error}]`;
  }
}

function logWorkspaceDesktopApiState() {
  log(`workspace.currentDesktop: ${describeValue(workspace.currentDesktop)}`);
  log(`workspace.desktops: ${describeValue(workspace.desktops)}`);
  log(`workspace.virtualDesktops: ${describeValue(workspace.virtualDesktops)}`);
  log(`typeof workspace.desktops = ${typeof workspace.desktops}`);
  log(
    `workspace.desktops.length = ${
      workspace.desktops && typeof workspace.desktops.length !== 'undefined'
        ? workspace.desktops.length
        : 'undefined'
    }`
  );

  try {
    log(`Object.keys(workspace): ${Object.keys(workspace).join(',')}`);
  } catch (error) {
    log(`Object.keys(workspace) failed: ${error}`);
  }
}

function getCaption(window) {
  return window.caption || window.resourceClass || window.resourceName || window.internalId || 'Untitled window';
}

function getWindowActivityIds(window) {
  return Array.isArray(window.activities) ? window.activities.join(',') : '';
}

function getWindowDesktopIds(window) {
  if (window.onAllDesktops) {
    return 'all';
  }

  if (Array.isArray(window.desktops)) {
    return window.desktops.map((desktop) => getId(desktop)).join(',');
  }

  return getId(window.desktop);
}

function isNormalUserWindow(window) {
  return Boolean(
    window &&
    window.normalWindow &&
    !window.desktopWindow &&
    !window.dock &&
    !window.skipTaskbar
  );
}

function windowBelongsToActivity(window, activityId) {
  const activities = Array.isArray(window.activities) ? window.activities : [];

  if (activities.length === 0) {
    return true;
  }

  return activities.includes(activityId);
}

function resolveWindowDesktops(window) {
  if (Array.isArray(window.desktops) && window.desktops.length > 0) {
    return window.desktops;
  }

  if (
    window.desktops &&
    typeof window.desktops.length === 'number' &&
    Number.isFinite(window.desktops.length) &&
    window.desktops.length > 0
  ) {
    const result = [];
    for (let i = 0; i < window.desktops.length; i += 1) {
      result.push(window.desktops[i]);
    }
    return result;
  }

  return [];
}

function windowBelongsToDesktop(window, desktopId) {
  if (window.onAllDesktops) {
    return true;
  }

  const windowDesktops = resolveWindowDesktops(window);
  if (windowDesktops.length > 0) {
    return windowDesktops.some((desktop) => getId(desktop) === desktopId);
  }

  return getId(window.desktop) === desktopId;
}

function findDesktopById(desktopId) {
  const desktops = getWorkspaceDesktops();

  log("Looking for desktop: " + desktopId);
  log("Total desktops returned by getWorkspaceDesktops(): " + desktops.length);

  for (const desktop of desktops) {
    log(
      "Desktop candidate: id=" +
      getId(desktop) +
      " name=" +
      (desktop.name || "")
    );
  }

  return desktops.find((desktop) => getId(desktop) === desktopId) || null;
}

function addActivityMembership(window, targetActivityId) {
  const activities = Array.isArray(window.activities) ? window.activities : [];

  if (activities.length === 0 || activities.includes(targetActivityId)) {
    return;
  }

  window.activities = activities.concat(targetActivityId);
}

function moveWindowToDesktop(window, targetDesktopId) {
  const targetDesktop = findDesktopById(targetDesktopId);

  if (window.onAllDesktops) {
    window.onAllDesktops = false;
  }

  if (targetDesktop && Array.isArray(window.desktops)) {
    window.desktops = [targetDesktop];
    return;
  }

  if (targetDesktop) {
    window.desktop = targetDesktop;
    return;
  }

  window.desktop = targetDesktopId;
}

function moveWindowToActivityAndDesktop(window, targetActivityId, targetDesktopId) {
  addActivityMembership(window, targetActivityId);
  moveWindowToDesktop(window, targetDesktopId);
}
const allWindows = getWorkspaceWindows();

log("All windows count: " + allWindows.length);

for (const window of allWindows) {
  log(
    "WINDOW: " +
    getCaption(window) +
    " | normalWindow=" + window.normalWindow +
    " | skipTaskbar=" + window.skipTaskbar +
    " | desktopWindow=" + window.desktopWindow +
    " | dock=" + window.dock +
    " | activities=" + JSON.stringify(window.activities)
  );
}
let lastBulkMoveLayout = null;

function switchToActivityAndDesktop(activityId, desktopId) {
  callDBus(
    'org.kde.ActivityManager',
    '/ActivityManager/Activities',
    'org.kde.ActivityManager.Activities',
    'SetCurrentActivity',
    activityId,
    function() {
      const targetDesktop = findDesktopById(desktopId);
      if (targetDesktop) {
        workspace.currentDesktop = targetDesktop;
      }
    }
  );
}

function handleMoveCurrentDesktop(targetActivityId, targetDesktopId, requestId) {
  if (!targetActivityId || !targetDesktopId) {
    return;
  }

  const moveStartTime = Date.now();
  log('[MOVE START] t=' + moveStartTime + ' | requestId=' + requestId);

  const currentActivityId = workspace.currentActivity;
  const currentDesktop = workspace.currentDesktop;
  const currentDesktopId = currentDesktop && currentDesktop.id
    ? String(currentDesktop.id)
    : "";

  const candidateWindows = getWorkspaceWindows();
  const matchingWindows = candidateWindows.filter((window) =>
    isNormalUserWindow(window) &&
    window.resourceClass !== 'window-grid-kde' &&
    windowBelongsToActivity(window, currentActivityId) &&
    windowBelongsToDesktop(window, currentDesktopId)
  );

  log('Matching windows found: ' + matchingWindows.length);

  // Switch to target immediately so the transition plays while windows move
  switchToActivityAndDesktop(targetActivityId, targetDesktopId);

  lastBulkMoveLayout = [];
  for (const window of matchingWindows) {
    const caption = getCaption(window);
    const geo = window.frameGeometry;
    const savedGeo = geo
      ? { x: geo.x, y: geo.y, width: geo.width, height: geo.height }
      : null;
    const maximizeMode = window.maximizeMode !== undefined ? window.maximizeMode : '(unavailable)';
    const fullScreen = window.fullScreen !== undefined
      ? Boolean(window.fullScreen)
      : (window.fullscreen !== undefined ? Boolean(window.fullscreen) : '(unavailable)');
    const isMaximized = (typeof maximizeMode === 'number' && maximizeMode !== 0) || maximizeMode === true;
    const isFullScreen = fullScreen === true;

    moveWindowToActivityAndDesktop(window, targetActivityId, targetDesktopId);

    if (savedGeo && !isMaximized && !isFullScreen) {
      lastBulkMoveLayout.push({ window, caption, x: savedGeo.x, y: savedGeo.y, width: savedGeo.width, height: savedGeo.height });
    }
  }

  if (lastBulkMoveLayout.length > 0) {
    callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'Sleep', requestId + '-autorestore', '', '800', function() {
      log('[AUTO RESTORE START]');
      runRestoreLayout();
      log('[AUTO RESTORE COMPLETE]');
    });
    log('[AUTO RESTORE SCHEDULED]');
  }

  log(`MoveCurrentDesktopToActivityAndDesktop complete: requestId=${requestId}`);
}

function waitForCurrentDesktopMoveRequest() {
  log('[SECTION 2] WaitForCurrentDesktopMoveRequest: callDBus sent at t=' + Date.now());

  let handled = false;
  let watchdogId = null;
  try {
    watchdogId = setTimeout(function() {
      if (!handled) {
        handled = true;
        log('[SECTION 2] WaitForCurrentDesktopMoveRequest: watchdog fired — re-arming after disconnect');
        waitForCurrentDesktopMoveRequest();
      }
    }, 15000);
  } catch (e) {}

  callDBus(
    SERVICE_NAME,
    OBJECT_PATH,
    INTERFACE_NAME,
    'WaitForCurrentDesktopMoveRequest',
    function (targetActivityId, targetDesktopId, requestId) {
      if (handled) return;
      handled = true;
      try { clearTimeout(watchdogId); } catch (e) {}
      log('[SECTION 2] WaitForCurrentDesktopMoveRequest: callback fired at t=' + Date.now() + ' activityId=' + targetActivityId + ' desktopId=' + targetDesktopId + ' requestId=' + requestId);
      try {
        handleMoveCurrentDesktop(targetActivityId, targetDesktopId, requestId);
      } catch (error) {
        log(`MoveCurrentDesktopToActivityAndDesktop failed: ${error}`);
      }
      waitForCurrentDesktopMoveRequest();
    }
  );
}

function runRestoreLayout() {
  if (lastBulkMoveLayout && lastBulkMoveLayout.length > 0) {
    for (let i = 0; i < lastBulkMoveLayout.length; i++) {
      const entry = lastBulkMoveLayout[i];
      try {
        entry.window.frameGeometry = { x: entry.x, y: entry.y, width: entry.width, height: entry.height };
      } catch (e) {
        log('[LAYOUT RESTORE] caption="' + entry.caption + '" | ERROR: ' + e);
      }
    }
  }
}

function waitForRestoreLayoutRequest() {
  log('[SECTION 2] WaitForRestoreLayoutRequest: callDBus sent at t=' + Date.now());

  let handled = false;
  let watchdogId = null;
  try {
    watchdogId = setTimeout(function() {
      if (!handled) {
        handled = true;
        log('[SECTION 2] WaitForRestoreLayoutRequest: watchdog fired — re-arming after disconnect');
        waitForRestoreLayoutRequest();
      }
    }, 15000);
  } catch (e) {}

  callDBus(
    SERVICE_NAME,
    OBJECT_PATH,
    INTERFACE_NAME,
    'WaitForRestoreLayoutRequest',
    function(requestId) {
      if (handled) return;
      handled = true;
      try { clearTimeout(watchdogId); } catch (e) {}
      log('[SECTION 2] WaitForRestoreLayoutRequest: callback fired at t=' + Date.now() + ' requestId=' + requestId);
      if (requestId) {
        runRestoreLayout();
      }
      waitForRestoreLayoutRequest();
    }
  );
}

function resolveWindowActivities(window) {
  if (Array.isArray(window.activities) && window.activities.length > 0) {
    return window.activities;
  }
  if (
    window.activities &&
    typeof window.activities.length === 'number' &&
    Number.isFinite(window.activities.length) &&
    window.activities.length > 0
  ) {
    const result = [];
    for (let i = 0; i < window.activities.length; i += 1) {
      result.push(String(window.activities[i]));
    }
    return result;
  }
  return [];
}

function computeWindowCounts() {
  const allWindows = getWorkspaceWindows();
  const allDesktops = getWorkspaceDesktops();
  const counts = {};

  for (let i = 0; i < allWindows.length; i++) {
    const w = allWindows[i];
    if (!isNormalUserWindow(w)) continue;
    if (w.resourceClass === 'window-grid-kde') continue;

    const windowActivities = resolveWindowActivities(w);
    const windowDesktops = w.onAllDesktops ? allDesktops : resolveWindowDesktops(w);

    if (windowDesktops.length === 0 || windowActivities.length === 0) continue;

    for (let ai = 0; ai < windowActivities.length; ai++) {
      const activityId = windowActivities[ai];
      for (let di = 0; di < windowDesktops.length; di++) {
        const desktop = windowDesktops[di];
        const desktopId = desktop && desktop.id ? String(desktop.id) : null;
        if (!desktopId) continue;
        const key = activityId + '|' + desktopId;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }

  return JSON.stringify(counts);
}

function waitForWindowCountsRequest() {
  let handled = false;
  let watchdogId;
  try {
    watchdogId = setTimeout(function() {
      if (!handled) {
        handled = true;
        log('[SECTION 2] WaitForWindowCountsRequest: watchdog fired — re-arming');
        callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'ReceiveWindowCounts', computeWindowCounts(), function() {});
        waitForWindowCountsRequest();
      }
    }, 15000);
  } catch (e) {}

  callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'WaitForWindowCountsRequest', function(trigger) {
    if (handled) return;
    handled = true;
    try { clearTimeout(watchdogId); } catch (e) {}
    if (trigger === 'refresh') {
      callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'ReceiveWindowCounts', computeWindowCounts(), function() {});
    }
    waitForWindowCountsRequest();
  });
}

function handleCloseAll() {
  const currentDesktop = workspace.currentDesktop;
  const currentDesktopId = currentDesktop && currentDesktop.id ? String(currentDesktop.id) : '';
  if (!currentDesktopId) {
    log('[CLOSE ALL] ERROR: could not determine current desktop id');
    return;
  }
  const windows = getWorkspaceWindows();
  let count = 0;
  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];
    if (!isNormalUserWindow(win)) continue;
    if (win.resourceClass === 'window-grid-kde') continue;
    if (windowBelongsToDesktop(win, currentDesktopId)) {
      win.closeWindow();
      count++;
    }
  }
  log('[CLOSE ALL] Closed ' + count + ' windows on desktop ' + currentDesktopId);
}

function waitForCloseAllRequest() {
  let handled = false;
  let watchdogId = null;
  try {
    watchdogId = setTimeout(function() {
      if (!handled) {
        handled = true;
        log('[CLOSE ALL] watchdog fired — re-arming');
        waitForCloseAllRequest();
      }
    }, 15000);
  } catch(e) {}

  callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'WaitForCloseAllRequest', function(requestId) {
    if (handled) return;
    handled = true;
    try { clearTimeout(watchdogId); } catch(e) {}
    log('[CLOSE ALL] callback fired, requestId=' + requestId);
    if (requestId) {
      handleCloseAll();
    }
    waitForCloseAllRequest();
  });
}

log('[SECTION 2] init: starting polling loops at t=' + Date.now());
waitForCurrentDesktopMoveRequest();
waitForRestoreLayoutRequest();
waitForWindowCountsRequest();
waitForCloseAllRequest();
callDBus(SERVICE_NAME, OBJECT_PATH, INTERFACE_NAME, 'ReceiveWindowCounts', computeWindowCounts(), function() {});
