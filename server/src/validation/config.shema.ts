import Joi from "joi";

// Helper for comma-separated string to array conversion
const commaSeparatedArray = (validValues?: string[]) => {
    return Joi.alternatives().try(
        Joi.array().items(validValues ? Joi.string().valid(...validValues) : Joi.string()),
        Joi.string().custom((value) => {
            return value.split(',').map((item: string) => item.trim()).filter(Boolean);
        })
    );
};

export const configSchema = Joi.object({
    // Server configuration
    PORT: Joi.number().port().default(3001),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

    // CORS configuration
    CORS_ORIGIN: Joi.string().allow('').default('http://localhost:5173,http://localhost:3000'),
    CORS_METHODS: commaSeparatedArray(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']).default(['GET', 'POST']),

    // Socket.IO configuration
    SOCKET_TRANSPORTS: commaSeparatedArray(['websocket', 'polling']).default(['websocket', 'polling']),
    SOCKET_TIMEOUT: Joi.number().min(1000).max(60000).default(10000),
    SOCKET_RECONNECTION: Joi.boolean().default(true),
    SOCKET_RECONNECTION_ATTEMPTS: Joi.number().min(1).max(20).default(5),
    SOCKET_RECONNECTION_DELAY: Joi.number().min(100).max(10000).default(1000),

    // Room configuration
    ROOM_TIMEOUT_DURATION: Joi.number().min(60).default(30 * 60).custom((value) => value * 1000, 'Convert seconds to milliseconds'),
    ROOM_PARTICIPANTS_RECONNECTION_WINDOW: Joi.number().min(10).default(5 * 60).custom((value) => value * 1000, 'Convert seconds to milliseconds'),
    ROOM_CLEANUP_INTERVAL: Joi.number().min(20).default(10 * 60).custom((value) => value * 1000, 'Convert seconds to milliseconds'),
    ROOM_MAX_PARTICIPANTS: Joi.number().min(2).max(50).default(10),
    ROOM_MAX_ROOMS: Joi.number().min(1).default(100),
    ROOM_MAX_INACTIVE_ROOMS: Joi.number().min(0).max(1000).default(50),
    ROOM_MAX_EXPIRED_TOKENS: Joi.number().min(100).max(100000).default(1000),

    // TURN server configuration
    COTURN_SECRET: Joi.string().min(8).required(),
    COTURN_SERVER_URL: Joi.string().required(),
    COTURN_SERVER_PORT: Joi.number().port().default(3478),
    COTURN_TLS_PORT: Joi.number().port().default(5349),

    // Database configuration
    DATABASE_URL: Joi.string().uri().required(),
})
    .custom((value, helpers) => {
        if (value.ROOM_TIMEOUT_DURATION <= value.ROOM_PARTICIPANTS_RECONNECTION_WINDOW) {
            return helpers.error('room.timeout.invalid', {
                message: 'Room timeout duration must be longer than participant reconnection window'
            });
        }

        if (value.ROOM_MAX_INACTIVE_ROOMS > value.ROOM_MAX_ROOMS) {
            return helpers.error('room.limits.invalid', {
                message: 'Maximum inactive rooms cannot exceed maximum rooms'
            });
        }

        if (value.COTURN_SERVER_PORT === value.COTURN_TLS_PORT) {
            return helpers.error('coturn.ports.duplicate', {
                message: 'COTURN server port and TLS port must be different'
            });
        }

        return value;
    }).messages({
        'room.timeout.invalid': 'Room timeout duration must be longer than participant reconnection window',
        'room.limits.invalid': 'Maximum inactive rooms cannot exceed maximum rooms',
        'coturn.ports.duplicate': 'COTURN server port and TLS port must be different'
    });