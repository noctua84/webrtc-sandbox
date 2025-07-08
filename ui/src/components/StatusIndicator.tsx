import React from 'react';
import type { StatusIndicatorProps, ConnectionStatus, RoomStatus } from '../types/connection.types.ts';

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label, className = '' }) => {
    const getStatusConfig = (status: ConnectionStatus | RoomStatus) => {
        switch (status) {
            case 'connected':
                return {
                    dotClass: 'status-dot status-connected',
                    textClass: 'text-success-600',
                    label: label || 'Connected'
                };
            case 'connecting':
                return {
                    dotClass: 'status-dot status-connecting',
                    textClass: 'text-warning-600',
                    label: label || 'Connecting...'
                };
            case 'disconnected':
                return {
                    dotClass: 'status-dot status-disconnected',
                    textClass: 'text-error-600',
                    label: label || 'Disconnected'
                };
            case 'error':
                return {
                    dotClass: 'status-dot status-disconnected',
                    textClass: 'text-error-600',
                    label: label || 'Error'
                };
            case 'creating':
                return {
                    dotClass: 'status-dot status-connecting',
                    textClass: 'text-warning-600',
                    label: label || 'Creating...'
                };
            case 'joining':
                return {
                    dotClass: 'status-dot status-connecting',
                    textClass: 'text-warning-600',
                    label: label || 'Joining...'
                };
            case 'in-room':
                return {
                    dotClass: 'status-dot status-connected',
                    textClass: 'text-success-600',
                    label: label || 'In Room'
                };
            case 'idle':
                return {
                    dotClass: 'status-dot bg-gray-400',
                    textClass: 'text-gray-600',
                    label: label || 'Ready'
                };
            default:
                return {
                    dotClass: 'status-dot bg-gray-400',
                    textClass: 'text-gray-600',
                    label: label || 'Unknown'
                };
        }
    };

    const config = getStatusConfig(status);

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className={config.dotClass}></div>
            <span className={`text-sm font-medium ${config.textClass}`}>
        {config.label}
      </span>
        </div>
    );
};

export default StatusIndicator;