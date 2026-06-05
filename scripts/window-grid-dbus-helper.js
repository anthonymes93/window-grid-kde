import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dbus = require('dbus-next');

const { Interface, method } = dbus.interface;

const SERVICE_NAME = 'com.anthony.WindowGridKDE';
const OBJECT_PATH = '/WindowGridKDE';
const ELECTRON_ENDPOINT = 'http://127.0.0.1:48745/kwin/window';
const MOVE_WAIT_TIMEOUT_MS = 60_000;

const pendingMoveRequests = [];
const pendingMoveWaiters = [];
const pendingCurrentDesktopMoveRequests = [];
const pendingCurrentDesktopMoveWaiters = [];
const pendingRestoreRequests = [];
const pendingRestoreWaiters = [];
const pendingCloseAllRequests = [];
const pendingCloseAllWaiters = [];
const pendingWindowCountsRequests = [];
const pendingWindowCountsWaiters = [];
const pendingDesktopReorderRequests = [];
const pendingDesktopReorderWaiters = [];
let requestIdCounter = 0;

const toDesktopIds = (desktopIdsCsv) =>
  desktopIdsCsv
    .split(',')
    .map((desktopId) => desktopId.trim())
    .filter((desktopId) => desktopId.length > 0);

const postSelectedWindow = async (payload) => {
  console.log('[Window Grid DBus Helper] Forwarding to Electron:', payload);

  const response = await fetch(ELECTRON_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Electron HTTP ${response.status}: ${responseText}`);
  }

  console.log('[Window Grid DBus Helper] Electron response:', responseText);
};

const notifyCurrentDesktopMoveWaiters = () => {
  while (pendingCurrentDesktopMoveRequests.length > 0 && pendingCurrentDesktopMoveWaiters.length > 0) {
    const queueLengthBefore = pendingCurrentDesktopMoveRequests.length;
    const moveRequest = pendingCurrentDesktopMoveRequests.shift();
    const waiter = pendingCurrentDesktopMoveWaiters.shift();
    clearTimeout(waiter.timeoutId);
    console.log(
      `[Window Grid DBus Helper] DELIVERED current-desktop requestId=${moveRequest.requestId} to KWin (queue before=${queueLengthBefore}, after=${pendingCurrentDesktopMoveRequests.length})`
    );
    if (moveRequest.onDelivered) moveRequest.onDelivered();
    waiter.resolve([moveRequest.targetActivityId, moveRequest.targetDesktopId, moveRequest.requestId]);
  }
};

const notifyRestoreWaiters = () => {
  while (pendingRestoreRequests.length > 0 && pendingRestoreWaiters.length > 0) {
    const request = pendingRestoreRequests.shift();
    const waiter = pendingRestoreWaiters.shift();
    clearTimeout(waiter.timeoutId);
    console.log(`[Window Grid DBus Helper] DELIVERED restore requestId=${request.requestId} to KWin`);
    waiter.resolve(request.requestId);
  }
};

const notifyDesktopReorderWaiters = () => {
  while (pendingDesktopReorderRequests.length > 0 && pendingDesktopReorderWaiters.length > 0) {
    const request = pendingDesktopReorderRequests.shift();
    const waiter = pendingDesktopReorderWaiters.shift();
    clearTimeout(waiter.timeoutId);
    console.log(
      `[Window Grid DBus Helper] DELIVERED desktop-reorder requestId=${request.requestId} from=${request.fromIndex} to=${request.toIndex}`
    );
    if (request.onDelivered) request.onDelivered();
    waiter.resolve([request.fromIndex, request.toIndex, request.activityId, request.requestId]);
  }
};

const notifyMoveWaiters = () => {
  while (pendingMoveRequests.length > 0 && pendingMoveWaiters.length > 0) {
    const queueLengthBefore = pendingMoveRequests.length;
    const moveRequest = pendingMoveRequests.shift();
    const waiter = pendingMoveWaiters.shift();
    const queueLengthAfter = pendingMoveRequests.length;

    clearTimeout(waiter.timeoutId);
    console.log(
      `[Window Grid DBus Helper] DELIVERED requestId=${moveRequest.requestId} to KWin (queue before=${queueLengthBefore}, after=${queueLengthAfter})`
    );

    // Signal Electron that KWin has the request before KWin's callback fires
    if (moveRequest.onDelivered) {
      moveRequest.onDelivered();
    }
console.log(
  '[Window Grid DBus Helper] Resolving waiter:',
  moveRequest.windowId,
  moveRequest.activityId ?? '',
  moveRequest.desktopId,
  moveRequest.requestId
);
    waiter.resolve([
      moveRequest.windowId,
      moveRequest.activityId ?? '',
      moveRequest.desktopId,
      moveRequest.requestId
    ]);
  }
};

class WindowGridKDEInterface extends Interface {
  constructor() {
    super(SERVICE_NAME);
  }

  
  async SelectWindow(windowId, caption, resourceClass, desktopIdsCsv) {
    console.log('[Window Grid DBus Helper] SelectWindow called:', {
      windowId,
      caption,
      resourceClass,
      desktopIdsCsv
    });

    await postSelectedWindow({
      windowId,
      caption,
      resourceClass: resourceClass.length > 0 ? resourceClass : null,
      desktopIds: toDesktopIds(desktopIdsCsv)
    });
  }

  MoveWindowToDesktop(windowId, desktopId) {
    const requestId = String(++requestIdCounter);
    console.log('[Window Grid DBus Helper] MoveWindowToDesktop called:', {
      requestId,
      windowId,
      desktopId,
      queueLengthBefore: pendingMoveRequests.length
    });

    pendingMoveRequests.push({ windowId, desktopId, requestId });
    console.log('[Window Grid DBus Helper] Queue length after push:', pendingMoveRequests.length);
    notifyMoveWaiters();
  }

  MoveWindowToActivityAndDesktop(windowId, activityId, desktopId) {
    const requestId = String(++requestIdCounter);
    console.log('[Window Grid DBus Helper] MoveWindowToActivityAndDesktop CALLED:', {
      requestId,
      windowId,
      activityId,
      desktopId,
      queueLengthBefore: pendingMoveRequests.length
    });

    return new Promise((resolve, reject) => {
      const deliveryTimeoutId = setTimeout(() => {
        const idx = pendingMoveRequests.findIndex((r) => r.requestId === requestId);
        if (idx >= 0) {
          pendingMoveRequests.splice(idx, 1);
        }
        console.log(`[Window Grid DBus Helper] MoveWindowToActivityAndDesktop TIMEOUT: requestId=${requestId} not delivered within 10s`);
        reject(new Error(`Move request ${requestId} not delivered to KWin within 10s`));
      }, 10_000);

      const request = {
        windowId,
        activityId,
        desktopId,
        requestId,
        onDelivered: () => {
          clearTimeout(deliveryTimeoutId);
          console.log(`[Window Grid DBus Helper] MoveWindowToActivityAndDesktop DELIVERED: requestId=${requestId}`);
          resolve(requestId);
        }
      };

      pendingMoveRequests.push(request);
      console.log('[Window Grid DBus Helper] Queue length after push:', pendingMoveRequests.length);
      notifyMoveWaiters();
    });
  }

  MoveWindowToActivityOnly(windowId, activityId) {
    const requestId = String(++requestIdCounter);
    console.log('[Window Grid DBus Helper] MoveWindowToActivityOnly called:', {
      requestId,
      windowId,
      activityId,
      queueLengthBefore: pendingMoveRequests.length
    });

    pendingMoveRequests.push({ windowId, activityId, desktopId: '', requestId });
    console.log('[Window Grid DBus Helper] Queue length after push:', pendingMoveRequests.length);
    notifyMoveWaiters();
  }

  Sleep(requestId, windowId, delayMs) {
    const delayMsInt = Math.max(0, Math.min(30_000, parseInt(delayMs, 10) || 0));
    console.log(`[Window Grid DBus Helper] Sleep scheduled: requestId=${requestId} windowId=${windowId} delayMs=${delayMsInt}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`[Window Grid DBus Helper] Sleep fired: requestId=${requestId} windowId=${windowId}`);
        resolve([requestId, windowId]);
      }, delayMsInt);
    });
  }

  WaitForMoveRequest() {
    if (pendingMoveRequests.length > 0) {
      const queueLengthBefore = pendingMoveRequests.length;
      const moveRequest = pendingMoveRequests.shift();
      console.log(
        `[Window Grid DBus Helper] DELIVERED requestId=${moveRequest.requestId} to KWin immediately (queue before=${queueLengthBefore}, after=${pendingMoveRequests.length})`
      );
      if (moveRequest.onDelivered) {
        moveRequest.onDelivered();
      }
      return [moveRequest.windowId, moveRequest.activityId ?? '', moveRequest.desktopId, moveRequest.requestId];
    }

    console.log('[Window Grid DBus Helper] KWin waiting for next move request. Queue length:', pendingMoveRequests.length);

    return new Promise((resolve) => {
      const waiter = {
        resolve,
        timeoutId: null
      };

      waiter.timeoutId = setTimeout(() => {
        const idx = pendingMoveWaiters.indexOf(waiter);
        if (idx >= 0) {
          pendingMoveWaiters.splice(idx, 1);
        }
        console.log('[Window Grid DBus Helper] WaitForMoveRequest heartbeat timeout');
        resolve(['', '', '', '']);
      }, 8000);

      pendingMoveWaiters.push(waiter);
    });
  }

  MoveCurrentDesktopToActivityAndDesktop(targetActivityId, targetDesktopId) {
    const requestId = String(++requestIdCounter);
    console.log('[Window Grid DBus Helper] MoveCurrentDesktopToActivityAndDesktop CALLED:', {
      requestId, targetActivityId, targetDesktopId,
      queueLengthBefore: pendingCurrentDesktopMoveRequests.length
    });
    return new Promise((resolve, reject) => {
      const deliveryTimeoutId = setTimeout(() => {
        const idx = pendingCurrentDesktopMoveRequests.findIndex((r) => r.requestId === requestId);
        if (idx >= 0) pendingCurrentDesktopMoveRequests.splice(idx, 1);
        console.log(`[Window Grid DBus Helper] MoveCurrentDesktopToActivityAndDesktop TIMEOUT: requestId=${requestId}`);
        reject(new Error(`Current desktop move request ${requestId} not delivered to KWin within 10s`));
      }, 10_000);
      const request = {
        targetActivityId, targetDesktopId, requestId,
        onDelivered: () => {
          clearTimeout(deliveryTimeoutId);
          console.log(`[Window Grid DBus Helper] MoveCurrentDesktopToActivityAndDesktop DELIVERED: requestId=${requestId}`);
          resolve(requestId);
        }
      };
      pendingCurrentDesktopMoveRequests.push(request);
      console.log('[Window Grid DBus Helper] Current desktop queue length after push:', pendingCurrentDesktopMoveRequests.length);
      notifyCurrentDesktopMoveWaiters();
    });
  }

  WaitForCurrentDesktopMoveRequest() {
    if (pendingCurrentDesktopMoveRequests.length > 0) {
      const moveRequest = pendingCurrentDesktopMoveRequests.shift();
      console.log(`[Window Grid DBus Helper] DELIVERED current-desktop requestId=${moveRequest.requestId} to KWin immediately`);
      if (moveRequest.onDelivered) moveRequest.onDelivered();
      return [moveRequest.targetActivityId, moveRequest.targetDesktopId, moveRequest.requestId];
    }
    console.log('[Window Grid DBus Helper] KWin waiting for next current desktop move request.');
    return new Promise((resolve) => {
      const waiter = { resolve, timeoutId: null };
      waiter.timeoutId = setTimeout(() => {
        const idx = pendingCurrentDesktopMoveWaiters.indexOf(waiter);
        if (idx >= 0) pendingCurrentDesktopMoveWaiters.splice(idx, 1);
        console.log('[Window Grid DBus Helper] WaitForCurrentDesktopMoveRequest heartbeat timeout');
        resolve(['', '', '']);
      }, 8000);
      pendingCurrentDesktopMoveWaiters.push(waiter);
    });
  }

  TriggerRestoreLayout() {
    const requestId = String(++requestIdCounter);
    console.log('[Window Grid DBus Helper] TriggerRestoreLayout called:', { requestId });
    pendingRestoreRequests.push({ requestId });
    notifyRestoreWaiters();
  }

  WaitForRestoreLayoutRequest() {
    if (pendingRestoreRequests.length > 0) {
      const request = pendingRestoreRequests.shift();
      console.log(`[Window Grid DBus Helper] DELIVERED restore requestId=${request.requestId} to KWin immediately`);
      return request.requestId;
    }
    return new Promise((resolve) => {
      const waiter = { resolve, timeoutId: null };
      waiter.timeoutId = setTimeout(() => {
        const idx = pendingRestoreWaiters.indexOf(waiter);
        if (idx >= 0) pendingRestoreWaiters.splice(idx, 1);
        console.log('[Window Grid DBus Helper] WaitForRestoreLayoutRequest heartbeat timeout');
        resolve('');
      }, 8000);
      pendingRestoreWaiters.push(waiter);
    });
  }

  RequestWindowCounts() {
    if (pendingWindowCountsWaiters.length > 0) {
      const waiter = pendingWindowCountsWaiters.shift();
      clearTimeout(waiter.timeoutId);
      waiter.resolve('refresh');
    } else {
      pendingWindowCountsRequests.push('refresh');
    }
  }

  WaitForWindowCountsRequest() {
    if (pendingWindowCountsRequests.length > 0) {
      pendingWindowCountsRequests.shift();
      return 'refresh';
    }
    return new Promise((resolve) => {
      const waiter = { resolve, timeoutId: null };
      waiter.timeoutId = setTimeout(() => {
        const idx = pendingWindowCountsWaiters.indexOf(waiter);
        if (idx >= 0) pendingWindowCountsWaiters.splice(idx, 1);
        resolve('');
      }, 8000);
      pendingWindowCountsWaiters.push(waiter);
    });
  }

  async ReceiveWindowCounts(jsonData) {
    await fetch('http://127.0.0.1:48745/kwin/window-counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonData
    });
  }

  TriggerCloseAll() {
    const requestId = String(++requestIdCounter);
    console.log('[Window Grid DBus Helper] TriggerCloseAll called:', { requestId });
    if (pendingCloseAllWaiters.length > 0) {
      const waiter = pendingCloseAllWaiters.shift();
      clearTimeout(waiter.timeoutId);
      waiter.resolve(requestId);
    } else {
      pendingCloseAllRequests.push({ requestId });
    }
  }

  WaitForCloseAllRequest() {
    if (pendingCloseAllRequests.length > 0) {
      const request = pendingCloseAllRequests.shift();
      console.log(`[Window Grid DBus Helper] DELIVERED close-all requestId=${request.requestId} to KWin immediately`);
      return request.requestId;
    }
    return new Promise((resolve) => {
      const waiter = { resolve, timeoutId: null };
      waiter.timeoutId = setTimeout(() => {
        const idx = pendingCloseAllWaiters.indexOf(waiter);
        if (idx >= 0) pendingCloseAllWaiters.splice(idx, 1);
        resolve('');
      }, 8000);
      pendingCloseAllWaiters.push(waiter);
    });
  }

  ReorderDesktopContents(fromIndex, toIndex, activityId) {
    const requestId = String(++requestIdCounter);
    console.log('[Window Grid DBus Helper] ReorderDesktopContents called:', {
      requestId,
      fromIndex,
      toIndex,
      activityId,
      queueLengthBefore: pendingDesktopReorderRequests.length
    });

    return new Promise((resolve, reject) => {
      const deliveryTimeoutId = setTimeout(() => {
        const idx = pendingDesktopReorderRequests.findIndex((request) => request.requestId === requestId);
        if (idx >= 0) pendingDesktopReorderRequests.splice(idx, 1);
        reject(new Error(`Desktop reorder request ${requestId} not delivered to KWin within 10s`));
      }, 10_000);

      pendingDesktopReorderRequests.push({
        fromIndex,
        toIndex,
        activityId,
        requestId,
        onDelivered: () => {
          clearTimeout(deliveryTimeoutId);
          resolve(requestId);
        }
      });
      notifyDesktopReorderWaiters();
    });
  }

  WaitForDesktopReorderRequest() {
    if (pendingDesktopReorderRequests.length > 0) {
      const request = pendingDesktopReorderRequests.shift();
      console.log(`[Window Grid DBus Helper] DELIVERED desktop-reorder requestId=${request.requestId} immediately`);
      if (request.onDelivered) request.onDelivered();
      return [request.fromIndex, request.toIndex, request.activityId, request.requestId];
    }

    return new Promise((resolve) => {
      const waiter = { resolve, timeoutId: null };
      waiter.timeoutId = setTimeout(() => {
        const idx = pendingDesktopReorderWaiters.indexOf(waiter);
        if (idx >= 0) pendingDesktopReorderWaiters.splice(idx, 1);
        resolve(['', '', '', '']);
      }, 8000);
      pendingDesktopReorderWaiters.push(waiter);
    });
  }

  ToggleWindow() {
    fetch('http://127.0.0.1:48745/toggle', { method: 'POST' }).catch(() => {});
  }

  ToggleItWorks() {
    fetch('http://127.0.0.1:48745/it-works', { method: 'POST' }).catch(() => {});
  }
}

