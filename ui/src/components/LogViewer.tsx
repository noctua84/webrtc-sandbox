import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import type { LogViewerProps, LogLevel } from '../types';

const LogViewer: React.FC<LogViewerProps> = observer(({ logs, title, onClear, className = '' }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new logs are added
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs.length]);

    const getLogClassName = (level: LogLevel): string => {
        switch (level) {
            case 'success':
                return 'log-entry log-success';
            case 'error':
                return 'log-entry log-error';
            case 'warning':
                return 'log-entry log-warning';
            case 'info':
            default:
                return 'log-entry log-info';
        }
    };

    const formatTimestamp = (timestamp: string): string => {
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    return (
        <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
            <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
                <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {logs.length} entries
          </span>
                    {onClear && (
                        <button
                            onClick={onClear}
                            className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-600 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            <div
                ref={logContainerRef}
                className="h-64 overflow-y-auto p-2 bg-gray-50"
            >
                {logs.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm py-8">
                        No logs yet
                    </div>
                ) : (
                    <div className="space-y-1">
                        {logs.map((log) => (
                            <div key={log.id} className={getLogClassName(log.level)}>
                                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 shrink-0 mt-0.5">
                    {formatTimestamp(log.timestamp)}
                  </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm break-words">
                                            {log.message}
                                        </div>
                                        {log.data && (
                                            <details className="mt-1">
                                                <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                                    Show data
                                                </summary>
                                                <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                          {log.data}
                        </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default LogViewer;