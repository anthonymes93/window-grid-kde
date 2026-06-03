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
let lastBulkMoveLayout = null;

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

    log(
      '[GEOMETRY BEFORE] caption="' + caption + '"' +
      ' | x=' + (savedGeo ? savedGeo.x : '?') +
      ' | y=' + (savedGeo ? savedGeo.y : '?') +
      ' | width=' + (savedGeo ? savedGeo.width : '?') +
      ' | height=' + (savedGeo ? savedGeo.height : '?')
    );

    {
      let _outName = '(unavailable)';
      let _screen = '(unavailable)';
      let _dpr = '(unavailable)';
      let _bufGeo = '(unavailable)';
      try { const o = window.output; if (o) { _outName = String(o.name !== undefined ? o.name : o); _dpr = o.devicePixelRatio !== undefined ? String(o.devicePixelRatio) : (o.scale !== undefined ? String(o.scale) : '(unavailable)'); } } catch (e) { _outName = 'ERR:' + e; }
      try { if (window.screen !== undefined) _screen = String(window.screen); } catch (e) { _screen = 'ERR:' + e; }
      try { const bg = window.bufferGeometry; _bufGeo = bg ? (bg.x + ',' + bg.y + ',' + bg.width + ',' + bg.height) : '(null)'; } catch (e) {}
      log('[MONITOR SAVE] caption="' + caption + '" | output=' + _outName + ' | screen=' + _screen + ' | devicePixelRatio=' + _dpr + ' | frameGeo=' + (savedGeo ? savedGeo.x + ',' + savedGeo.y + ',' + savedGeo.width + ',' + savedGeo.height : '(null)') + ' | bufferGeo=' + _bufGeo);
    }

    {
      let _fs = '?', _mm = '?', _tm = '?', _min = '?', _ka = '?', _kb = '?';
      try { _fs = String(window.fullScreen !== undefined ? window.fullScreen : (window.fullscreen !== undefined ? window.fullscreen : '(unavailable)')); } catch(e) {}
      try { _mm = window.maximizeMode !== undefined ? String(window.maximizeMode) : '(unavailable)'; } catch(e) {}
      try { _tm = window.quickTileMode !== undefined ? String(window.quickTileMode) : '(unavailable)'; } catch(e) {}
      try { _min = window.minimized !== undefined ? String(window.minimized) : '(unavailable)'; } catch(e) {}
      try { _ka = window.keepAbove !== undefined ? String(window.keepAbove) : '(unavailable)'; } catch(e) {}
      try { _kb = window.keepBelow !== undefined ? String(window.keepBelow) : '(unavailable)'; } catch(e) {}
      log('[STATE SAVE] caption="' + caption + '" | fullScreen=' + _fs + ' | maximizeMode=' + _mm + ' | quickTileMode=' + _tm + ' | minimized=' + _min + ' | keepAbove=' + _ka + ' | keepBelow=' + _kb);
    }

    log(`* ${caption}`);
    moveWindowToActivityAndDesktop(window, targetActivityId, targetDesktopId);

    if (savedGeo && !isMaximized && !isFullScreen) {
      lastBulkMoveLayout.push({ window, caption, x: savedGeo.x, y: savedGeo.y, width: savedGeo.width, height: savedGeo.height });
    }
  }
  log('lastBulkMoveLayout saved: ' + lastBulkMoveLayout.length + ' windows');

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

