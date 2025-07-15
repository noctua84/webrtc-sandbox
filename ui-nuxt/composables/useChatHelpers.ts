// composables/useChatHelpers.ts - Client-side only chat helpers (Fixed circular dependency)

import { ref, computed } from 'vue'
import type { ChatMessage, ChatParticipant, MessageFormatting } from '~/types/chat.types'

/**
 * Client-side chat helpers that require browser APIs
 * These should only be used in components with proper client-side checks
 */
export function useChatHelpers() {
    // Reactive state for client-side features
    const isFormatted = ref(false)

    // Check if content is emoji only - inline implementation to avoid circular dependency
    const isEmojiOnly = (content: string): boolean => {
        const trimmed = content.trim()
        if (!trimmed) return false

        // Unicode emoji regex
        const emojiRegex = /[\u{1F300}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
        const emojis = trimmed.match(emojiRegex) || []

        // Remove all emojis and check if anything remains
        const withoutEmojis = trimmed.replace(emojiRegex, '').trim()

        return withoutEmojis.length === 0 && emojis.length > 0
    }

    // Get user color (deterministic) - inline implementation
    const getUserColor = (userId: string): string => {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
        ]

        let hash = 0
        for (let i = 0; i < userId.length; i++) {
            hash = userId.charCodeAt(i) + ((hash << 5) - hash)
        }

        return colors[Math.abs(hash) % colors.length]
    }

    // Truncate text with ellipsis - inline implementation
    const truncateText = (text: string, maxLength: number): string => {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    }

    // Format message content with HTML (client-side only)
    const formatMessageForDisplay = (
        content: string,
        formatting: MessageFormatting = {
            enableMarkdown: true,
            enableEmoji: true,
            enableLinks: true,
            enableCodeBlocks: true
        }
    ): string => {
        if (!process.client || !content) {
            return content || ''
        }

        try {
            let formatted = content

            if (formatting.enableLinks) {
                const urlRegex = /(https?:\/\/[^\s]+)/g
                formatted = formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$1</a>')
            }

            if (formatting.enableMarkdown) {
                formatted = formatted
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
                    .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
            }

            if (formatting.enableCodeBlocks) {
                formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto"><code>$1</code></pre>')
            }

            return formatted
        } catch (error) {
            console.warn('Error formatting message:', error)
            return content
        }
    }

    // Highlight mentions in content (client-side only)
    const highlightMentionsInContent = (
        content: string,
        participants: ChatParticipant[] = [],
        currentUserId?: string
    ): string => {
        if (!process.client || !content || !participants.length) {
            return content || ''
        }

        try {
            const mentionRegex = /@(\w+)/g

            return content.replace(mentionRegex, (match, username) => {
                const participant = participants.find(p => p.userName === username)
                if (!participant) return match

                const isCurrentUser = participant.socketId === currentUserId
                const className = isCurrentUser
                    ? 'mention mention-self bg-blue-200 dark:bg-blue-800 px-1 rounded font-medium'
                    : 'mention bg-gray-200 dark:bg-gray-700 px-1 rounded font-medium'

                return `<span class="${className}" data-user-id="${participant.socketId}">@${username}</span>`
            })
        } catch (error) {
            console.warn('Error highlighting mentions:', error)
            return content
        }
    }

    // Format relative timestamp (client-side only for reactivity)
    const formatRelativeTime = (timestamp: string): string => {
        if (!process.client || !timestamp) {
            try {
                return new Date(timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            } catch {
                return timestamp || ''
            }
        }

        try {
            const date = new Date(timestamp)
            const now = new Date()
            const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

            if (diffInMinutes < 1) return 'now'
            if (diffInMinutes < 60) return `${diffInMinutes}m ago`

            const diffInHours = Math.floor(diffInMinutes / 60)
            if (diffInHours < 24) return `${diffInHours}h ago`

            const diffInDays = Math.floor(diffInHours / 24)
            if (diffInDays < 7) return `${diffInDays}d ago`

            return date.toLocaleDateString()
        } catch (error) {
            console.warn('Error formatting relative time:', error)
            return timestamp
        }
    }

    // Copy text to clipboard (client-side only)
    const copyToClipboard = async (text: string): Promise<boolean> => {
        if (!process.client || !navigator?.clipboard || !text) {
            return false
        }

        try {
            await navigator.clipboard.writeText(text)
            return true
        } catch (error) {
            console.error('Failed to copy to clipboard:', error)
            return false
        }
    }

    // Scroll to element (client-side only)
    const scrollToElement = (elementId: string, behavior: ScrollBehavior = 'smooth'): void => {
        if (!process.client || !elementId) return

        try {
            const element = document.getElementById(elementId) ||
                document.querySelector(`[data-message-id="${elementId}"]`)

            if (element) {
                element.scrollIntoView({ behavior, block: 'center' })
            }
        } catch (error) {
            console.warn('Error scrolling to element:', error)
        }
    }

    // Download file (client-side only)
    const downloadFile = (url: string, filename?: string): void => {
        if (!process.client || !url) return

        try {
            const link = document.createElement('a')
            link.href = url
            if (filename) {
                link.download = filename
            }
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        } catch (error) {
            console.warn('Error downloading file:', error)
        }
    }

    // Check if element is in viewport (client-side only)
    const isElementInViewport = (element: Element): boolean => {
        if (!process.client || !element) return false

        try {
            const rect = element.getBoundingClientRect()
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            )
        } catch (error) {
            console.warn('Error checking viewport:', error)
            return false
        }
    }

    // Auto-resize textarea (client-side only)
    const autoResizeTextarea = (textarea: HTMLTextAreaElement): void => {
        if (!process.client || !textarea) return

        try {
            textarea.style.height = 'auto'
            textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
        } catch (error) {
            console.warn('Error resizing textarea:', error)
        }
    }

    // Debounced function factory (SSR-safe)
    const createDebouncedFunction = <T extends (...args: any[]) => any>(
        func: T,
        delay: number
    ) => {
        let timeoutId: NodeJS.Timeout | number | undefined

        return (...args: Parameters<T>) => {
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId as number)
            }
            timeoutId = setTimeout(() => func(...args), delay)
        }
    }

    // Throttled function factory (SSR-safe)
    const createThrottledFunction = <T extends (...args: any[]) => any>(
        func: T,
        delay: number
    ) => {
        let lastCall = 0

        return (...args: Parameters<T>) => {
            const now = Date.now()
            if (now - lastCall >= delay) {
                lastCall = now
                func(...args)
            }
        }
    }

    // Get file icon based on type
    const getFileIcon = (fileType: string): string => {
        if (!fileType) return 'mdi-file'

        if (fileType.startsWith('image/')) return 'mdi-image'
        if (fileType.startsWith('video/')) return 'mdi-video'
        if (fileType === 'application/pdf') return 'mdi-file-pdf-box'
        if (fileType.includes('document') || fileType.includes('word')) return 'mdi-file-document'
        if (fileType.includes('spreadsheet') || fileType.includes('excel')) return 'mdi-file-excel'
        if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'mdi-file-powerpoint'
        if (fileType.includes('audio/')) return 'mdi-file-music'
        if (fileType.includes('archive') || fileType.includes('zip')) return 'mdi-zip-box'
        return 'mdi-file'
    }

    // Format file size
    const formatFileSize = (bytes: number): string => {
        if (!bytes || bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return {
        // State
        isFormatted,

        // Formatting functions
        formatMessageForDisplay,
        highlightMentionsInContent,
        formatRelativeTime,
        isEmojiOnly,
        getUserColor,
        truncateText,

        // File utilities
        getFileIcon,
        formatFileSize,
        downloadFile,

        // DOM utilities
        copyToClipboard,
        scrollToElement,
        isElementInViewport,
        autoResizeTextarea,

        // Function factories
        createDebouncedFunction,
        createThrottledFunction
    }
}

// Export individual functions for direct use (no circular dependency)
export const formatMessageForDisplay = (content: string, formatting?: MessageFormatting) => {
    const { formatMessageForDisplay: fn } = useChatHelpers()
    return fn(content, formatting)
}

export const highlightMentionsInContent = (content: string, participants: ChatParticipant[], currentUserId?: string) => {
    const { highlightMentionsInContent: fn } = useChatHelpers()
    return fn(content, participants, currentUserId)
}

export const formatRelativeTime = (timestamp: string) => {
    const { formatRelativeTime: fn } = useChatHelpers()
    return fn(timestamp)
}

export const copyToClipboard = async (text: string) => {
    const { copyToClipboard: fn } = useChatHelpers()
    return await fn(text)
}

export const scrollToElement = (elementId: string, behavior?: ScrollBehavior) => {
    const { scrollToElement: fn } = useChatHelpers()
    return fn(elementId, behavior)
}

export const downloadFile = (url: string, filename?: string) => {
    const { downloadFile: fn } = useChatHelpers()
    return fn(url, filename)
}

export const isElementInViewport = (element: Element) => {
    const { isElementInViewport: fn } = useChatHelpers()
    return fn(element)
}

export const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
    const { autoResizeTextarea: fn } = useChatHelpers()
    return fn(textarea)
}

