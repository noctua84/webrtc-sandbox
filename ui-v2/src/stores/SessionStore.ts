// stores/SessionStore.ts
import { makeObservable, observable, action, computed } from 'mobx';
import type { EventBooking } from '../types';

interface UserSession {
    userId?: string;
    userName?: string;
    userEmail?: string;
    hostedEvents: string[]; // Event IDs the user has created
    bookings: Record<string, EventBooking>; // eventId -> booking
}

class SessionStore {
    session: UserSession = {
        hostedEvents: [],
        bookings: {}
    };

    constructor() {
        makeObservable(this, {
            session: observable,
            setUserInfo: action,
            addHostedEvent: action,
            addBooking: action,
            clearSession: action,
            userInfo: computed
        });

        // Load from sessionStorage on init
        this.loadFromStorage();
    }

    setUserInfo(userId: string, userName: string, userEmail: string): void {
        this.session.userId = userId;
        this.session.userName = userName;
        this.session.userEmail = userEmail;
        this.saveToStorage();
    }

    addHostedEvent(eventId: string): void {
        if (!this.session.hostedEvents.includes(eventId)) {
            this.session.hostedEvents.push(eventId);
            this.saveToStorage();
        }
    }

    addBooking(eventId: string, booking: EventBooking): void {
        this.session.bookings[eventId] = booking;
        this.saveToStorage();
    }

    clearSession(): void {
        this.session = {
            hostedEvents: [],
            bookings: {}
        };
        this.saveToStorage();
    }

    isHost(eventId: string): boolean {
        return this.session.hostedEvents.includes(eventId);
    }

    hasBooking(eventId: string): boolean {
        return !!this.session.bookings[eventId];
    }

    getBooking(eventId: string): EventBooking | null {
        return this.session.bookings[eventId] || null;
    }

    get userInfo() {
        return {
            userId: this.session.userId,
            userName: this.session.userName,
            userEmail: this.session.userEmail
        };
    }

    private saveToStorage(): void {
        try {
            sessionStorage.setItem('eventLifecycleSession', JSON.stringify(this.session));
        } catch (error) {
            console.warn('Failed to save session to storage:', error);
        }
    }

    private loadFromStorage(): void {
        try {
            const stored = sessionStorage.getItem('eventLifecycleSession');
            if (stored) {
                this.session = { ...this.session, ...JSON.parse(stored) };
            }
        } catch (error) {
            console.warn('Failed to load session from storage:', error);
        }
    }
}

export const sessionStore = new SessionStore();