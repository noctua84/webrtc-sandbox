// server/src/validation/event.validation.ts
// Validation schemas for event management

import Joi from 'joi';

/**
 * Schema for creating new events
 */
export const createEventSchema = Joi.object({
    eventId: Joi.string()
        .required()
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .min(3)
        .max(100)
        .messages({
            'string.empty': 'Event ID is required',
            'string.pattern.base': 'Event ID must contain only alphanumeric characters, hyphens, and underscores',
            'string.min': 'Event ID must be at least 3 characters long',
            'string.max': 'Event ID must not exceed 100 characters'
        }),

    eventTitle: Joi.string()
        .required()
        .trim()
        .min(1)
        .max(200)
        .messages({
            'string.empty': 'Event title is required',
            'string.min': 'Event title must be at least 1 character long',
            'string.max': 'Event title must not exceed 200 characters'
        }),

    eventDescription: Joi.string()
        .optional()
        .allow('')
        .max(1000)
        .messages({
            'string.max': 'Event description must not exceed 1000 characters'
        }),

    scheduledStartTime: Joi.date()
        .iso()
        .required()
        .min('now')
        .messages({
            'date.base': 'Scheduled start time must be a valid date',
            'date.format': 'Scheduled start time must be in ISO format',
            'date.min': 'Scheduled start time must be in the future',
            'any.required': 'Scheduled start time is required'
        }),

    hostUserId: Joi.string()
        .required()
        .trim()
        .min(1)
        .max(100)
        .messages({
            'string.empty': 'Host user ID is required',
            'string.min': 'Host user ID must be at least 1 character long',
            'string.max': 'Host user ID must not exceed 100 characters'
        }),

    hostUserName: Joi.string()
        .required()
        .trim()
        .min(1)
        .max(100)
        .messages({
            'string.empty': 'Host user name is required',
            'string.min': 'Host user name must be at least 1 character long',
            'string.max': 'Host user name must not exceed 100 characters'
        }),

    hostEmail: Joi.string()
        .required()
        .email()
        .messages({
            'string.empty': 'Host email is required',
            'string.email': 'Host email must be a valid email address'
        }),

    maxParticipants: Joi.number()
        .integer()
        .min(2)
        .max(1000)
        .default(10)
        .messages({
            'number.base': 'Max participants must be a number',
            'number.integer': 'Max participants must be an integer',
            'number.min': 'Max participants must be at least 2',
            'number.max': 'Max participants must not exceed 1000'
        }),

    timeoutDuration: Joi.number()
        .integer()
        .min(300000) // 5 minutes minimum
        .max(43200000) // 12 hours maximum
        .default(7200000) // 2 hours default
        .messages({
            'number.base': 'Timeout duration must be a number',
            'number.integer': 'Timeout duration must be an integer',
            'number.min': 'Timeout duration must be at least 5 minutes (300000ms)',
            'number.max': 'Timeout duration must not exceed 12 hours (43200000ms)'
        })
});

/**
 * Schema for booking participants
 */
export const bookParticipantSchema = Joi.object({
    eventId: Joi.string()
        .required()
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .min(3)
        .max(100)
        .messages({
            'string.empty': 'Event ID is required',
            'string.pattern.base': 'Event ID must contain only alphanumeric characters, hyphens, and underscores'
        }),

    userId: Joi.string()
        .required()
        .trim()
        .min(1)
        .max(100)
        .messages({
            'string.empty': 'User ID is required',
            'string.min': 'User ID must be at least 1 character long',
            'string.max': 'User ID must not exceed 100 characters'
        }),

    userName: Joi.string()
        .required()
        .trim()
        .min(1)
        .max(100)
        .messages({
            'string.empty': 'User name is required',
            'string.min': 'User name must be at least 1 character long',
            'string.max': 'User name must not exceed 100 characters'
        }),

    userEmail: Joi.string()
        .required()
        .email()
        .messages({
            'string.empty': 'User email is required',
            'string.email': 'User email must be a valid email address'
        })
});

/**
 * Schema for cancelling bookings
 */
export const cancelBookingSchema = Joi.object({
    eventId: Joi.string()
        .required()
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .min(3)
        .max(100)
        .messages({
            'string.empty': 'Event ID is required',
            'string.pattern.base': 'Event ID must contain only alphanumeric characters, hyphens, and underscores'
        }),

    userId: Joi.string()
        .required()
        .trim()
        .min(1)
        .max(100)
        .messages({
            'string.empty': 'User ID is required',
            'string.min': 'User ID must be at least 1 character long',
            'string.max': 'User ID must not exceed 100 characters'
        })
});

/**
 * Schema for joining events
 */
export const joinEventSchema = Joi.object({
    eventId: Joi.string()
        .required()
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .min(3)
        .max(100)
        .messages({
            'string.empty': 'Event ID is required',
            'string.pattern.base': 'Event ID must contain only alphanumeric characters, hyphens, and underscores'
        }),

    userId: Joi.string()
        .required()
        .trim()
        .min(1)
        .max(100)
        .messages({
            'string.empty': 'User ID is required',
            'string.min': 'User ID must be at least 1 character long',
            'string.max': 'User ID must not exceed 100 characters'
        })
});

