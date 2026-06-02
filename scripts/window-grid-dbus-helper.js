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
      `[Window Grid DBus Helper] Delivering move request to KWin (queue before=${queueLengthBefore}, after=${queueLengthAfter}):`,
      moveRequest
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
    console.log('[Window Grid DBus Helper] MoveWindowToActivityAndDesktop called:', {
      requestId,
      windowId,
      activityId,
      desktopId,
      queueLengthBefore: pendingMoveRequests.length
    });

    pendingMoveRequests.push({ windowId, activityId, desktopId, requestId });
    console.log('[Window Grid DBus Helper] Queue length after push:', pendingMoveRequests.length);
    notifyMoveWaiters();
  }

  WaitForMoveRequest() {
    if (pendingMoveRequests.length > 0) {
      const queueLengthBefore = pendingMoveRequests.length;
      const moveRequest = pendingMoveRequests.shift();
      console.log(
        `[Window Grid DBus Helper] KWin immediately took move request (queue before=${queueLengthBefore}, after=${pendingMoveRequests.length}):`,
        moveRequest
      );
      return [moveRequest.windowId, moveRequest.activityId ?? '', moveRequest.desktopId, moveRequest.requestId];
    }

    console.log('[Window Grid DBus Helper] KWin waiting for next move request. Queue length:', pendingMoveRequests.length);

    return new Promise((resolve) => {
      const waiter = {
        resolve,
        timeoutId: null
      };

      waiter.timeoutId = setTimeout(() => {
        const waiterIndex = pendingMoveWaiters.indexOf(waiter);

        if (waiterIndex >= 0) {
          pendingMoveWaiters.splice(waiterIndex, 1);
        }

        console.log('[Window Grid DBus Helper] KWin move wait timed out; returning empty request.');
        resolve(['', '', '', '']);
      }, MOVE_WAIT_TIMEOUT_MS);

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

const moveWindowActivityDesktopDescriptor = method({ inSignature: 'sss', outSignature: '' })({
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
      'WaitForMoveRequest() -> (string windowId, string activityId, string desktopId)'
    ]
  });
} catch (error) {
  console.error('[Window Grid DBus Helper] Failed to start:', error);
  process.exit(1);
}