function waitForRestoreLayoutRequest() {
  log('waiting for restore layout request');
  callDBus(
    SERVICE_NAME,
    OBJECT_PATH,
    INTERFACE_NAME,
    'WaitForRestoreLayoutRequest',
    function(requestId) {
      log('restore layout request received | requestId=' + requestId + ' | lastBulkMoveLayout length=' + (lastBulkMoveLayout ? lastBulkMoveLayout.length : 'null'));
      if (requestId) {
        if (lastBulkMoveLayout && lastBulkMoveLayout.length > 0) {
          log('RestoreLastLayout: lastBulkMoveLayout length=' + lastBulkMoveLayout.length);
          for (let i = 0; i < lastBulkMoveLayout.length; i++) {
            const entry = lastBulkMoveLayout[i];
            let windowExists = false;
            try { windowExists = Boolean(entry.window && entry.window.frameGeometry); } catch (e) {}
            log(
              'RestoreLastLayout window[' + i + ']' +
              ' | caption="' + entry.caption + '"' +
              ' | windowExists=' + windowExists +
              ' | savedGeo=' + entry.x + ',' + entry.y + ',' + entry.width + ',' + entry.height
            );
            {
              let _outName = '(unavailable)';
              let _screen = '(unavailable)';
              let _dpr = '(unavailable)';
              let _bufGeo = '(unavailable)';
              let _frameGeo = '(unavailable)';
              try { const o = entry.window.output; if (o) { _outName = String(o.name !== undefined ? o.name : o); _dpr = o.devicePixelRatio !== undefined ? String(o.devicePixelRatio) : (o.scale !== undefined ? String(o.scale) : '(unavailable)'); } } catch (e) { _outName = 'ERR:' + e; }
              try { if (entry.window.screen !== undefined) _screen = String(entry.window.screen); } catch (e) { _screen = 'ERR:' + e; }
              try { const bg = entry.window.bufferGeometry; _bufGeo = bg ? (bg.x + ',' + bg.y + ',' + bg.width + ',' + bg.height) : '(null)'; } catch (e) {}
              try { const fg = entry.window.frameGeometry; _frameGeo = fg ? (fg.x + ',' + fg.y + ',' + fg.width + ',' + fg.height) : '(null)'; } catch (e) {}
              log('[MONITOR RESTORE] caption="' + entry.caption + '" | output=' + _outName + ' | screen=' + _screen + ' | devicePixelRatio=' + _dpr + ' | frameGeo=' + _frameGeo + ' | bufferGeo=' + _bufGeo + ' | savedGeo=' + entry.x + ',' + entry.y + ',' + entry.width + ',' + entry.height);
            }
            {
              let _fs = '?', _mm = '?', _tm = '?', _min = '?', _ka = '?', _kb = '?';
              try { _fs = String(entry.window.fullScreen !== undefined ? entry.window.fullScreen : (entry.window.fullscreen !== undefined ? entry.window.fullscreen : '(unavailable)')); } catch(e) {}
              try { _mm = entry.window.maximizeMode !== undefined ? String(entry.window.maximizeMode) : '(unavailable)'; } catch(e) {}
              try { _tm = entry.window.quickTileMode !== undefined ? String(entry.window.quickTileMode) : '(unavailable)'; } catch(e) {}
              try { _min = entry.window.minimized !== undefined ? String(entry.window.minimized) : '(unavailable)'; } catch(e) {}
              try { _ka = entry.window.keepAbove !== undefined ? String(entry.window.keepAbove) : '(unavailable)'; } catch(e) {}
              try { _kb = entry.window.keepBelow !== undefined ? String(entry.window.keepBelow) : '(unavailable)'; } catch(e) {}
              log('[STATE RESTORE] caption="' + entry.caption + '" | fullScreen=' + _fs + ' | maximizeMode=' + _mm + ' | quickTileMode=' + _tm + ' | minimized=' + _min + ' | keepAbove=' + _ka + ' | keepBelow=' + _kb);
            }
            try {
              log('[RESTORE APPLY] caption="' + entry.caption + '" | x=' + entry.x + ' | y=' + entry.y + ' | width=' + entry.width + ' | height=' + entry.height);
              entry.window.frameGeometry = { x: entry.x, y: entry.y, width: entry.width, height: entry.height };
              const geoApplied = entry.window.frameGeometry;
              log('[RESTORE APPLIED] caption="' + entry.caption + '" | x=' + (geoApplied ? geoApplied.x : '?') + ' | y=' + (geoApplied ? geoApplied.y : '?') + ' | width=' + (geoApplied ? geoApplied.width : '?') + ' | height=' + (geoApplied ? geoApplied.height : '?'));
              const geoResult = entry.window.frameGeometry;
              log('[RESTORE RESULT] caption="' + entry.caption + '" | x=' + (geoResult ? geoResult.x : '?') + ' | y=' + (geoResult ? geoResult.y : '?') + ' | width=' + (geoResult ? geoResult.width : '?') + ' | height=' + (geoResult ? geoResult.height : '?'));
            } catch (e) {
              log('[RESTORE APPLY] caption="' + entry.caption + '" | ERROR: ' + e);
            }
          }
        } else {
          log('RestoreLastLayout: no layout saved');
        }
      }
      waitForRestoreLayoutRequest();
    }
  );
}

log('Current desktop move script loaded');
log('Restore layout listener started');
waitForCurrentDesktopMoveRequest();
waitForRestoreLayoutRequest();
