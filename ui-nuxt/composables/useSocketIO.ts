import {io, type Socket} from "socket.io-client";
import type {LogData, LogEntry, LogLevel} from "~/types/logging.types";
import type {SocketConnectionStatus, SocketResponse, UseSocketOptions} from "~/types/socket.types";

const globalSocketState = {
    socket: null as Socket | null,
    isConnected: ref(false),
    isConnecting: ref(false),
    connectionError: ref<string | null>(null),
    initialized: false,
    pendingListeners: [] as Array<{ event: string, handler: (...args: any[]) => void }>,
    logs: ref<LogEntry[]>([]),
}

const createLogEntry = (level: LogLevel, message: string, data?: LogData): LogEntry => ({
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    level,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
})

export const useSocketIO = (options: UseSocketOptions = {}) => {
    const config = useRuntimeConfig()
    const url = options.url || config?.public?.socketServerUrl as string || 'http://localhost:3001'
    const autoConnect = options.autoConnect || config?.public?.socketAutoConnect

    // Simple logging
    const addLog = (level: LogLevel, message: string, data?: LogData) => {
        const entry = createLogEntry(level, message, data)
        globalSocketState.logs.value.push(entry)

        if (globalSocketState.logs.value.length > 1000) {
            globalSocketState.logs.value = globalSocketState.logs.value.slice(-1000)
        }

        const color = {
            error: '#ef4444',
            warning: '#f59e0b',
            success: '#10b981',
            info: '#3b82f6'
        }[level] || '#6b7280'

        const consoleMessage = `[SOCKET] [${level.toUpperCase()}] ${message}`
        if (data) {
            console.log(`%c${consoleMessage}`, `color: ${color}`, data)
        } else {
            console.log(`%c${consoleMessage}`, `color: ${color}`)
        }
    }

    // Socket readiness check
    const isSocketReady = (): boolean => {
        return !!(
            globalSocketState.socket &&
            globalSocketState.socket.connected &&
            globalSocketState.socket.id &&
            globalSocketState.isConnected.value
        )
    }

    // Wait for socket readiness
    const waitForSocketReady = (timeoutMs: number = 5000): Promise<void> => {
        return new Promise((resolve, reject) => {
            const startTime = Date.now()

            const checkReady = () => {
                if (isSocketReady()) {
                    resolve()
                    return
                }

                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error(`Socket readiness timeout after ${timeoutMs}ms`))
                    return
                }

                setTimeout(checkReady, 100)
            }

            checkReady()
        })
    }

    // Register pending listeners
    const registerPendingListeners = () => {
        if (!globalSocketState.socket || globalSocketState.pendingListeners.length === 0) return

        addLog('info', `Registering ${globalSocketState.pendingListeners.length} pending listeners`)

        globalSocketState.pendingListeners.forEach(({ event, handler }) => {
            const wrappedHandler = (...args: any[]) => {
                addLog('info', `Received event: ${event}`, { args })
                handler(...args)
            }

            globalSocketState.socket!.on(event, wrappedHandler)
        })

        globalSocketState.pendingListeners.length = 0
        addLog('success', 'All pending listeners registered')
    }

    // Core connection method
    const connect = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (import.meta.server) {
                reject(new Error('Cannot connect on server side'))
                return
            }

            if (globalSocketState.socket?.connected) {
                globalSocketState.isConnected.value = true
                registerPendingListeners()
                resolve()
                return
            }

            if (globalSocketState.isConnecting.value) {
                waitForSocketReady(10000).then(resolve).catch(reject)
                return
            }

            globalSocketState.isConnecting.value = true
            globalSocketState.connectionError.value = null

            addLog('info', `Connecting to ${url}...`)

            // Clean up existing socket
            if (globalSocketState.socket) {
                globalSocketState.socket.removeAllListeners()
                globalSocketState.socket.disconnect()
            }

            try {
                globalSocketState.socket = io(url, {
                    transports: ['websocket', 'polling'],
                    timeout: 10000,
                    reconnection: true,
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                    forceNew: true
                })

                // Connection events
                globalSocketState.socket.on('connect', () => {
                    globalSocketState.isConnected.value = true
                    globalSocketState.isConnecting.value = false
                    globalSocketState.connectionError.value = null
                    globalSocketState.initialized = true

                    addLog('success', 'Connected to server', {
                        socketId: globalSocketState.socket?.id,
                        transport: globalSocketState.socket?.io?.engine?.transport?.name
                    })

                    registerPendingListeners()

                    setTimeout(() => {
                        if (isSocketReady()) {
                            resolve()
                        } else {
                            waitForSocketReady(2000).then(resolve).catch(reject)
                        }
                    }, 100)
                })

                globalSocketState.socket.on('disconnect', (reason) => {
                    globalSocketState.isConnected.value = false
                    addLog('warning', 'Disconnected from server', { reason })
                })

                globalSocketState.socket.on('connect_error', (error) => {
                    globalSocketState.isConnecting.value = false
                    globalSocketState.connectionError.value = error.message
                    addLog('error', 'Connection failed', { error: error.message })
                    reject(error)
                })

                globalSocketState.socket.on('reconnect', (attemptNumber) => {
                    globalSocketState.isConnected.value = true
                    globalSocketState.connectionError.value = null
                    addLog('success', 'Reconnected to server', { attempt: attemptNumber })
                    registerPendingListeners()
                })

            } catch (error) {
                globalSocketState.isConnecting.value = false
                globalSocketState.connectionError.value = (error as Error).message
                addLog('error', 'Failed to create socket connection', { error: (error as Error).message })
                reject(error)
            }
        })
    }

    // Disconnect
    const disconnect = () => {
        if (globalSocketState.socket) {
            addLog('info', 'Disconnecting from server')
            globalSocketState.socket.removeAllListeners()
            globalSocketState.socket.disconnect()
            globalSocketState.socket = null
            globalSocketState.initialized = false
        }

        globalSocketState.isConnected.value = false
        globalSocketState.isConnecting.value = false
        globalSocketState.connectionError.value = null
    }

    // Core emit method - just communication
    const emit = <T = any>(event: string, data?: any, timeoutMs: number = 15000): Promise<SocketResponse<T>> => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!globalSocketState.initialized || !globalSocketState.socket) {
                    await connect()
                }
                await waitForSocketReady(5000)
            } catch (error) {
                addLog('error', 'Socket not ready for emit', { event, error: (error as Error).message })
                reject(error)
                return
            }

            if (!isSocketReady()) {
                const error = `Cannot emit ${event}: socket not ready`
                addLog('error', error, { event, data })
                reject(new Error(error))
                return
            }

            addLog('info', `Emitting ${event}`, { event, data })

            const timeout = setTimeout(() => {
                const error = `Event '${event}' timed out after ${timeoutMs}ms`
                addLog('error', error, { event, data })
                reject(new Error(error))
            }, timeoutMs)

            globalSocketState.socket!.emit(event, data, (response: any) => {
                clearTimeout(timeout)

                addLog('info', `Response for ${event}`, { event, response })

                if (response === undefined || response === null) {
                    const error = `No response received for event '${event}'`
                    addLog('error', error, { event, data })
                    reject(new Error(error))
                    return
                }

                if (typeof response !== 'object') {
                    const error = `Invalid response format for '${event}': expected object, got ${typeof response}`
                    addLog('error', error, { event, data, response })
                    reject(new Error(error))
                    return
                }

                if ('success' in response) {
                    if (response.success === true) {
                        addLog('success', `Event '${event}' completed successfully`)
                        resolve(response)
                    } else {
                        const error = response.error || `Server error for event '${event}'`
                        addLog('error', `Event '${event}' failed`, { error, response })
                        reject(new Error(error))
                    }
                } else {
                    resolve(response)
                }
            })
        })
    }

    // Event listener registration with queueing
    const on = (event: string, handler: (...args: any[]) => void) => {
        if (globalSocketState.socket && globalSocketState.initialized) {
            addLog('info', `Registering listener for event: ${event}`)
            const wrappedHandler = (...args: any[]) => {
                addLog('info', `Received event: ${event}`, { args })
                handler(...args)
            }
            globalSocketState.socket.on(event, wrappedHandler)
        } else {
            addLog('info', `Queueing listener for event: ${event} (socket not ready)`)
            globalSocketState.pendingListeners.push({ event, handler })
        }
    }

    // Remove event listener
    const off = (event: string, handler?: (...args: any[]) => void) => {
        if (globalSocketState.socket) {
            globalSocketState.socket.off(event, handler)
        } else {
            const index = globalSocketState.pendingListeners.findIndex(l => l.event === event && l.handler === handler)
            if (index > -1) {
                globalSocketState.pendingListeners.splice(index, 1)
            }
        }
    }

    // Initialize
    const initialize = async () => {
        if (globalSocketState.initialized) return

        addLog('info', 'Initializing socket connection...')

        if (autoConnect && !process.server) {
            try {
                await connect()
            } catch (error) {
                addLog('error', 'Auto-connection failed', { error: (error as Error).message })
                throw error
            }
        }

        globalSocketState.initialized = true
    }

    // Utility methods
    const clearLogs = () => {
        globalSocketState.logs.value = []
        addLog('info', 'Logs cleared')
    }

    const getDebugInfo = () => {
        return {
            isConnected: globalSocketState.isConnected.value,
            isConnecting: globalSocketState.isConnecting.value,
            connectionError: globalSocketState.connectionError.value,
            isInitialized: globalSocketState.initialized,
            socketExists: !!globalSocketState.socket,
            socketConnected: globalSocketState.socket?.connected,
            socketId: globalSocketState.socket?.id,
            transportName: globalSocketState.socket?.io?.engine?.transport?.name,
            isSocketReady: isSocketReady(),
            pendingListeners: globalSocketState.pendingListeners.length
        }
    }

    // Computed connection status
    const connectionStatus = computed<SocketConnectionStatus>(() => {
        if (globalSocketState.isConnecting.value) return 'connecting'
        if (globalSocketState.isConnected.value) return 'connected'
        if (globalSocketState.connectionError.value) return 'error'
        return 'disconnected'
    })

    return {
        // Connection state (readonly)
        isConnected: readonly(globalSocketState.isConnected),
        isConnecting: readonly(globalSocketState.isConnecting),
        connectionError: readonly(globalSocketState.connectionError),
        connectionStatus: readonly(connectionStatus),
        logs: readonly(globalSocketState.logs),

        // Core communication methods
        connect,
        disconnect,
        emit,
        on,
        off,
        initialize,

        // Utilities
        clearLogs,
        addLog,
        getDebugInfo,
        isSocketReady,
        waitForSocketReady
    }
}