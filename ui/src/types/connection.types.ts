export interface ErrorResponse {
    success: false;
    error: string;
}

// Connection status types
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

// Reconnection data for localStorage
export interface ReconnectionData {
    roomId: string;
    reconnectionToken: string;
    userName: string;
    timestamp: number;
}
