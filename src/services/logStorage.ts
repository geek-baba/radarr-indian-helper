// Simple in-memory log storage for displaying logs in UI
interface LogEntry {
  timestamp: Date;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
}

const MAX_LOGS = 1000;
const logs: LogEntry[] = [];

// Override console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

function addLog(level: LogEntry['level'], ...args: any[]) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  logs.push({
    timestamp: new Date(),
    level,
    message,
  });

  // Keep only the last MAX_LOGS entries
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

console.log = (...args: any[]) => {
  addLog('log', ...args);
  originalConsoleLog(...args);
};

console.error = (...args: any[]) => {
  addLog('error', ...args);
  originalConsoleError(...args);
};

console.warn = (...args: any[]) => {
  addLog('warn', ...args);
  originalConsoleWarn(...args);
};

console.info = (...args: any[]) => {
  addLog('info', ...args);
  originalConsoleInfo(...args);
};

export const logStorage = {
  getLogs: (limit: number = 500): LogEntry[] => {
    return logs.slice(-limit).reverse(); // Most recent first
  },

  getLogsByFilter: (filter: string, limit: number = 500): LogEntry[] => {
    const lowerFilter = filter.toLowerCase();
    // Filter all logs, then take the last N (most recent), then reverse to show newest first
    const filtered = logs.filter(log => log.message.toLowerCase().includes(lowerFilter));
    return filtered.slice(-limit).reverse();
  },

  clear: (): void => {
    logs.length = 0;
  },

  getCount: (): number => {
    return logs.length;
  },
};

