import {parentPort} from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = message => parentPort.postMessage(message);
await import('../../lib/fishing-catch.worker.ts');
parentPort.on('message', data => globalThis.onmessage({data}));
