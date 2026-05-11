import { appendFileSync } from 'node:fs';
import { format } from 'node:util';

function installRunLogger(logFilePath, consoleObject = console) {
  const original = {
    log: consoleObject.log.bind(consoleObject),
    warn: consoleObject.warn.bind(consoleObject),
    error: consoleObject.error.bind(consoleObject),
  };

  const tee = (originalFn) => (...args) => {
    originalFn(...args);
    try {
      appendFileSync(logFilePath, formatLogEntry(args));
    } catch {
      // A logging failure must not interrupt the backup.
    }
  };

  consoleObject.log = tee(original.log);
  consoleObject.warn = tee(original.warn);
  consoleObject.error = tee(original.error);

  return {
    restore() {
      consoleObject.log = original.log;
      consoleObject.warn = original.warn;
      consoleObject.error = original.error;
    },
  };
}

function formatLogEntry(args) {
  const timestamp = new Date().toISOString();
  const message = format(...args);
  return message
    .split('\n')
    .map((line) => `${timestamp} ${line}`)
    .join('\n') + '\n';
}

export { formatLogEntry, installRunLogger };
