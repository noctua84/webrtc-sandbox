
// Server configuration constants

export const SERVER_CONFIG = {
    PORT: process.env.PORT || 3001,
    NODE_ENV: process.env.NODE_ENV || 'development',

    // CORS Configuration
    CORS: {
        ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
        METHODS: ['GET', 'POST'],
        CREDENTIALS: true
    },

    // Socket.IO Configuration
    SOCKET_IO: {
        TRANSPORTS: ['websocket', 'polling'],
        TIMEOUT: 10000,
        RECONNECTION: true,
        RECONNECTION_ATTEMPTS: 5,
        RECONNECTION_DELAY: 1000
    }
}

export const ROOM_CONFIG = {
    // Room management settings
    TIMEOUT_DURATION: 30 * 60 * 1000, // 30 minutes
    PARTICIPANT_RECONNECTION_WINDOW: 5 * 60 * 1000, // 5 minutes to reconnect
    CLEANUP_INTERVAL: 60 * 1000, // Check for cleanup every minute

    // Room limits
    MAX_PARTICIPANTS: 4, // Maximum participants per room
    MAX_ROOMS: 1000, // Maximum number of rooms allowed

    // Cleanup settings
    MAX_INACTIVE_ROOMS: 100, // Maximum number of inactive rooms to keep
    MAX_EXPIRED_TOKENS: 1000 // Maximum number of inactive participants to keep
}

export const LOGGING_CONFIG = {
    // Log levels
    LEVELS: {
        ERROR: 0,
        WARNING: 1,
        INFO: 2,
        SUCCESS: 3,
        DEBUG: 4
    },

    // Log retention
    MAX_LOG_ENTRIES: 1000,
    LOG_ROTATION_SIZE: 10 * 1024 * 1024, // 10MB

    // Console output
    ENABLE_CONSOLE: true,
    ENABLE_FILE_LOGGING: process.env.NODE_ENV === 'production',
    LOG_FILE_PATH: process.env.LOG_FILE_PATH || './logs/server.log'
}

// Validation functions
export const validateConfig = (): void => {
    if (ROOM_CONFIG.TIMEOUT_DURATION <= ROOM_CONFIG.PARTICIPANT_RECONNECTION_WINDOW) {
        throw new Error('Room timeout must be longer than participant reconnection window');
    }

    if (ROOM_CONFIG.CLEANUP_INTERVAL <= 0) {
        throw new Error('Cleanup interval must be positive');
    }

    if (ROOM_CONFIG.MAX_PARTICIPANTS <= 0) {
        throw new Error('Max participants must be positive');
    }
};

// Environment-specific configuration
export const getEnvironmentConfig = () => {
    const env = SERVER_CONFIG.NODE_ENV;

    return {
        isDevelopment: env === 'development',
        isProduction: env === 'production',
        isTest: env === 'test',

        // Adjust logging for environment
        logLevel: env === 'development' ? 'debug' :
            env === 'production' ? 'info' : 'warning',

        // Adjust cleanup intervals for environment
        cleanupInterval: env === 'test' ? 1000 : ROOM_CONFIG.CLEANUP_INTERVAL,

        // Adjust timeouts for environment
        roomTimeout: env === 'test' ? 5000 : ROOM_CONFIG.TIMEOUT_DURATION
    };
};