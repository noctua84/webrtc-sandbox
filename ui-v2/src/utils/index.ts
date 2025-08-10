// utils/index.ts
import { v4 as uuidv4 } from 'uuid';

export const generateId = (): string => uuidv4();

export const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const formatTimeFromNow = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / (1000 * 60));

    if (diffMins < 0) {
        return `${Math.abs(diffMins)} minutes ago`;
    } else if (diffMins === 0) {
        return 'Now';
    } else if (diffMins < 60) {
        return `In ${diffMins} minutes`;
    } else {
        const diffHours = Math.round(diffMins / 60);
        return `In ${diffHours} hours`;
    }
};

export const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

export const validateEventId = (eventId: string): boolean => {
    const eventIdRegex = /^[a-zA-Z0-9\-_]{3,100}$/;
    return eventIdRegex.test(eventId);
};

export const createTimestamp = (): string => {
    return new Date().toISOString();
};

export const debounce = <T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

export const sanitizeInput = (input: string): string => {
    return input.trim().replace(/[<>]/g, '');
};

export const generateEventLink = (eventId: string): string => {
    return `${window.location.origin}/event/${eventId}`;
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        } catch (fallbackErr) {
            document.body.removeChild(textArea);
            return false;
        }
    }
};

export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

export const formatParticipantCount = (current: number, max: number): string => {
    return `${current}/${max} participants`;
};

export const isEventStartingSoon = (scheduledStartTime: string, minutesThreshold = 15): boolean => {
    const startTime = new Date(scheduledStartTime);
    const now = new Date();
    const diffMs = startTime.getTime() - now.getTime();
    const diffMins = diffMs / (1000 * 60);

    return diffMins <= minutesThreshold && diffMins > 0;
};

export const getEventStatusColor = (status: string): string => {
    switch (status) {
        case 'SCHEDULED':
            return 'text-blue-600 bg-blue-50';
        case 'ACTIVE':
            return 'text-green-600 bg-green-50';
        case 'CLOSED':
            return 'text-gray-600 bg-gray-50';
        default:
            return 'text-gray-600 bg-gray-50';
    }
};

export const getConnectionStatusColor = (status: string): string => {
    switch (status) {
        case 'connected':
            return 'text-green-600';
        case 'connecting':
            return 'text-yellow-600';
        case 'error':
            return 'text-red-600';
        default:
            return 'text-gray-600';
    }
};