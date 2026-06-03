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
