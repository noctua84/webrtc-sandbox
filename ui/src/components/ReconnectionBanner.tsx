import React from 'react';
import { observer } from 'mobx-react-lite';
import roomStore from '../stores/room.store';

const ReconnectionBanner: React.FC = observer(() => {
    if (!roomStore.canReconnect || roomStore.isInRoom) {
        return null;
    }

    const handleReconnect = async (): Promise<void> => {
        try {
            await roomStore.attemptReconnection();
        } catch (error) {
            console.error('Reconnection failed:', error);
        }
    };

    const handleDismiss = (): void => {
        roomStore.clearReconnection();
    };

    const data = roomStore.reconnectionData;
    if (!data) return null;

    const ageMinutes = Math.floor((Date.now() - data.timestamp) / 60000);

    return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 animate-fadeIn">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <h3 className="text-sm font-medium text-blue-800 mb-2">
                        🔄 Reconnection Available
                    </h3>
                    <p className="text-sm text-blue-700 mb-3">
                        You were previously in room "<strong>{data.roomId}</strong>" as "{data.userName}".
                        Would you like to reconnect?
                    </p>
                    <div className="text-xs text-blue-600 mb-3">
                        Disconnected {ageMinutes} minute{ageMinutes !== 1 ? 's' : ''} ago
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleReconnect}
                            disabled={roomStore.isReconnecting}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                        >
                            {roomStore.isReconnecting ? 'Reconnecting...' : 'Reconnect to Room'}
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="px-3 py-1 text-sm border border-blue-300 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
                <button
                    onClick={handleDismiss}
                    className="ml-4 text-blue-400 hover:text-blue-600 transition-colors"
                    aria-label="Close"
                >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>
    );
});

export default ReconnectionBanner;