// composables/useSocket.ts
import { io, Socket } from 'socket.io-client'
import { ref, computed, readonly } from 'vue'
import { useRuntimeConfig } from '#imports'
import type {ConnectionStatus, LogEntry, LogLevel, LogData} from "../types";

const createLogEntry = (level: LogLevel, message: string, data?: LogData): LogEntry => ({
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    level,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
})

export const useSocket = () => {
    const config = useRuntimeConfig()

    let socket: Socket | null = null
    const connectionStatus = ref<ConnectionStatus>('disconnected')
    const connectionError = ref<string | null>(null)
    const logs = ref<LogEntry[]>([])
    const isConnecting = ref(false)

    const addLog = (level: LogLevel, message: string, data?: LogData) => {
        const entry = createLogEntry(level, message, data)
        logs.value.push(entry)

        // Keep only last 1000 logs
        if (logs.value.length > 1000) {
            logs.value = logs.value.slice(-1000)
        }
    }

    const connect = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (socket?.connected) {
                addLog('info', 'Socket already connected')
                resolve()
                return
            }

            isConnecting.value = true
            connectionStatus.value = 'connecting'
            connectionError.value = null

            addLog('info', 'Attempting to connect to server', {
                serverUrl: config.public.serverUrl
            })

            const serverUrl = config?.public?.serverUrl as string || 'http://localhost:3001'

            socket = io(serverUrl , {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            })

            socket.on('connect', () => {
                isConnecting.value = false
                connectionStatus.value = 'connected'
                connectionError.value = null

                addLog('success', 'Connected to server', { socketId: socket?.id })
                resolve()
            })

            socket.on('connect_error', (error) => {
                isConnecting.value = false
                connectionStatus.value = 'error'
                connectionError.value = error.message

                addLog('error', 'Connection failed', { error: error.message })
                reject(error)
            })

            socket.on('disconnect', (reason) => {
                connectionStatus.value = 'disconnected'
                addLog('warning', 'Disconnected from server', { reason })
            })

            socket.on('reconnect', (attemptNumber) => {
                connectionStatus.value = 'connected'
                connectionError.value = null
                addLog('success', 'Reconnected to server', { attempt: attemptNumber })
            })

            socket.on('reconnect_error', (error) => {
                addLog('error', 'Reconnection failed', { error: error.message })
            })

            socket.on('reconnect_failed', () => {
                connectionStatus.value = 'error'
                connectionError.value = 'Failed to reconnect after multiple attempts'
                addLog('error', 'Reconnection failed permanently')
            })
        })
    }

    const disconnect = () => {
        if (socket) {
            addLog('info', 'Disconnecting from server')
            socket.disconnect()
            socket = null
        }
        connectionStatus.value = 'disconnected'
        connectionError.value = null
    }

    const emit = <T = any>(event: string, data?: any): Promise<T> => {
        return new Promise((resolve, reject) => {
            if (!socket?.connected) {
                const error = 'Socket not connected'
                addLog('error', `Failed to emit ${event}: ${error}`, { event, data })
                reject(new Error(error))
                return
            }

            addLog('info', `Emitting ${event}`, { event, data })

            socket.emit(event, data, (response: any) => {
                addLog('info', `Response for ${event}`, { event, response })

                if (response?.success === false) {
                    reject(new Error(response.error || 'Unknown error'))
                } else {
                    resolve(response)
                }
            })
        })
    }

    const on = (event: string, handler: (...args: any[]) => void) => {
        if (socket) {
            socket.on(event, (...args) => {
                addLog('info', `Received ${event}`, { event, args })
                handler(...args)
            })
        }
    }

    const off = (event: string, handler?: (...args: any[]) => void) => {
        if (socket) {
            socket.off(event, handler)
        }
    }

    // Computed properties
    const isConnected = computed(() => connectionStatus.value === 'connected')
    const hasError = computed(() => connectionStatus.value === 'error')

    return {
        socket: readonly(ref(socket)),
        connectionStatus: readonly(connectionStatus),
        connectionError: readonly(connectionError),
        logs: readonly(logs),
        isConnecting: readonly(isConnecting),
        isConnected,
        hasError,
        connect,
        disconnect,
        emit,
        on,
        off,
        addLog
    }
}