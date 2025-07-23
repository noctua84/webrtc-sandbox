/**
 * Configuration module for the server.
 * This module loads environment variables, validates them, and exports the configuration settings.
 * It includes settings for server, CORS, Socket.IO, room management, and TURN server.
 */
import dotenv from 'dotenv';
import {configSchema} from "./validation/config.shema";

// Load environment variables from .env file
dotenv.config();

dotenv.config();

// Validate and get typed configuration
const { error, value: config } = configSchema.validate(process.env, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
    stripUnknown: false,
});

if (error) {
    throw new Error(`Configuration validation error: ${error.message}`);
}

// Now config is fully validated and typed - no need for manual conversion
export const getConfig = () => {
    const corsOrigins = typeof config.CORS_ORIGIN === 'string'
        ? config.CORS_ORIGIN.split(',').map((origin: string) => origin.trim()).filter(Boolean)
        : config.CORS_ORIGIN;

    return {
        // Environment helpers
        isDevelopment: config.NODE_ENV === 'development',
        isProduction: config.NODE_ENV === 'production',
        isTest: config.NODE_ENV === 'test',

        logLevel: config.NODE_ENV === 'development' ? 'debug' :
            config.NODE_ENV === 'production' ? 'info' : 'warning',

        server: {
            port: config.PORT,
            nodeEnv: config.NODE_ENV,
            cors: {
                origin: corsOrigins,
                methods: config.CORS_METHODS,
                credentials: true
            }
        },

        socket: {
            transports: config.SOCKET_TRANSPORTS,
            timeout: config.SOCKET_TIMEOUT,
            reconnection: config.SOCKET_RECONNECTION,
            reconnectionAttempts: config.SOCKET_RECONNECTION_ATTEMPTS,
            reconnectionDelay: config.SOCKET_RECONNECTION_DELAY
        },

        room: {
            timeoutDuration: config.ROOM_TIMEOUT_DURATION,
            participantReconnectionWindow: config.ROOM_PARTICIPANTS_RECONNECTION_WINDOW,
            cleanupInterval: config.ROOM_CLEANUP_INTERVAL,
            maxParticipants: config.ROOM_MAX_PARTICIPANTS,
            maxRooms: config.ROOM_MAX_ROOMS,
            maxInactiveRooms: config.ROOM_MAX_INACTIVE_ROOMS,
            maxExpiredTokens: config.ROOM_MAX_EXPIRED_TOKENS
        },

        turnServer: {
            secret: config.COTURN_SECRET,
            url: config.COTURN_SERVER_URL,
            port: config.COTURN_SERVER_PORT,
            tlsPort: config.COTURN_TLS_PORT
        }
    };
};