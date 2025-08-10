// components/ConnectionStatus.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import { Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';
import { socketStore } from '../stores/SocketStore';
import { getConnectionStatusColor } from '@/utils';

export const ConnectionStatus: React.FC = observer(() => {
    const { connectionStatus, isConnected, isConnecting, connectionError } = socketStore;

    const getIcon = () => {
        switch (connectionStatus) {
            case 'connected':
                return <Wifi className="w-4 h-4" />;
            case 'connecting':
                return <Loader2 className="w-4 h-4 animate-spin" />;
            case 'error':
                return <AlertCircle className="w-4 h-4" />;
            default:
                return <WifiOff className="w-4 h-4" />;
        }
    };

    const getMessage = () => {
        switch (connectionStatus) {
            case 'connected':
                return 'Connected';
            case 'connecting':
                return 'Connecting...';
            case 'error':
                return connectionError || 'Connection Error';
            default:
                return 'Disconnected';
        }
    };

    return (
        <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-1 ${getConnectionStatusColor(connectionStatus)}`}>
                {getIcon()}
                <span className="text-sm font-medium">{getMessage()}</span>
            </div>

            {/* Connection indicator dot */}
            <div className="relative">
                <div
                    className={`w-2 h-2 rounded-full ${
                        isConnected ? 'bg-green-500' :
                            isConnecting ? 'bg-yellow-500 animate-pulse' :
                                'bg-red-500'
                    }`}
                />
                {isConnected && (
                    <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75" />
                )}
            </div>
        </div>
    );
});