const selectWindowDescriptor = method({ inSignature: 'ssss', outSignature: '' })({
  kind: 'method',
  key: 'SelectWindow',
  descriptor: Object.getOwnPropertyDescriptor(
    WindowGridKDEInterface.prototype,
    'SelectWindow'
  )
});

selectWindowDescriptor.finisher(WindowGridKDEInterface);

const moveWindowDescriptor = method({ inSignature: 'ss', outSignature: '' })({
  kind: 'method',
  key: 'MoveWindowToDesktop',
  descriptor: Object.getOwnPropertyDescriptor(
    WindowGridKDEInterface.prototype,
    'MoveWindowToDesktop'
  )
});

moveWindowDescriptor.finisher(WindowGridKDEInterface);

const moveWindowActivityDesktopDescriptor = method({ inSignature: 'sss', outSignature: 's' })({
  kind: 'method',
  key: 'MoveWindowToActivityAndDesktop',
  descriptor: Object.getOwnPropertyDescriptor(
    WindowGridKDEInterface.prototype,
    'MoveWindowToActivityAndDesktop'
  )
});

moveWindowActivityDesktopDescriptor.finisher(WindowGridKDEInterface);

const waitForMoveDescriptor = method({ inSignature: '', outSignature: 'ssss' })({
  kind: 'method',
  key: 'WaitForMoveRequest',
  descriptor: Object.getOwnPropertyDescriptor(
    WindowGridKDEInterface.prototype,
    'WaitForMoveRequest'
  )
});