// Direct exports of utility functions (no composable dependency)
export const isEmojiOnly = (content: string): boolean => {
    const trimmed = content?.trim() || ''
    if (!trimmed) return false

    const emojiRegex = /[\u{1F300}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
    const emojis = trimmed.match(emojiRegex) || []
    const withoutEmojis = trimmed.replace(emojiRegex, '').trim()

    return withoutEmojis.length === 0 && emojis.length > 0
}

export const getUserColor = (userId: string): string => {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ]

    let hash = 0
    for (let i = 0; i < (userId || '').length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash)
    }

    return colors[Math.abs(hash) % colors.length]
}

export const truncateText = (text: string, maxLength: number): string => {
    return (text || '').length > maxLength ? text.substring(0, maxLength) + '...' : (text || '')
}

export const getFileIcon = (fileType: string): string => {
    if (!fileType) return 'mdi-file'

    if (fileType.startsWith('image/')) return 'mdi-image'
    if (fileType.startsWith('video/')) return 'mdi-video'
    if (fileType === 'application/pdf') return 'mdi-file-pdf-box'
    if (fileType.includes('document') || fileType.includes('word')) return 'mdi-file-document'
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return 'mdi-file-excel'
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'mdi-file-powerpoint'
    if (fileType.includes('audio/')) return 'mdi-file-music'
    if (fileType.includes('archive') || fileType.includes('zip')) return 'mdi-zip-box'
    return 'mdi-file'
}

export const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}