import {LogData, Logger, LogLevel} from './types/log.types';

/**
 * ServerLogger is a simple logging utility for server-side applications.
 * It provides methods to log messages at different levels (info, success, warning, error)
 * with optional structured data.
 */
export class ServerLogger implements Logger {
    private formatTimestamp(): string {
        return new Date().toISOString();
    }

    private formatMessage(level: LogLevel, message: string): string {
        return `[${this.formatTimestamp()}] [${level.toUpperCase()}] ${message}`;
    }

    private output(level: LogLevel, message: string, data?: LogData): void {
        const formattedMessage = this.formatMessage(level, message);

        // Choose appropriate console method based on log level
        const consoleMethod = this.getConsoleMethod(level);

        if (data && Object.keys(data).length > 0) {
            consoleMethod(formattedMessage, JSON.stringify(data, null, 2));
        } else {
            consoleMethod(formattedMessage);
        }
    }

    private getConsoleMethod(level: LogLevel): (...args: any[]) => void {
        switch (level) {
            case 'error':
                return console.error;
            case 'warning':
                return console.warn;
            case 'success':
            case 'info':
            default:
                return console.log;
        }
    }

    // Individual level methods for convenience
    info(message: string, data?: LogData): void {
        this.output('info', message, data);
    }

    success(message: string, data?: LogData): void {
        this.output('success', message, data);
    }

    warning(message: string, data?: LogData): void {
        this.output('warning', message, data);
    }

    error(message: string, data?: LogData): void {
        this.output('error', message, data);
    }

    // Generic log method (main interface for DI)
    log(level: LogLevel, message: string, data?: LogData): void {
        this.output(level, message, data);
    }
}
