import {LogData, LogLevel} from "./types/log.types";

export const log = (level: LogLevel, message: string, data: LogData | null = null): void => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (data) {
        console.log(logMessage, JSON.stringify(data, null, 2));
    } else {
        console.log(logMessage);
    }
}