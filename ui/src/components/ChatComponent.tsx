// ui/src/components/Chat/ChatComponent.tsx

import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import chatStore from '@/stores/chat.store';
import roomStore from '@/stores/room.store';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';

const ChatComponent: React.FC = observer(() => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatStore.messages.length]);

    // Load chat history when joining a room
    useEffect(() => {
        if (roomStore.isInRoom && !chatStore.hasMessages) {
            chatStore.loadChatHistory();
        }
    }, [roomStore.isInRoom]);

    // Clean up when leaving room
    useEffect(() => {
        if (!roomStore.isInRoom) {
            chatStore.clearMessages();
        }
    }, [roomStore.isInRoom]);

    if (!roomStore.isInRoom) {
        return null;
    }

    return (
        <div className={`flex flex-col bg-white border border-gray-200 rounded-lg shadow-sm transition-all duration-300 ${
            isCollapsed ? 'h-12' : 'h-96'
        }`}>
            {/* Chat Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 text-blue-600">
                        <svg fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="font-medium text-gray-900">
                            Room Chat
                        </h3>
                        <p className="text-xs text-gray-500">
                            {chatStore.messageCount} messages • {roomStore.participants.length} participants
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                >
                    <svg
                        className={`w-4 h-4 text-gray-600 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {/* Chat Content */}
            {!isCollapsed && (
                <>
                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                        {chatStore.isLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                                    <span className="text-sm">Loading chat history...</span>
                                </div>
                            </div>
                        ) : chatStore.hasMessages ? (
                            <>
                                {chatStore.messages.map((message) => (
                                    <ChatMessage key={message.id} message={message} />
                                ))}
                                <TypingIndicator />
                                <div ref={messagesEndRef} />
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                <div className="text-center">
                                    <div className="w-12 h-12 mx-auto mb-3 text-gray-300">
                                        <svg fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <p className="text-sm">No messages yet</p>
                                    <p className="text-xs">Be the first to say hello!</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chat Input */}
                    <div className="border-t border-gray-200">
                        <ChatInput />
                    </div>
                </>
            )}
        </div>
    );
});

export default ChatComponent;