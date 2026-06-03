/* global callDBus, workspace */

const SERVICE_NAME = 'com.anthony.WindowGridKDE';
const OBJECT_PATH = '/WindowGridKDE';
const INTERFACE_NAME = 'com.anthony.WindowGridKDE';

function log(message) {
  console.log(`Window Grid KDE: ${message}`);
}

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
function handleMoveCurrentDesktop(targetActivityId, targetDesktopId, requestId) {
  if (!targetActivityId || !targetDesktopId) {
    return;
  }

  const currentActivityId = workspace.currentActivity;
  const currentDesktopId = getId(workspace.currentDesktop);

  log('MoveCurrentDesktopToActivityAndDesktop');
  log('');
  log(`Current activity: ${currentActivityId}`);
  log(`Current desktop: ${currentDesktopId}`);
  log(`Target activity: ${targetActivityId}`);
  log(`Target desktop: ${targetDesktopId}`);
  log('');
  logWorkspaceDesktopApiState();
  log('');

  const candidateWindows = getWorkspaceWindows();

  log(`Candidate windows found: ${candidateWindows.length}`);
  for (const window of candidateWindows) {
    log(
      `Candidate: ${getCaption(window)} | normalWindow=${Boolean(window.normalWindow)} | desktopWindow=${Boolean(window.desktopWindow)} | dock=${Boolean(window.dock)} | skipTaskbar=${Boolean(window.skipTaskbar)} | activities=${getWindowActivityIds(window)} | desktops=${getWindowDesktopIds(window)}`
    );
  }
  log('');

  log('--- Per-window filter diagnostics ---');
  for (const window of candidateWindows) {
    const passesNormal = isNormalUserWindow(window);
    const passesActivity = windowBelongsToActivity(window, currentActivityId);
    const passesDesktop = windowBelongsToDesktop(window, currentDesktopId);
    log(
      '[FILTER] caption="' + getCaption(window) + '"' +
      ' | currentActivityId=' + currentActivityId +
      ' | currentDesktopId=' + currentDesktopId +
      ' | windowActivityIds=' + getWindowActivityIds(window) +
      ' | windowDesktopIds=' + getWindowDesktopIds(window) +
      ' | isNormalUserWindow=' + passesNormal +
      ' | windowBelongsToActivity=' + passesActivity +
      ' | windowBelongsToDesktop=' + passesDesktop
    );
    const resolvedDesktops = resolveWindowDesktops(window);
    const windowDesktopResolvedIds = resolvedDesktops.map((d) => getId(d)).join(',');
    log(
      '[FILTER-DESKTOP] caption="' + getCaption(window) + '"' +
      ' | typeof window.desktop=' + (typeof window.desktop) +
      ' | window.desktop=' + String(window.desktop) +
      ' | getId(window.desktop)=' + getId(window.desktop) +
      ' | window.desktops=' + (Array.isArray(window.desktops) ? '[len=' + window.desktops.length + '] ' + window.desktops.map((d) => getId(d)).join(',') : String(window.desktops)) +
      ' | windowDesktopResolvedIds=' + windowDesktopResolvedIds
    );
  }
  log('');

  const matchingWindows = candidateWindows.filter((window) =>
    isNormalUserWindow(window) &&
    windowBelongsToActivity(window, currentActivityId) &&
    windowBelongsToDesktop(window, currentDesktopId)
  );

  log(`Filtering for current activity: ${currentActivityId}`);
  log(`Filtering for current desktop: ${currentDesktopId}`);
  log(`Matching windows found: ${matchingWindows.length}`);
  log('');
  log('Moving:');

  for (const window of matchingWindows) {
    log(`* ${getCaption(window)}`);
    moveWindowToActivityAndDesktop(window, targetActivityId, targetDesktopId);
  }

  log(`MoveCurrentDesktopToActivityAndDesktop complete: requestId=${requestId}`);
}

function waitForCurrentDesktopMoveRequest() {
  callDBus(
    SERVICE_NAME,
    OBJECT_PATH,
    INTERFACE_NAME,
    'WaitForCurrentDesktopMoveRequest',
    function (targetActivityId, targetDesktopId, requestId) {
      try {
        handleMoveCurrentDesktop(targetActivityId, targetDesktopId, requestId);
      } catch (error) {
        log(`MoveCurrentDesktopToActivityAndDesktop failed: ${error}`);
      }

      waitForCurrentDesktopMoveRequest();
    }
  );
}

log('Current desktop move script loaded');
waitForCurrentDesktopMoveRequest();