waitForMoveDescriptor.finisher(WindowGridKDEInterface);

const moveWindowActivityOnlyDescriptor = method({ inSignature: 'ss', outSignature: '' })({
  kind: 'method',
  key: 'MoveWindowToActivityOnly',
  descriptor: Object.getOwnPropertyDescriptor(
    WindowGridKDEInterface.prototype,
    'MoveWindowToActivityOnly'
  )
});

moveWindowActivityOnlyDescriptor.finisher(WindowGridKDEInterface);

const sleepDescriptor = method({ inSignature: 'sss', outSignature: 'ss' })({
  kind: 'method',
  key: 'Sleep',
  descriptor: Object.getOwnPropertyDescriptor(
    WindowGridKDEInterface.prototype,
    'Sleep'
  )
});

sleepDescriptor.finisher(WindowGridKDEInterface);

const moveCurrentDesktopDescriptor = method({ inSignature: 'ss', outSignature: 's' })({
  kind: 'method',
  key: 'MoveCurrentDesktopToActivityAndDesktop',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'MoveCurrentDesktopToActivityAndDesktop')
});
moveCurrentDesktopDescriptor.finisher(WindowGridKDEInterface);

const waitForCurrentDesktopMoveDescriptor = method({ inSignature: '', outSignature: 'sss' })({
  kind: 'method',
  key: 'WaitForCurrentDesktopMoveRequest',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'WaitForCurrentDesktopMoveRequest')
});
waitForCurrentDesktopMoveDescriptor.finisher(WindowGridKDEInterface);

