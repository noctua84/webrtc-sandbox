// stores/SocketStore.ts
import { makeObservable, observable, action, computed, runInAction } from 'mobx';
import { io, Socket } from 'socket.io-client';
import type {
    ClientToServerEvents,
    ServerToClientEvents,
    LogEntry,
    LogLevel,
    ConnectionStatus
} from '@/types';
import { generateId, createTimestamp } from '@/utils';

class SocketStore {
    socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
    isConnected = false;
    isConnecting = false;
    connectionError: string | null = null;
    logs: LogEntry[] = [];
    maxLogs = 200;
    retryAttempts = 0;
    maxRetryAttempts = 5;
    retryDelay = 1000;
    retryTimeout: NodeJS.Timeout | null = null;

    constructor() {
        makeObservable(this, {
            socket: observable.ref,
            isConnected: observable,
            isConnecting: observable,
            connectionError: observable,
            logs: observable,
            retryAttempts: observable,
            connect: action,
            disconnect: action,
            clearLogs: action,
            resetRetry: action,
            connectionStatus: computed
        });
    }

    async connect(serverUrl = 'http://localhost:3001'): Promise<void> {
        if (this.isConnected || this.isConnecting) {
            this.log('warning', 'Already connected or connecting');
            return;
        }

        runInAction(() => {
            this.isConnecting = true;
            this.connectionError = null;
        });

        this.log('info', `Connecting to server (attempt ${this.retryAttempts + 1}/${this.maxRetryAttempts})...`, { serverUrl });

        try {
            this.socket = io(serverUrl, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            // Connection event handlers
            this.socket.on('connect', () => {
                runInAction(() => {
                    this.isConnected = true;
                    this.isConnecting = false;
                    this.connectionError = null;
                });
                this.resetRetry();
                this.log('success', 'Connected to server', { socketId: this.socket?.id });
            });

            this.socket.on('connect_error', (error) => {
                runInAction(() => {
                    this.isConnecting = false;
                    this.connectionError = error.message;
                });
                this.log('error', 'Connection error', { error: error.message });
                this.handleConnectionFailure();
            });

            this.socket.on('disconnect', (reason) => {
                runInAction(() => {
                    this.isConnected = false;
                    this.isConnecting = false;
                });
                this.log('warning', 'Disconnected from server', { reason });

                // Auto-retry if disconnected unexpectedly
                if (reason !== 'io client disconnect') {
                    this.handleConnectionFailure();
                }
            });

            this.socket.on('reconnect', (attemptNumber) => {
                runInAction(() => {
                    this.isConnected = true;
                    this.connectionError = null;
                });
                this.resetRetry();
                this.log('success', 'Reconnected to server', { attemptNumber });
            });

            this.socket.on('reconnect_error', (error) => {
                this.log('error', 'Reconnection error', { error: error.message });
            });

            this.socket.on('error', (data) => {
                this.log('error', 'Server error', { data });
            });

            // Wait for connection with timeout
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 15000);

                if (this.socket) {
                    this.socket.once('connect', () => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    this.socket.once('connect_error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                }
            });

        } catch (error) {
            runInAction(() => {
                this.isConnecting = false;
                this.connectionError = (error as Error).message;
            });
            this.log('error', 'Failed to connect', { error: (error as Error).message });
            this.handleConnectionFailure();
            throw error;
        }
    }

    private handleConnectionFailure(): void {
        if (this.retryAttempts < this.maxRetryAttempts) {
            runInAction(() => {
                this.retryAttempts++;
            });

            const delay = this.retryDelay * Math.pow(2, this.retryAttempts - 1); // Exponential backoff
            this.log('info', `Retrying connection in ${delay}ms...`, {
                attempt: this.retryAttempts,
                maxAttempts: this.maxRetryAttempts
            });

            this.retryTimeout = setTimeout(() => {
                this.connect().catch((error) => {
                    this.log('error', 'Retry connection failed', { error: error.message });
                });
            }, delay);
        } else {
            this.log('error', 'Max retry attempts reached. Connection failed permanently.');
            runInAction(() => {
                this.connectionError = 'Connection failed after maximum retry attempts';
            });
        }
    }

    resetRetry(): void {
        runInAction(() => {
            this.retryAttempts = 0;
        });
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
    }

    disconnect(): void {
        this.resetRetry();

        if (this.socket) {
            this.log('info', 'Disconnecting from server...');
            this.socket.disconnect();
            this.socket = null;
        }

        runInAction(() => {
            this.isConnected = false;
            this.isConnecting = false;
            this.connectionError = null;
        });
    }

    // Enhanced emit method with promise-based callbacks and logging
    async emitWithCallback<T = any>(
        event: keyof ClientToServerEvents,
        data: any
    ): Promise<T> {
        if (!this.socket || !this.isConnected) {
            const error = 'Socket not connected';
            this.log('error', 'Cannot emit: socket not connected', { event, data });
            throw new Error(error);
        }

        this.log('info', `Emitting event: ${String(event)}`, { data });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for response to '${String(event)}'`));
            }, 10000);

            this.socket!.emit(event as any, data, (response: any) => {
                clearTimeout(timeout);

                this.log('info', `Received response for '${String(event)}'`, { response });

                if (response && typeof response === 'object' && 'success' in response) {
                    if (response.success) {
                        resolve(response as T);
                    } else {
                        const error = response.error || `Server error for event '${String(event)}'`;
                        this.log('error', `Event '${String(event)}' failed`, { error, response });
                        reject(new Error(error));
                    }
                } else {
                    resolve(response as T);
                }
            });
        });
    }

    // Register event listener with logging
    on<K extends keyof ServerToClientEvents>(
        event: K,
        handler: ServerToClientEvents[K]
    ): void {
        if (!this.socket) {
            this.log('error', 'Cannot register listener: socket not available', { event });
            return;
        }

        this.log('info', `Registering listener for event: ${String(event)}`);

        const wrappedHandler = (...args: any[]) => {
            this.log('info', `Received event: ${String(event)}`, { args });
            (handler as any)(...args);
        };

        this.socket.on(event as any, wrappedHandler as any);
    }

    // Remove event listener
    off<K extends keyof ServerToClientEvents>(
        event: K,
        handler?: ServerToClientEvents[K]
    ): void {
        if (!this.socket) {
            this.log('warning', 'Cannot remove listener: socket not available', { event });
            return;
        }

        this.log('info', `Removing listener for event: ${String(event)}`);
        this.socket.off(event as any, handler as any);
    }

    // Logging method
    log(level: LogLevel, message: string, data?: any): void {
        const entry: LogEntry = {
            id: generateId(),
            timestamp: createTimestamp(),
            level,
            message,
            data
        };

        runInAction(() => {
            this.logs.push(entry);

            // Keep only the last maxLogs entries
            if (this.logs.length > this.maxLogs) {
                this.logs = this.logs.slice(-this.maxLogs);
            }
        });

        // Also log to console for development
        const logMethod = level === 'error' ? console.error :
            level === 'warning' ? console.warn : console.log;
        logMethod(`[SocketStore] ${message}`, data || '');
    }

    clearLogs(): void {
        runInAction(() => {
            this.logs = [];
        });
        this.log('info', 'Logs cleared');
    }

    get connectionStatus(): ConnectionStatus {
        if (this.isConnecting) return 'connecting';
        if (this.isConnected) return 'connected';
        if (this.connectionError) return 'error';
        return 'disconnected';
    }
}

export const socketStore = new SocketStore();