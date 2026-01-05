export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

const shouldLog = (level: LogLevel): boolean => {
    return levels[level] >= levels[currentLevel];
};

export const logger = {
    debug: (message: string, ...args: any[]) => {
        if (shouldLog('debug')) {
            // eslint-disable-next-line no-console
            console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
        }
    },
    info: (message: string, ...args: any[]) => {
        if (shouldLog('info')) {
            // eslint-disable-next-line no-console
            console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
        }
    },
    warn: (message: string, ...args: any[]) => {
        if (shouldLog('warn')) {
            // eslint-disable-next-line no-console
            console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
        }
    },
    error: (message: string, ...args: any[]) => {
        if (shouldLog('error')) {
            // eslint-disable-next-line no-console
            console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
        }
    },
};
