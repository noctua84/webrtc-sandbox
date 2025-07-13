// stores/chat.ts - Chat business logic separation
import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { useSocketIO } from '~/composables/useSocketIO'
import { useRoomStore } from '~/stores/room.store'
import type {
    ChatMessage,
    SendMessageRequest,
    SendMessageResponse,
    EditMessageRequest,
    DeleteMessageRequest,
    TypingIndicatorRequest,
    ChatError
} from '~/types/chat.types'

export const useChatStore = defineStore('chat', () => {
    // Chat-specific state
    const messages = ref<ChatMessage[]>([])
    const chatError = ref<ChatError | null>(null)
    const isTyping = ref<string[]>([]) // Array of user names who are typing
    const isSendingMessage = ref(false)
    const isInitialized = ref(false)

    // Get dependencies
    const socketStore = useSocketIO()
    const roomStore = useRoomStore()

    // Utility functions
    const setChatError = (message: string, code?: string) => {
        chatError.value = {
            message,
            code,
            timestamp: new Date().toISOString()
        }
        socketStore.addLog('error', `[CHAT] ${message}`, { code })
    }

    const clearChatError = () => {
        chatError.value = null
    }

    const debugLog = (message: string, data?: any) => {
        if (process.env.NODE_ENV === 'development') {
            socketStore.addLog('info', `[CHAT] ${message}`, data)
        }
    }

    // Socket event handlers
    const handleNewMessage = (message: ChatMessage) => {
        debugLog('New message received', { messageId: message.id, sender: message.senderName })

        // Add message to local state
        messages.value.push(message)

        // Remove typing indicator for sender
        const typingIndex = isTyping.value.indexOf(message.senderName)
        if (typingIndex > -1) {
            isTyping.value.splice(typingIndex, 1)
        }

        // Sort messages by timestamp to ensure correct order
        messages.value.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }

    const handleMessageEdited = (editedMessage: ChatMessage) => {
        debugLog('Message edited', { messageId: editedMessage.id })

        const index = messages.value.findIndex(m => m.id === editedMessage.id)
        if (index > -1) {
            messages.value[index] = editedMessage
        }
    }

    const handleMessageDeleted = (messageId: string) => {
        debugLog('Message deleted', { messageId })

        const index = messages.value.findIndex(m => m.id === messageId)
        if (index > -1) {
            messages.value.splice(index, 1)
        }
    }

    const handleTypingIndicator = (data: { userName: string; isTyping: boolean }) => {
        debugLog('Typing indicator', data)

        const { userName, isTyping: userIsTyping } = data
        const currentIndex = isTyping.value.indexOf(userName)

        if (userIsTyping && currentIndex === -1) {
            isTyping.value.push(userName)
        } else if (!userIsTyping && currentIndex > -1) {
            isTyping.value.splice(currentIndex, 1)
        }
    }

    const handleChatHistory = (historyMessages: ChatMessage[]) => {
        debugLog('Chat history received', { messageCount: historyMessages.length })
        messages.value = historyMessages.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
    }

    // Initialize chat store
    const initializeChat = async () => {
        if (isInitialized.value) {
            debugLog('Chat already initialized')
            return
        }

        debugLog('Initializing chat event listeners')

        try {
            // Register chat-specific event listeners
            socketStore.on('chat-message', handleNewMessage)
            socketStore.on('message-edited', handleMessageEdited)
            socketStore.on('message-deleted', handleMessageDeleted)
            socketStore.on('typing-indicator', handleTypingIndicator)
            socketStore.on('chat-history', handleChatHistory)

            isInitialized.value = true
            debugLog('Chat store initialized successfully')

        } catch (error) {
            debugLog('Failed to initialize chat', error)
            setChatError('Failed to initialize chat', 'CHAT_INIT_FAILED')
            throw error
        }
    }

    // Business logic methods
    const sendMessage = async (content: string, type: 'text' | 'emoji' = 'text'): Promise<void> => {
        if (!content.trim()) {
            const error = 'Message content cannot be empty'
            setChatError(error, 'VALIDATION_ERROR')
            throw new Error(error)
        }

        if (!roomStore.currentRoom) {
            const error = 'Must be in a room to send messages'
            setChatError(error, 'NO_ROOM_ERROR')
            throw new Error(error)
        }

        if (!isInitialized.value) {
            await initializeChat()
        }

        isSendingMessage.value = true
        clearChatError()

        debugLog('Sending message', { content, type, roomId: roomStore.currentRoom.id })

        try {
            const request: SendMessageRequest = {
                roomId: roomStore.currentRoom.id,
                content: content.trim(),
                type
            }

            const response = await socketStore.emit<SendMessageResponse>('send-message', request)

            if (response.success) {
                debugLog('Message sent successfully', { messageId: response.message.id })
                // Message will be added via socket event
            } else {
                throw new Error(response.error || 'Failed to send message')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setChatError(`Failed to send message: ${errorMessage}`, 'SEND_MESSAGE_FAILED')
            throw error
        } finally {
            isSendingMessage.value = false
        }
    }

    const editMessage = async (messageId: string, newContent: string): Promise<void> => {
        if (!newContent.trim()) {
            const error = 'Message content cannot be empty'
            setChatError(error, 'VALIDATION_ERROR')
            throw new Error(error)
        }

        if (!roomStore.currentRoom) {
            const error = 'Must be in a room to edit messages'
            setChatError(error, 'NO_ROOM_ERROR')
            throw new Error(error)
        }

        debugLog('Editing message', { messageId, newContent })

        try {
            const request: EditMessageRequest = {
                messageId,
                roomId: roomStore.currentRoom.id,
                newContent: newContent.trim()
            }

            const response = await socketStore.emit('edit-message', request)

            if (response.success) {
                debugLog('Message edited successfully', { messageId })
                // Message will be updated via socket event
            } else {
                throw new Error(response.error || 'Failed to edit message')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setChatError(`Failed to edit message: ${errorMessage}`, 'EDIT_MESSAGE_FAILED')
            throw error
        }
    }

    const deleteMessage = async (messageId: string): Promise<void> => {
        if (!roomStore.currentRoom) {
            const error = 'Must be in a room to delete messages'
            setChatError(error, 'NO_ROOM_ERROR')
            throw new Error(error)
        }

        debugLog('Deleting message', { messageId })

        try {
            const request: DeleteMessageRequest = {
                messageId,
                roomId: roomStore.currentRoom.id
            }

            const response = await socketStore.emit('delete-message', request)

            if (response.success) {
                debugLog('Message deleted successfully', { messageId })
                // Message will be removed via socket event
            } else {
                throw new Error(response.error || 'Failed to delete message')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setChatError(`Failed to delete message: ${errorMessage}`, 'DELETE_MESSAGE_FAILED')
            throw error
        }
    }

    const sendTypingIndicator = async (isTyping: boolean): Promise<void> => {
        if (!roomStore.currentRoom || !roomStore.currentParticipant) return

        try {
            const request: TypingIndicatorRequest = {
                roomId: roomStore.currentRoom.id,
                isTyping
            }

            await socketStore.emit('typing-indicator', request)
        } catch (error) {
            // Typing indicators are not critical, so just log the error
            debugLog('Failed to send typing indicator', error)
        }
    }

    const loadChatHistory = async (): Promise<void> => {
        if (!roomStore.currentRoom) {
            const error = 'Must be in a room to load chat history'
            setChatError(error, 'NO_ROOM_ERROR')
            throw new Error(error)
        }

        debugLog('Loading chat history', { roomId: roomStore.currentRoom.id })

        try {
            const response = await socketStore.emit('get-chat-history', {
                roomId: roomStore.currentRoom.id
            })

            if (response.success) {
                handleChatHistory(response.messages)
                debugLog('Chat history loaded', { messageCount: response.messages.length })
            } else {
                throw new Error(response.error || 'Failed to load chat history')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setChatError(`Failed to load chat history: ${errorMessage}`, 'LOAD_HISTORY_FAILED')
            throw error
        }
    }

    const clearMessages = () => {
        messages.value = []
        isTyping.value = []
        clearChatError()
        debugLog('Chat messages cleared')
    }

    // Computed properties
    const messageCount = computed(() => messages.value.length)

    const recentMessages = computed(() =>
        messages.value.slice(-50) // Last 50 messages for performance
    )

    const myMessages = computed(() =>
        messages.value.filter(m =>
            m.senderId === roomStore.currentParticipant?.socketId
        )
    )

    const canSendMessages = computed(() =>
        roomStore.isInRoom && !isSendingMessage.value
    )

    const typingUsers = computed(() =>
        isTyping.value.filter(userName =>
            userName !== roomStore.currentParticipant?.userName
        )
    )

    const hasError = computed(() => !!chatError.value)

    return {
        // State (readonly)
        messages: readonly(messages),
        chatError: readonly(chatError),
        isTyping: readonly(isTyping),
        isSendingMessage: readonly(isSendingMessage),

        // Computed properties
        messageCount,
        recentMessages,
        myMessages,
        canSendMessages,
        typingUsers,
        hasError,

        // Actions
        sendMessage,
        editMessage,
        deleteMessage,
        sendTypingIndicator,
        loadChatHistory,
        clearMessages,
        clearChatError,

        // Initialization
        initializeChat,
        isInitialized: readonly(isInitialized),

        // Development utilities
        ...(process.env.NODE_ENV === 'development' && { debugLog })
    }
})