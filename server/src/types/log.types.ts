export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogData {
    [key: string]: any;
}

export interface Logger {
    info(message: string, data?: LogData): void;
    success(message: string, data?: LogData): void;
    warning(message: string, data?: LogData): void;
    error(message: string, data?: LogData): void;
    log(level: LogLevel, message: string, data?: LogData): void;
}