const triggerRestoreLayoutDescriptor = method({ inSignature: '', outSignature: '' })({
  kind: 'method',
  key: 'TriggerRestoreLayout',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'TriggerRestoreLayout')
});
triggerRestoreLayoutDescriptor.finisher(WindowGridKDEInterface);

const waitForRestoreLayoutDescriptor = method({ inSignature: '', outSignature: 's' })({
  kind: 'method',
  key: 'WaitForRestoreLayoutRequest',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'WaitForRestoreLayoutRequest')
});
waitForRestoreLayoutDescriptor.finisher(WindowGridKDEInterface);

const requestWindowCountsDescriptor = method({ inSignature: '', outSignature: '' })({
  kind: 'method',
  key: 'RequestWindowCounts',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'RequestWindowCounts')
});
requestWindowCountsDescriptor.finisher(WindowGridKDEInterface);

const waitForWindowCountsDescriptor = method({ inSignature: '', outSignature: 's' })({
  kind: 'method',
  key: 'WaitForWindowCountsRequest',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'WaitForWindowCountsRequest')
});
waitForWindowCountsDescriptor.finisher(WindowGridKDEInterface);

const receiveWindowCountsDescriptor = method({ inSignature: 's', outSignature: '' })({
  kind: 'method',
  key: 'ReceiveWindowCounts',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'ReceiveWindowCounts')
});
receiveWindowCountsDescriptor.finisher(WindowGridKDEInterface);

