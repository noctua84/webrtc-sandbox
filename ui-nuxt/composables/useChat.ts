// composables/useChat.ts - SSR-safe chat composable

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useChatStore } from '~/stores/chat.store'
import { useRoomStore } from '~/stores/room.store'
import {
    convertEmojiShortcodes,
    validateMessage,
    filterMentionSuggestions,
    getTypingIndicatorText,
    parseMentions
} from '~/helper/chat.helper'
import type { ChatMessage, MentionSuggestion, MessageFormatting } from '~/types/chat.types'

export interface UseChatOptions {
    autoScroll?: boolean
    typingTimeout?: number
    maxMessageLength?: number
    enableFormatting?: boolean
    enableMentions?: boolean
    enableEmoji?: boolean
}

export function useChat(options: UseChatOptions = {}) {
    const {
        autoScroll = true,
        typingTimeout = 3000,
        maxMessageLength = 1000,
        enableFormatting = true,
        enableMentions = true,
        enableEmoji = true
    } = options

    // Stores
    const chatStore = useChatStore()
    const roomStore = useRoomStore()

    // Client-side helpers
    const {
        formatMessageForDisplay,
        formatRelativeTime,
        isEmojiOnly,
        createDebouncedFunction,
        createThrottledFunction
    } = useChatHelpers()

    // Local reactive state
    const messageInput = ref('')
    const isTyping = ref(false)
    const showMentionPicker = ref(false)
    const mentionQuery = ref('')
    const mentionPosition = ref(0)
    const editingMessageId = ref<string | null>(null)
    const editingContent = ref('')
    const replyingTo = ref<ChatMessage | null>(null)

    // Refs for DOM manipulation
    const messagesContainer = ref<HTMLElement | null>(null)
    const messageInputRef = ref<HTMLTextAreaElement | null>(null)

    // Formatting options
    const messageFormatting = ref<MessageFormatting>({
        enableMarkdown: enableFormatting,
        enableEmoji: enableEmoji,
        enableLinks: true,
        enableCodeBlocks: enableFormatting
    })

    // Create debounced and throttled functions (SSR-safe)
    const debouncedStopTyping = createDebouncedFunction(() => {
        if (isTyping.value) {
            isTyping.value = false
            chatStore.sendTypingIndicator(false)
        }
    }, typingTimeout)

    const throttledTypingIndicator = createThrottledFunction(() => {
        if (!isTyping.value) {
            isTyping.value = true
            chatStore.sendTypingIndicator(true)
        }
        debouncedStopTyping()
    }, 1000)

    // Computed properties
    const formattedMessages = computed(() => {
        return chatStore.messages.map(message => ({
            ...message,
            formattedContent: enableFormatting && process.client
                ? formatMessageForDisplay(message.content, messageFormatting.value)
                : message.content
        }))
    })

    const typingText = computed(() => {
        return getTypingIndicatorText(chatStore.typingUserNames)
    })

    const mentionSuggestions = computed(() => {
        if (!enableMentions || !mentionQuery.value) return []

        return filterMentionSuggestions(
            mentionQuery.value,
            roomStore.participants,
            roomStore.currentParticipant?.socketId,
            5
        )
    })

    const canSendMessage = computed(() => {
        const validation = validateMessage(messageInput.value, maxMessageLength)
        return validation.isValid && chatStore.canSendMessages
    })

    const messageValidation = computed(() => {
        return validateMessage(messageInput.value, maxMessageLength)
    })

    const characterCount = computed(() => ({
        current: messageInput.value.length,
        max: maxMessageLength,
        remaining: maxMessageLength - messageInput.value.length,
        isNearLimit: messageInput.value.length > maxMessageLength * 0.8
    }))

    // Message input handling
    const handleInputChange = (event: Event) => {
        const target = event.target as HTMLTextAreaElement
        const value = target.value
        const cursorPosition = target.selectionStart || 0

        messageInput.value = value

        // Handle mentions (client-side only)
        if (enableMentions && process.client) {
            handleMentionDetection(value, cursorPosition)
        }

        // Handle typing indicators
        if (value.trim()) {
            throttledTypingIndicator()
        } else if (isTyping.value) {
            debouncedStopTyping()
        }
    }

    const handleMentionDetection = (value: string, cursorPosition: number) => {
        const beforeCursor = value.substring(0, cursorPosition)
        const mentionMatch = beforeCursor.match(/@(\w*)$/)

        if (mentionMatch) {
            mentionQuery.value = mentionMatch[1].toLowerCase()
            mentionPosition.value = cursorPosition - mentionMatch[1].length - 1
            showMentionPicker.value = true
        } else {
            showMentionPicker.value = false
            mentionQuery.value = ''
        }
    }

    const selectMention = (suggestion: MentionSuggestion) => {
        if (!messageInputRef.value || !process.client) return

        const input = messageInputRef.value
        const beforeMention = messageInput.value.substring(0, mentionPosition.value)
        const afterCursor = messageInput.value.substring(input.selectionStart || 0)

        const newValue = `${beforeMention}@${suggestion.username} ${afterCursor}`
        messageInput.value = newValue
        showMentionPicker.value = false

        // Set cursor position after mention
        nextTick(() => {
            const newPosition = beforeMention.length + suggestion.username.length + 2
            input.setSelectionRange(newPosition, newPosition)
            input.focus()
        })
    }

    // Message actions
    const sendMessage = async () => {
        if (!canSendMessage.value) return

        try {
            let content = messageInput.value.trim()

            // Convert emoji shortcodes if enabled
            if (enableEmoji) {
                content = convertEmojiShortcodes(content)
            }

            // Determine message type (client-side check)
            const messageType = (process.client && isEmojiOnly(content)) ? 'emoji' : 'text'

            await chatStore.sendMessage(content, messageType)

            // Clear input and reset state
            messageInput.value = ''
            replyingTo.value = null

            // Stop typing indicator
            if (isTyping.value) {
                isTyping.value = false
                chatStore.sendTypingIndicator(false)
            }

            // Scroll to bottom if auto-scroll is enabled (client-side only)
            if (autoScroll && process.client) {
                scrollToBottom()
            }

        } catch (error) {
            console.error('Failed to send message:', error)
        }
    }

    const editMessage = async (messageId: string, newContent: string) => {
        try {
            await chatStore.editMessage(messageId, newContent)
            editingMessageId.value = null
            editingContent.value = ''
        } catch (error) {
            console.error('Failed to edit message:', error)
        }
    }

    const deleteMessage = async (messageId: string) => {
        try {
            await chatStore.deleteMessage(messageId)
        } catch (error) {
            console.error('Failed to delete message:', error)
        }
    }

    const addReaction = async (messageId: string, emoji: string) => {
        try {
            await chatStore.addReaction(messageId, emoji)
        } catch (error) {
            console.error('Failed to add reaction:', error)
        }
    }

    const removeReaction = async (messageId: string, emoji: string) => {
        try {
            await chatStore.removeReaction(messageId, emoji)
        } catch (error) {
            console.error('Failed to remove reaction:', error)
        }
    }

    const toggleReaction = async (messageId: string, emoji: string) => {
        const message = chatStore.getMessageById(messageId)
        if (!message) return

        if (chatStore.hasUserReacted(message, emoji)) {
            await removeReaction(messageId, emoji)
        } else {
            await addReaction(messageId, emoji)
        }
    }

    // Reply functionality
    const setReplyTo = (message: ChatMessage) => {
        replyingTo.value = message
        chatStore.setReplyTo(message)

        // Focus input (client-side only)
        if (process.client) {
            nextTick(() => {
                messageInputRef.value?.focus()
            })
        }
    }

    const clearReply = () => {
        replyingTo.value = null
        chatStore.clearReply()
    }

    // Edit functionality
    const startEdit = (message: ChatMessage) => {
        if (!chatStore.canEditMessage(message)) return

        editingMessageId.value = message.id
        editingContent.value = message.content
    }

    const cancelEdit = () => {
        editingMessageId.value = null
        editingContent.value = ''
    }

    const saveEdit = async () => {
        if (!editingMessageId.value) return

        try {
            await editMessage(editingMessageId.value, editingContent.value)
        } catch (error) {
            console.error('Failed to save edit:', error)
        }
    }

    // Scroll functionality (client-side only)
    const scrollToBottom = (smooth: boolean = true) => {
        if (!messagesContainer.value || !process.client) return

        messagesContainer.value.scrollTo({
            top: messagesContainer.value.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        })
    }

    const scrollToMessage = (messageId: string) => {
        if (!process.client) return

        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }

    // Keyboard shortcuts
    const handleKeyDown = (event: KeyboardEvent) => {
        // Send message with Enter (Shift+Enter for new line)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            sendMessage()
            return
        }

        // Close mention picker with Escape
        if (event.key === 'Escape' && showMentionPicker.value) {
            showMentionPicker.value = false
            return
        }

        // Navigate mention suggestions with arrow keys
        if (showMentionPicker.value && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault()
            // Handle mention navigation (would need additional state for selected index)
            return
        }
    }

    // Auto-scroll on new messages
    const shouldAutoScroll = ref(true)

    const handleScroll = () => {
        if (!messagesContainer.value || !process.client) return

        const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100

        shouldAutoScroll.value = isNearBottom
    }

    // Watch for new messages and auto-scroll
    watch(
        () => chatStore.messageCount,
        (newCount, oldCount) => {
            if (newCount > oldCount && autoScroll && shouldAutoScroll.value && process.client) {
                nextTick(() => scrollToBottom())
            }
        }
    )

    // Initialize chat when component mounts (client-side only)
    onMounted(async () => {
        if (!process.client) return

        try {
            await chatStore.initializeChat()

            if (roomStore.isInRoom) {
                await chatStore.loadChatHistory()
            }

            // Scroll to bottom after loading
            nextTick(() => scrollToBottom(false))

        } catch (error) {
            console.error('Failed to initialize chat:', error)
        }
    })

    // Cleanup on unmount
    onUnmounted(() => {
        if (isTyping.value) {
            chatStore.sendTypingIndicator(false)
        }
    })

    // Format timestamp helper (SSR-safe)
    const formatTimestamp = (timestamp: string) => {
        return process.client ? formatRelativeTime(timestamp) : new Date(timestamp).toLocaleTimeString()
    }

    // Message grouping helper
    const shouldGroupMessage = (currentIndex: number): boolean => {
        if (currentIndex === 0) return false

        const current = chatStore.messages[currentIndex]
        const previous = chatStore.messages[currentIndex - 1]

        if (!previous) return false

        const timeDiff = new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()
        const fiveMinutes = 5 * 60 * 1000

        return (
            current.senderId === previous.senderId &&
            current.type === previous.type &&
            timeDiff <= fiveMinutes
        )
    }

    return {
        // Reactive state
        messageInput,
        isTyping: readonly(isTyping),
        showMentionPicker: readonly(showMentionPicker),
        mentionSuggestions,
        editingMessageId: readonly(editingMessageId),
        editingContent,
        replyingTo: readonly(replyingTo),

        // Refs
        messagesContainer,
        messageInputRef,

        // Computed
        formattedMessages,
        typingText,
        canSendMessage,
        messageValidation,
        characterCount,

        // Store getters
        messages: chatStore.messages,
        messageCount: chatStore.messageCount,
        hasError: chatStore.hasError,
        error: chatStore.chatError,
        isLoading: chatStore.isLoading,

        // Message actions
        sendMessage,
        editMessage,
        deleteMessage,
        addReaction,
        removeReaction,
        toggleReaction,

        // Reply actions
        setReplyTo,
        clearReply,

        // Edit actions
        startEdit,
        cancelEdit,
        saveEdit,

        // Mention actions
        selectMention,

        // Scroll actions
        scrollToBottom,
        scrollToMessage,

        // Event handlers
        handleInputChange,
        handleKeyDown,
        handleScroll,

        // Helpers
        formatTimestamp,
        shouldGroupMessage,

        // Store methods
        canEditMessage: chatStore.canEditMessage,
        canDeleteMessage: chatStore.canDeleteMessage,
        isMentioned: chatStore.isMentioned,
        hasUserReacted: chatStore.hasUserReacted
    }
}