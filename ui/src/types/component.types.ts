import {ConnectionStatus, RoomStatus} from "@/types/connection.types.ts";
import {LogEntry} from "@/types/logging.types.ts";

export interface StatusIndicatorProps {
    status: ConnectionStatus | RoomStatus;
    label?: string;
    className?: string;
}

export interface LogViewerProps {
    logs: LogEntry[];
    title: string;
    onClear?: () => void;
    className?: string;
}