const triggerCloseAllDescriptor = method({ inSignature: '', outSignature: '' })({
  kind: 'method',
  key: 'TriggerCloseAll',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'TriggerCloseAll')
});
triggerCloseAllDescriptor.finisher(WindowGridKDEInterface);

const waitForCloseAllDescriptor = method({ inSignature: '', outSignature: 's' })({
  kind: 'method',
  key: 'WaitForCloseAllRequest',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'WaitForCloseAllRequest')
});
waitForCloseAllDescriptor.finisher(WindowGridKDEInterface);

const reorderDesktopContentsDescriptor = method({ inSignature: 'sss', outSignature: 's' })({
  kind: 'method',
  key: 'ReorderDesktopContents',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'ReorderDesktopContents')
});
reorderDesktopContentsDescriptor.finisher(WindowGridKDEInterface);

const waitForDesktopReorderDescriptor = method({ inSignature: '', outSignature: 'ssss' })({
  kind: 'method',
  key: 'WaitForDesktopReorderRequest',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'WaitForDesktopReorderRequest')
});
waitForDesktopReorderDescriptor.finisher(WindowGridKDEInterface);

const toggleWindowDescriptor = method({ inSignature: '', outSignature: '' })({
  kind: 'method',
  key: 'ToggleWindow',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'ToggleWindow')
});
toggleWindowDescriptor.finisher(WindowGridKDEInterface);

