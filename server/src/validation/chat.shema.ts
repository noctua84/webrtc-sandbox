import Joi from 'joi';

export const sendMessageSchema = Joi.object({
    roomId: Joi.string().min(1).required().messages({
        'string.empty': 'Room ID is required',
        'any.required': 'Room ID is required'
    }),
    content: Joi.string().min(1).max(1000).required().messages({
        'string.empty': 'Message content is required',
        'string.max': 'Message cannot exceed 1000 characters',
        'any.required': 'Message content is required'
    }),
    type: Joi.string().valid('text', 'emoji').default('text'),
    replyTo: Joi.string().optional(),
    mentions: Joi.array().items(Joi.string()).default([])
});

export const editMessageSchema = Joi.object({
    roomId: Joi.string().min(1).required().messages({
        'string.empty': 'Room ID is required',
        'any.required': 'Room ID is required'
    }),
    messageId: Joi.string().min(1).required().messages({
        'string.empty': 'Message ID is required',
        'any.required': 'Message ID is required'
    }),
    newContent: Joi.string().min(1).max(1000).required().messages({
        'string.empty': 'New content is required',
        'string.max': 'Message cannot exceed 1000 characters',
        'any.required': 'New content is required'
    })
});

export const deleteMessageSchema = Joi.object({
    roomId: Joi.string().min(1).required().messages({
        'string.empty': 'Room ID is required',
        'any.required': 'Room ID is required'
    }),
    messageId: Joi.string().min(1).required().messages({
        'string.empty': 'Message ID is required',
        'any.required': 'Message ID is required'
    })
});

export const typingIndicatorSchema = Joi.object({
    roomId: Joi.string().min(1).required().messages({
        'string.empty': 'Room ID is required',
        'any.required': 'Room ID is required'
    }),
    isTyping: Joi.boolean().required().messages({
        'any.required': 'Typing state is required'
    })
});

export const addReactionSchema = Joi.object({
    roomId: Joi.string().min(1).required(),
    messageId: Joi.string().min(1).required(),
    emoji: Joi.string().min(1).max(10).required().messages({
        'string.max': 'Emoji too long'
    })
});

export const removeReactionSchema = Joi.object({
    roomId: Joi.string().min(1).required(),
    messageId: Joi.string().min(1).required(),
    emoji: Joi.string().min(1).max(10).required()
});