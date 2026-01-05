"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const levels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const currentLevel = process.env.LOG_LEVEL || 'info';
const shouldLog = (level) => {
    return levels[level] >= levels[currentLevel];
};
exports.logger = {
    debug: (message, ...args) => {
        if (shouldLog('debug')) {
            // eslint-disable-next-line no-console
            console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
        }
    },
    info: (message, ...args) => {
        if (shouldLog('info')) {
            // eslint-disable-next-line no-console
            console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
        }
    },
    warn: (message, ...args) => {
        if (shouldLog('warn')) {
            // eslint-disable-next-line no-console
            console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
        }
    },
    error: (message, ...args) => {
        if (shouldLog('error')) {
            // eslint-disable-next-line no-console
            console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
        }
    },
};