const toggleItWorksDescriptor = method({ inSignature: '', outSignature: '' })({
  kind: 'method',
  key: 'ToggleItWorks',
  descriptor: Object.getOwnPropertyDescriptor(WindowGridKDEInterface.prototype, 'ToggleItWorks')
});
toggleItWorksDescriptor.finisher(WindowGridKDEInterface);

const bus = dbus.sessionBus();
const serviceInterface = new WindowGridKDEInterface();

const shutdown = () => {
  console.log('[Window Grid DBus Helper] Shutting down.');
  bus.unexport(OBJECT_PATH, serviceInterface);
  bus.disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bus.on('error', (error) => {
  console.error('[Window Grid DBus Helper] DBus error:', error);
});

try {
  const requestNameReply = await bus.requestName(SERVICE_NAME);

  console.log('[Window Grid DBus Helper] Requested service name:', {
    serviceName: SERVICE_NAME,
    requestNameReply
  });

  bus.export(OBJECT_PATH, serviceInterface);
  console.log('[Window Grid DBus Helper] Listening:', {
    serviceName: SERVICE_NAME,
    objectPath: OBJECT_PATH,
    methods: [
      'SelectWindow(string windowId, string caption, string resourceClass, string desktopIdsCsv)',
      'MoveWindowToDesktop(string windowId, string desktopId)',
      'MoveWindowToActivityAndDesktop(string windowId, string activityId, string desktopId)',
      'MoveWindowToActivityOnly(string windowId, string activityId)',
      'Sleep(string requestId, string windowId, string delayMs) -> (string requestId, string windowId)',
      'WaitForMoveRequest() -> (string windowId, string activityId, string desktopId, string requestId)'
    ]
  });
} catch (error) {
  console.error('[Window Grid DBus Helper] Failed to start:', error);
  process.exit(1);
}
