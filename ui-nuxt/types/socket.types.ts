export type SocketConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface UseSocketOptions {
    autoConnect?: boolean
    url?: string
}

export interface SocketResponse<T = any> {
    success: boolean
    data?: T
    error?: string
    message?: T
}