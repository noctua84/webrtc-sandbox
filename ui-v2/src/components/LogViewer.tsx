// components/LogViewer.tsx
import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Terminal, Trash2, Download } from 'lucide-react';
import { socketStore } from '../stores/SocketStore';
import type { LogLevel } from '@/types';
import {Card} from "@/components/ui/Card.tsx";
import {Button} from "@/components/ui/Button.tsx";

export const LogViewer: React.FC = observer(() => {
    const logEndRef = useRef<HTMLDivElement>(null);
    const { logs } = socketStore;

    useEffect(() => {
        // Auto-scroll to bottom when new logs are added
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs.length]);

    const getLogLevelColor = (level: LogLevel): string => {
        switch (level) {
            case 'success':
                return 'text-success-600 bg-success-50';
            case 'warning':
                return 'text-warning-600 bg-warning-50';
            case 'error':
                return 'text-error-600 bg-error-50';
            default:
                return 'text-gray-600 bg-gray-50';
        }
    };

    const getLogLevelIcon = (level: LogLevel): string => {
        switch (level) {
            case 'success':
                return '✅';
            case 'warning':
                return '⚠️';
            case 'error':
                return '❌';
            default:
                return 'ℹ️';
        }
    };

    const formatTimestamp = (timestamp: string): string => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    const downloadLogs = () => {
        const logText = logs.map(log => {
            const timestamp = formatTimestamp(log.timestamp);
            const data = log.data ? JSON.stringify(log.data, null, 2) : '';
            return `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}${data ? '\n' + data : ''}`;
        }).join('\n\n');

        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `socket-logs-${new Date().toISOString().slice(0, 19)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <Card
            title={
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Terminal className="w-5 h-5" />
                        <span>Application Logs</span>
                        <span className="text-sm text-gray-500">({logs.length})</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button
                            onClick={downloadLogs}
                            variant="secondary"
                            size="sm"
                            disabled={logs.length === 0}
                        >
                            <Download className="w-4 h-4 mr-1" />
                            Export
                        </Button>
                        <Button
                            onClick={() => socketStore.clearLogs()}
                            variant="secondary"
                            size="sm"
                            disabled={logs.length === 0}
                        >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Clear
                        </Button>
                    </div>
                </div>
            }
            className="flex flex-col"
        >
            <div className="flex-1 min-h-96 max-h-[70vh] overflow-y-auto bg-gray-900 rounded-lg p-4 font-mono text-sm scrollbar-thin">
                {logs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>No logs yet. Application events will appear here.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {logs.map(log => (
                            <div key={log.id} className="group hover:bg-gray-800 rounded p-2 transition-colors">
                                <div className="flex items-start space-x-2">
                  <span className="text-gray-400 text-xs mt-1 flex-shrink-0">
                    {formatTimestamp(log.timestamp)}
                  </span>
                                    <span className="text-xs mt-1 flex-shrink-0">
                    {getLogLevelIcon(log.level)}
                  </span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getLogLevelColor(log.level)}`}>
                                            {log.level.toUpperCase()}
                                        </div>
                                        <p className="text-white mt-1 break-words">{log.message}</p>
                                        {log.data && (
                                            <details className="mt-2 group-hover:bg-gray-700 rounded p-2">
                                                <summary className="text-gray-400 cursor-pointer hover:text-gray-300 text-xs">
                                                    View Data
                                                </summary>
                                                <pre className="text-gray-300 text-xs mt-2 whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                )}
            </div>
        </Card>
    );
});