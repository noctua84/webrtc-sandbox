export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
    id: string | number;
    timestamp: string;
    level: LogLevel;
    message: string;
    data: string | null;
}

export interface LogData {
    [key: string]: any;
}