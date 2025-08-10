import { Router, Request, Response } from 'express';
import { Container } from '../di';
import joi from "joi";

const validateWith = (schema: joi.Schema, data: any) => {
    return schema.validate(data);
}

export function createEventEndpoints(container: Container): Router {
    const router = Router();

    const eventManager = container.get<'eventManager'>('eventManager');
    const logger = container.get<'logger'>('logger');
    const metrics = container.get<'metrics'>('metrics');
    const schema = container.get<'schemas'>('schemas');

    /**
     * POST /events - Create a new event with dedicated room
     * Platform creates event with available seats
     */
    router.post('/events', async (req: Request, res: Response) => {
        try {
            const startTime = Date.now();

            const { error, value } = validateWith(schema.createEvent, req.body);
            if (error) {
                logger.warning('Event creation validation failed', {
                    error: error.details.map(d => d.message).join(', '),
                    body: req.body
                });
                metrics.recordHttpError('POST', '/events', 'validation_error', 400);
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed: ' + error.details.map(d => d.message).join(', '),
                    code: 'VALIDATION_ERROR'
                });
            }

            const result = await eventManager.createEvent(value);

            if (!result.success) {
                logger.error('Event creation failed', {
                    error: result.error,
                    request: value
                });
                metrics.recordHttpError('POST', '/events', 'creation_error', 400);
                return res.status(400).json({
                    success: false,
                    error: result.error,
                    code: 'EVENT_CREATION_FAILED'
                });
            }

            logger.info('Event created successfully', {
                eventId: result.event!.eventId,
                roomId: result.event!.roomId,
                hostUserId: value.hostUserId,
                maxParticipants: result.event!.maxParticipants
            });

            const duration = Date.now() - startTime;
            metrics.recordHttpRequest('POST', '/events', 201, duration);

            return res.status(201).json(result);

        } catch (error) {
            const err = error as Error;
            logger.error('Event creation error', { error: err.message, stack: err.stack });
            metrics.recordHttpError('POST', '/events', 'server_error', 500);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    });

    /**
     * POST /events/:eventId/book - Book a seat for the event
     * Users book their participation
     */
    router.post('/events/:eventId/book', async (req: Request, res: Response) => {
        try {
            const startTime = Date.now();

            const { eventId } = req.params;
            const { error, value } = validateWith(schema.bookParticipant, req.body);

            if (error) {
                metrics.recordHttpError('POST', '/events/:eventId/book', 'validation_error', 400);
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed: ' + error.details.map(d => d.message).join(', '),
                    code: 'VALIDATION_ERROR'
                });
            }

            const result = await eventManager.bookParticipant(value);

            if (!result.success) {
                logger.warning('Participant booking failed', {
                    eventId,
                    userId: value.userId,
                    error: result.error
                });

                const statusCode = result.error?.includes('already booked') ? 409 :
                    result.error?.includes('fully booked') ? 409 :
                        result.error?.includes('not found') ? 404 : 400;

                metrics.recordHttpError('POST', '/events/:eventId/book', 'booking_error', statusCode);
                return res.status(statusCode).json({
                    success: false,
                    error: result.error,
                    code: result.error?.includes('already booked') ? 'ALREADY_BOOKED' :
                        result.error?.includes('fully booked') ? 'EVENT_FULL' :
                            result.error?.includes('not found') ? 'EVENT_NOT_FOUND' : 'BOOKING_FAILED'
                });
            }

            logger.info('Participant booked successfully', {
                eventId,
                userId: value.userId,
                userName: value.userName
            });

            const duration = Date.now() - startTime;
            metrics.recordHttpRequest('POST', '/events/:eventId/book', 201, duration);

            return res.status(201).json(result);

        } catch (error) {
            const err = error as Error;
            logger.error('Booking error', { error: err.message, eventId: req.params.eventId });
            metrics.recordHttpError('POST', '/events/:eventId/book', 'server_error', 500);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    });

    /**
     * DELETE /events/:eventId/book - Cancel booking
     * Users cancel their participation
     */
    router.delete('/events/:eventId/book', async (req: Request, res: Response) => {
        try {
            const startTime = Date.now();

            const { eventId } = req.params;
            const { error, value } = validateWith(schema.cancelBooking, req.body);

            if (error) {
                metrics.recordHttpError('DELETE', '/events/:eventId/book', 'validation_error', 400);
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed: ' + error.details.map(d => d.message).join(', '),
                    code: 'VALIDATION_ERROR'
                });
            }

            const result = await eventManager.cancelBooking(value);

            if (!result.success) {
                const statusCode = result.error?.includes('not found') ? 404 : 400;
                metrics.recordHttpError('DELETE', '/events/:eventId/book', 'cancellation_error', statusCode);
                return res.status(statusCode).json({
                    success: false,
                    error: result.error,
                    code: result.error?.includes('not found') ? 'BOOKING_NOT_FOUND' : 'CANCELLATION_FAILED'
                });
            }

            logger.info('Booking cancelled successfully', {
                eventId,
                userId: value.userId
            });

            const duration = Date.now() - startTime;
            metrics.recordHttpRequest('DELETE', '/events/:eventId/book', 200, duration);
            return res.json({ success: true });

        } catch (error) {
            const err = error as Error;
            logger.error('Cancellation error', { error: err.message, eventId: req.params.eventId });
            metrics.recordHttpError('DELETE', '/events/:eventId/book', 'server_error', 500);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    });

    /**
     * POST /events/:eventId/close - Close event (host only)
     * Host closes the event, making room non-accessible
     */
    router.post('/events/:eventId/close', async (req: Request, res: Response) => {
        try {
            const startTime = Date.now();

            const { eventId } = req.params;
            const { error, value } = validateWith(schema.closeEvent, req.body);

            if (error) {
                metrics.recordHttpError('POST', '/events/:eventId/close', 'validation_error', 400);
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed: ' + error.details.map(d => d.message).join(', '),
                    code: 'VALIDATION_ERROR'
                });
            }

            const result = await eventManager.closeEvent(value);

            if (!result.success) {
                const statusCode = result.error?.includes('not found') ? 404 :
                    result.error?.includes('not authorized') ? 403 : 400;

                metrics.recordHttpError('POST', '/events/:eventId/close', 'close_error', statusCode);
                return res.status(statusCode).json({
                    success: false,
                    error: result.error,
                    code: result.error?.includes('not found') ? 'EVENT_NOT_FOUND' :
                        result.error?.includes('not authorized') ? 'NOT_AUTHORIZED' : 'CLOSE_FAILED'
                });
            }

            logger.info('Event closed successfully', {
                eventId,
                hostUserId: value.hostUserId,
                closedAt: new Date().toISOString()
            });

            metrics.recordHttpRequest('POST', '/events/:eventId/close', 200, Date.now() - startTime);
            return res.json(result);

        } catch (error) {
            const err = error as Error;
            logger.error('Event close error', { error: err.message, eventId: req.params.eventId });
            metrics.recordHttpError('POST', '/events/:eventId/close', 'server_error', 500);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    });

    /**
     * GET /events/:eventId - Get event details and bookings
     * Platform checks event status and booking info
     */
    router.get('/events/:eventId', async (req: Request, res: Response) => {
        try {
            const startTime = Date.now();

            const { eventId } = req.params;
            const event = await eventManager.getEventDetails(eventId as string);

            if (!event) {
                metrics.recordHttpError('GET', '/events/:eventId', 'not_found', 404);
                return res.status(404).json({
                    success: false,
                    error: 'Event not found',
                    code: 'EVENT_NOT_FOUND'
                });
            }

            metrics.recordHttpRequest('GET', '/events/:eventId', 200, Date.now() - startTime);
            return res.json({
                success: true,
                event
            });

        } catch (error) {
            const err = error as Error;
            logger.error('Get event error', { error: err.message, eventId: req.params.eventId });
            metrics.recordHttpError('GET', '/events/:eventId', 'server_error', 500);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    });

    /**
     * GET /events - Get events with statistics
     * Analytics and monitoring endpoint
     */
    router.get('/events', async (req: Request, res: Response) => {
        try {
            const startTime = Date.now();

            const filters = {
                status: req.query.status as string,
                hostUserId: req.query.hostUserId as string,
                dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
                dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
                limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
                offset: req.query.offset ? parseInt(req.query.offset as string) : 0
            };

            const result = await eventManager.getEvents(filters);

            const duration = Date.now() - startTime;
            metrics.recordHttpRequest('GET', '/events', 200, duration);
            return res.json({
                success: true,
                ...result
            });

        } catch (error) {
            const err = error as Error;
            logger.error('Get events error', { error: err.message });
            metrics.recordHttpError('GET', '/events', 'server_error', 500);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    });

    return router;
}