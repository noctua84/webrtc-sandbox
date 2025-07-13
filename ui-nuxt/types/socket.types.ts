export type SocketConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface UseSocketOptions {
    autoConnect?: boolean
    url?: string
}