/**
 * Schema for closing events
 */
export const closeEventSchema = Joi.object({
    eventId: Joi.string()
        .required()
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .min(3)
        .max(100)
        .messages({
            'string.empty': 'Event ID is required',
            'string.pattern.base': 'Event ID must contain only alphanumeric characters, hyphens, and underscores'
        }),

    hostUserId: Joi.string()
        .required()
        .trim()
        .min(1)
        .max(100)
        .messages({
            'string.empty': 'Host user ID is required',
            'string.min': 'Host user ID must be at least 1 character long',
            'string.max': 'Host user ID must not exceed 100 characters'
        })
});

/**
 * Schema for updating events
 */
export const updateEventSchema = Joi.object({
    eventId: Joi.string()
        .required()
        .pattern(/^[a-zA-Z0-9\-_]+$/)
        .min(3)
        .max(100)
        .messages({
            'string.empty': 'Event ID is required',
            'string.pattern.base': 'Event ID must contain only alphanumeric characters, hyphens, and underscores'
        }),

    eventTitle: Joi.string()
        .optional()
        .trim()
        .min(1)
        .max(200)
        .messages({
            'string.min': 'Event title must be at least 1 character long',
            'string.max': 'Event title must not exceed 200 characters'
        }),

    eventDescription: Joi.string()
        .optional()
        .allow('')
        .max(1000)
        .messages({
            'string.max': 'Event description must not exceed 1000 characters'
        }),

    scheduledStartTime: Joi.date()
        .iso()
        .optional()
        .min('now')
        .messages({
            'date.base': 'Scheduled start time must be a valid date',
            'date.format': 'Scheduled start time must be in ISO format',
            'date.min': 'Scheduled start time must be in the future'
        }),

    maxParticipants: Joi.number()
        .integer()
        .min(2)
        .max(1000)
        .optional()
        .messages({
            'number.base': 'Max participants must be a number',
            'number.integer': 'Max participants must be an integer',
            'number.min': 'Max participants must be at least 2',
            'number.max': 'Max participants must not exceed 1000'
        }),

    timeoutDuration: Joi.number()
        .integer()
        .min(300000) // 5 minutes minimum
        .max(43200000) // 12 hours maximum
        .optional()
        .messages({
            'number.base': 'Timeout duration must be a number',
            'number.integer': 'Timeout duration must be an integer',
            'number.min': 'Timeout duration must be at least 5 minutes (300000ms)',
            'number.max': 'Timeout duration must not exceed 12 hours (43200000ms)'
        })
});

/**
 * Schema for event filters
 */
export const eventFiltersSchema = Joi.object({
    status: Joi.string()
        .optional()
        .valid('scheduled', 'active', 'closed')
        .messages({
            'any.only': 'Status must be one of: scheduled, active, closed'
        }),

    hostUserId: Joi.string()
        .optional()
        .trim()
        .min(1)
        .max(100)
        .messages({
            'string.min': 'Host user ID must be at least 1 character long',
            'string.max': 'Host user ID must not exceed 100 characters'
        }),

    dateFrom: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.base': 'Date from must be a valid date',
            'date.format': 'Date from must be in ISO format'
        }),

    dateTo: Joi.date()
        .iso()
        .optional()
        .min(Joi.ref('dateFrom'))
        .messages({
            'date.base': 'Date to must be a valid date',
            'date.format': 'Date to must be in ISO format',
            'date.min': 'Date to must be after date from'
        }),

    limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .optional()
        .messages({
            'number.base': 'Limit must be a number',
            'number.integer': 'Limit must be an integer',
            'number.min': 'Limit must be at least 1',
            'number.max': 'Limit must not exceed 1000'
        }),

    offset: Joi.number()
        .integer()
        .min(0)
        .default(0)
        .optional()
        .messages({
            'number.base': 'Offset must be a number',
            'number.integer': 'Offset must be an integer',
            'number.min': 'Offset must be at least 0'
        })
});

/**
 * Schema for analytics date range
 */
export const analyticsRangeSchema = Joi.object({
    from: Joi.date()
        .iso()
        .required()
        .messages({
            'date.base': 'From date must be a valid date',
            'date.format': 'From date must be in ISO format',
            'any.required': 'From date is required'
        }),

    to: Joi.date()
        .iso()
        .required()
        .min(Joi.ref('from'))
        .messages({
            'date.base': 'To date must be a valid date',
            'date.format': 'To date must be in ISO format',
            'date.min': 'To date must be after from date',
            'any.required': 'To date is required'
        }),

    granularity: Joi.string()
        .optional()
        .valid('hour', 'day', 'week', 'month')
        .default('day')
        .messages({
            'any.only': 'Granularity must be one of: hour, day, week, month'
        })
});