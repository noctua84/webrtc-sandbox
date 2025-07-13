export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export interface LogEntry {
    id: number
    timestamp: string
    level: LogLevel
    message: string
    data?: string | null
}

export type LogData = Record<string, any>