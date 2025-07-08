// ui/src/components/Chat/ChatMessage.tsx

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import chatStore from '@/stores/chat.store';
import roomStore from '@/stores/room.store';
import type { ChatMessage } from '@/types/chat.types';

interface ChatMessageProps {
    message: ChatMessage;
}

const ChatMessage: React.FC<ChatMessageProps> = observer(({ message }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content);
    const [showMenu, setShowMenu] = useState(false);

    const isOwnMessage = message.senderId === roomStore.currentParticipant?.socketId;
    const canEdit = chatStore.canEditMessage(message);

    const handleEdit = async () => {
        if (!editContent.trim() || editContent === message.content) {
            setIsEditing(false);
            return;
        }

        try {
            await chatStore.editMessage(message.id, editContent);
            setIsEditing(false);
            setShowMenu(false);
        } catch (error) {
            console.error('Failed to edit message:', error);
            alert('Failed to edit message');
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this message?')) return;

        try {
            await chatStore.deleteMessage(message.id);
            setShowMenu(false);
        } catch (error) {
            console.error('Failed to delete message:', error);
            alert('Failed to delete message');
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    /**
    const formatDate = (timestamp: string) => {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString();
        }
    };
    */

    if (message.type === 'system') {
        return (
            <div className="flex justify-center">
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          {message.content}
        </span>
            </div>
        );
    }

    return (
        <div className={`flex gap-3 group ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    {message.senderName.charAt(0).toUpperCase()}
                </div>
            </div>

            {/* Message Content */}
            <div className={`flex-1 max-w-xs ${isOwnMessage ? 'text-right' : ''}`}>
                {/* Header */}
                <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
          <span className="text-sm font-medium text-gray-900">
            {isOwnMessage ? 'You' : message.senderName}
          </span>
                    <span className="text-xs text-gray-500">
            {formatTime(message.timestamp)}
          </span>
                    {message.edited && (
                        <span className="text-xs text-gray-400 italic">
              (edited)
            </span>
                    )}
                </div>

                {/* Message Body */}
                <div className={`relative ${isOwnMessage ? 'text-right' : ''}`}>
                    {isEditing ? (
                        <div className="space-y-2">
              <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full p-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  autoFocus
                  onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleEdit();
                      } else if (e.key === 'Escape') {
                          setIsEditing(false);
                          setEditContent(message.content);
                      }
                  }}
              />
                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditContent(message.content);
                                    }}
                                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEdit}
                                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`inline-block p-3 rounded-lg max-w-full break-words ${
                            isOwnMessage
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-900'
                        }`}>
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                    )}

                    {/* Message Menu */}
                    {canEdit && !isEditing && (
                        <div className="absolute top-0 right-0 -mt-2 -mr-2">
                            <div className="relative">
                                <button
                                    onClick={() => setShowMenu(!showMenu)}
                                    className="opacity-0 group-hover:opacity-100 w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center transition-opacity"
                                >
                                    <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                    </svg>
                                </button>

                                {showMenu && (
                                    <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                        <button
                                            onClick={() => {
                                                setIsEditing(true);
                                                setShowMenu(false);
                                            }}
                                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 first:rounded-t-lg"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 last:rounded-b-lg"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Reply indicator */}
                {message.replyTo && (
                    <div className={`mt-1 text-xs text-gray-500 ${isOwnMessage ? 'text-right' : ''}`}>
                        <span>↳ Replying to message</span>
                    </div>
                )}
            </div>
        </div>
    );
});

export default ChatMessage;