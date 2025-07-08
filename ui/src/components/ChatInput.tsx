// ui/src/components/Chat/ChatInput.tsx

import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import chatStore from '@/stores/chat.store';

const ChatInput: React.FC = observer(() => {
    const [message, setMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [message]);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setMessage(value);

        // Handle typing indicators
        if (value.trim() && !isTyping) {
            setIsTyping(true);
            chatStore.sendTypingIndicator(true);
        }

        // Clear existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Set new timeout to stop typing indicator
        typingTimeoutRef.current = setTimeout(() => {
            if (isTyping) {
                setIsTyping(false);
                chatStore.sendTypingIndicator(false);
            }
        }, 1000);
    };

    const handleSend = async () => {
        if (!message.trim() || !chatStore.canSendMessage) return;

        const messageToSend = message.trim();
        setMessage('');

        // Stop typing indicator
        if (isTyping) {
            setIsTyping(false);
            chatStore.sendTypingIndicator(false);
        }

        try {
            await chatStore.sendMessage(messageToSend);
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message');
            // Restore message on error
            setMessage(messageToSend);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleEmojiClick = (emoji: string) => {
        const newMessage = message + emoji;
        setMessage(newMessage);
        textareaRef.current?.focus();
    };

    const quickEmojis = ['👍', '👎', '😀', '😂', '❤️', '🎉', '👏', '🔥'];

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (isTyping) {
                chatStore.sendTypingIndicator(false);
            }
        };
    }, [isTyping]);

    if (!chatStore.canSendMessage) {
        return (
            <div className="p-3 text-center text-gray-500 text-sm">
                Chat is not available
            </div>
        );
    }

    return (
        <div className="p-3 space-y-2">
            {/* Quick Emojis */}
            <div className="flex gap-1 flex-wrap">
                {quickEmojis.map((emoji) => (
                    <button
                        key={emoji}
                        onClick={() => handleEmojiClick(emoji)}
                        className="p-1 hover:bg-gray-100 rounded text-lg leading-none"
                        type="button"
                    >
                        {emoji}
                    </button>
                ))}
            </div>

            {/* Input Area */}
            <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
          <textarea
              ref={textareaRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              className="w-full p-2 pr-10 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
          />

                    {/* Character Count */}
                    <div className="absolute bottom-1 right-2 text-xs text-gray-400">
                        {message.length}/1000
                    </div>
                </div>

                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={!message.trim() || message.length > 1000}
                    className={`p-2 rounded-lg transition-colors ${
                        message.trim() && message.length <= 1000
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    type="button"
                >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                </button>
            </div>

            {/* Message Validation */}
            {message.length > 1000 && (
                <p className="text-xs text-red-600">
                    Message is too long ({message.length}/1000 characters)
                </p>
            )}
        </div>
    );
});

export default ChatInput;