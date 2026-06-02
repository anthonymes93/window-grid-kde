import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dbus = require('dbus-next');

const { Interface, method } = dbus.interface;

const SERVICE_NAME = 'com.anthony.WindowGridKDE';
const OBJECT_PATH = '/WindowGridKDE';
const ELECTRON_ENDPOINT = 'http://127.0.0.1:48745/kwin/window';

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
    method: 'SelectWindow(string windowId, string caption, string resourceClass, string desktopIdsCsv)'
  });
} catch (error) {
  console.error('[Window Grid DBus Helper] Failed to start:', error);
  process.exit(1);
}
