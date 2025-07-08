// ui/src/components/Chat/TypingIndicator.tsx

import React from 'react';
import { observer } from 'mobx-react-lite';
import chatStore from '@/stores/chat.store';

const TypingIndicator: React.FC = observer(() => {
    const typingUsers = chatStore.typingUserNames;

    if (typingUsers.length === 0) return null;

    const getTypingText = () => {
        if (typingUsers.length === 1) {
            return `${typingUsers[0]} is typing...`;
        } else if (typingUsers.length === 2) {
            return `${typingUsers[0]} and ${typingUsers[1]} are typing...`;
        } else {
            return `${typingUsers[0]} and ${typingUsers.length - 1} others are typing...`;
        }
    };

    return (
        <div className="flex items-center gap-3 px-3 py-2">
            {/* Avatar placeholder for typing users */}
            <div className="flex -space-x-2">
                {typingUsers.slice(0, 3).map((userName, index) => (
                    <div
                        key={userName}
                        className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center text-white text-xs font-medium border-2 border-white"
                        style={{ zIndex: 10 - index }}
                    >
                        {userName.charAt(0).toUpperCase()}
                    </div>
                ))}
            </div>

            {/* Typing text and animation */}
            <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 italic">
          {getTypingText()}
        </span>

                {/* Typing dots animation */}
                <div className="flex space-x-1">
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
            </div>
        </div>
    );
});

export default TypingIndicator;