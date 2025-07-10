// ============================================================================
// CONNECTION TYPES
// ============================================================================

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T = any> {
    success: boolean
    data?: T
    error?: string
}

// ============================================================================
// LOGGING TYPES
// ============================================================================

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export interface LogEntry {
    id: number
    timestamp: string
    level: LogLevel
    message: string
    data?: string | null
}

export type LogData = Record<string, any>