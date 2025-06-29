import { makeAutoObservable, runInAction } from 'mobx';
import { io, Socket } from 'socket.io-client';
import type {
    LogLevel,
    LogEntry,
    LogData,
    ConnectionStatus,
    ServerToClientEvents,
    ClientToServerEvents,
    ApiResponse
} from '../types';

class SocketStore {
    socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
    isConnected: boolean = false;
    isConnecting: boolean = false;
    connectionError: string | null = null;
    logs: LogEntry[] = [];

    constructor() {
        makeAutoObservable(this);
        this.connect();
    }

    // Detailed logging function
    log(level: LogLevel, message: string, data: LogData | null = null): void {
        const timestamp = new Date().toISOString();
        const logEntry: LogEntry = {
            id: Date.now() + Math.random(),
            timestamp,
            level,
            message,
            data: data ? JSON.stringify(data, null, 2) : null
        };

        runInAction(() => {
            this.logs.push(logEntry);
            // Keep only last 100 logs to prevent memory issues
            if (this.logs.length > 100) {
                this.logs = this.logs.slice(-100);
            }
        });

        // Also log to console for debugging
        const consoleMessage = `[SOCKET] [${level.toUpperCase()}] ${message}`;
        if (data) {
            console.log(consoleMessage, data);
        } else {
            console.log(consoleMessage);
        }
    }

    connect(): void {
        if (this.socket) {
            this.log('warning', 'Socket already exists, disconnecting first');
            this.disconnect();
        }

        runInAction(() => {
            this.isConnecting = true;
            this.connectionError = null;
        });

        this.log('info', 'Attempting to connect to signaling server', {
            serverUrl: 'http://localhost:3001'
        });

        try {
            this.socket = io('http://localhost:3001', {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });

            this.setupSocketListeners();

        } catch (error) {
            const err = error as Error;
            this.log('error', 'Failed to create socket connection', {
                error: err.message,
                stack: err.stack
            });

            runInAction(() => {
                this.isConnecting = false;
                this.connectionError = err.message;
            });
        }
    }

    private setupSocketListeners(): void {
        if (!this.socket) {
            this.log('error', 'Cannot setup listeners: socket is null');
            return;
        }

        this.log('info', 'Setting up socket event listeners');

        // Connection events
        this.socket.on('connect', () => {
            this.log('success', 'Successfully connected to signaling server', {
                socketId: this.socket?.id
            });

            runInAction(() => {
                this.isConnected = true;
                this.isConnecting = false;
                this.connectionError = null;
            });
        });

        this.socket.on('disconnect', (reason) => {
            this.log('warning', 'Disconnected from signaling server', {
                reason,
                socketId: this.socket?.id
            });

            runInAction(() => {
                this.isConnected = false;
                this.isConnecting = false;
            });
        });

        this.socket.on('connect_error', (error: Error) => {
            this.log('error', 'Connection error', {
                error: error.message,
                description: (error as any).description,
                context: (error as any).context,
                type: (error as any).type
            });

            runInAction(() => {
                this.isConnected = false;
                this.isConnecting = false;
                this.connectionError = error.message || 'Connection failed';
            });
        });

        /**
        this.socket.on('reconnect', (attemptNumber: number) => {
            this.log('success', 'Reconnected to signaling server', {
                attemptNumber,
                socketId: this.socket?.id
            });
        });

        this.socket.on('reconnect_attempt', (attemptNumber: number) => {
            this.log('info', 'Attempting to reconnect', { attemptNumber });

            runInAction(() => {
                this.isConnecting = true;
            });
        });

        this.socket.on('reconnect_error', (error: Error) => {
            this.log('error', 'Reconnection failed', {
                error: error.message,
                attemptNumber: (error as any).attemptNumber
            });
        });

        this.socket.on('reconnect_failed', () => {
            this.log('error', 'All reconnection attempts failed');

            runInAction(() => {
                this.isConnecting = false;
                this.connectionError = 'Failed to reconnect after multiple attempts';
            });
        });

        // Generic error handler
        this.socket.on('error', (error: Error) => {
            this.log('error', 'Socket error', { error: error.message });
        });
        */

        this.log('info', 'Socket event listeners configured successfully');
    }

    disconnect(): void {
        if (this.socket) {
            this.log('info', 'Disconnecting from signaling server', {
                socketId: this.socket.id
            });

            this.socket.disconnect();
            this.socket = null;

            runInAction(() => {
                this.isConnected = false;
                this.isConnecting = false;
                this.connectionError = null;
            });
        }
    }

    // Utility method to emit events with logging and error handling
    emitWithCallback<T extends { success: true }>(event: keyof ClientToServerEvents, data: any, timeoutMs: number = 10000): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.isConnected) {
                const error = 'Cannot emit: socket not connected';
                this.log('error', error, { event, data });
                reject(new Error(error));
                return;
            }

            this.log('info', `Emitting event: ${String(event)}`, { data, timeoutMs });

            // Set up timeout
            const timeout = setTimeout(() => {
                const error = `Event '${String(event)}' timed out after ${timeoutMs}ms`;
                this.log('error', error, { event, data });
                reject(new Error(error));
            }, timeoutMs);

            // Emit with callback
            (this.socket as any).emit(event, data, (response: ApiResponse<T>) => {
                clearTimeout(timeout);

                this.log('info', `Received response for event: ${String(event)}`, {
                    response,
                    success: response?.success
                });

                if (response?.success) {
                    resolve(response as T);
                } else {
                    const error = (response as any)?.error || 'Unknown error occurred';
                    this.log('error', `Event '${String(event)}' failed`, { error, response });
                    reject(new Error(error));
                }
            });
        });
    }

    // Utility method to emit events without expecting a callback
    emit(event: keyof ClientToServerEvents, data: any): boolean {
        if (!this.socket || !this.isConnected) {
            this.log('error', 'Cannot emit: socket not connected', { event, data });
            return false;
        }

        this.log('info', `Emitting event (no callback): ${String(event)}`, { data });
        this.socket.emit(event as any, data);
        return true;
    }

    // Register event listener with logging
    on<K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]): void {
        if (!this.socket) {
            this.log('error', 'Cannot register listener: socket not available', { event });
            return;
        }

        this.log('info', `Registering listener for event: ${String(event)}`);

        const wrappedHandler = (...args: any[]) => {
            this.log('info', `Received event: ${String(event)}`, { args });
            (handler as any)(...args);
        };

        this.socket.on(event, wrappedHandler as any);
    }

    // Remove event listener with logging
    off<K extends keyof ServerToClientEvents>(event: K, handler?: ServerToClientEvents[K]): void {
        if (!this.socket) {
            this.log('warning', 'Cannot remove listener: socket not available', { event });
            return;
        }

        this.log('info', `Removing listener for event: ${String(event)}`);
        this.socket.off(event, handler as any);
    }

    // Clear logs
    clearLogs(): void {
        runInAction(() => {
            this.logs = [];
        });
        this.log('info', 'Logs cleared');
    }

    // Get connection status
    get connectionStatus(): ConnectionStatus {
        if (this.isConnecting) return 'connecting';
        if (this.isConnected) return 'connected';
        if (this.connectionError) return 'error';
        return 'disconnected';
    }
}

export default new SocketStore();