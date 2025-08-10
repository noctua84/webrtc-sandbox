// App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Calendar, Monitor, Activity, Github } from 'lucide-react';
import { socketStore } from './stores/SocketStore';
import { eventStore } from './stores/EventStore';
import { roomStore } from './stores/RoomStore';
import { ConnectionStatus } from './components/ConnectionStatus';
import { EventCreator } from './components/EventCreator';
import { EventBooking } from './components/EventBooking';
import { VideoRoom } from './components/VideoRoom';
import { LogViewer } from './components/LogViewer';
import { Button } from './components/ui/Button';
import { Card } from './components/ui/Card';

// Layout wrapper component
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-4">
                            <Link to="/" className="flex items-center space-x-2">
                                <Monitor className="w-8 h-8 text-primary-600" />
                                <span className="text-xl font-bold text-gray-900">Event Lifecycle</span>
                            </Link>

                            <nav className="hidden md:flex items-center space-x-6">
                                <Link
                                    to="/"
                                    className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        location.pathname === '/'
                                            ? 'bg-primary-100 text-primary-700'
                                            : 'text-gray-700 hover:text-primary-600'
                                    }`}
                                >
                                    <Calendar className="w-4 h-4" />
                                    <span>Create Event</span>
                                </Link>

                                <Link
                                    to="/logs"
                                    className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        location.pathname === '/logs'
                                            ? 'bg-primary-100 text-primary-700'
                                            : 'text-gray-700 hover:text-primary-600'
                                    }`}
                                >
                                    <Activity className="w-4 h-4" />
                                    <span>Logs</span>
                                </Link>
                            </nav>
                        </div>

                        <div className="flex items-center space-x-4">
                            <ConnectionStatus />
                            <a
                                href="https://github.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-700 hover:text-primary-600 transition-colors"
                            >
                                <Github className="w-5 h-5" />
                            </a>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>

            {/* Footer */}
            <footer className="bg-white border-t mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="text-center text-sm text-gray-500">
                        Event Lifecycle Demo - React + TypeScript + MobX + Socket.IO
                    </div>
                </div>
            </footer>
        </div>
    );
};

// Home page component
const HomePage: React.FC = observer(() => {
    const { currentEvent, userRole } = eventStore;
    const { isInRoom } = roomStore;

    // Show video room if user is in room
    if (isInRoom) {
        return <VideoRoom />;
    }

    // Show event management for hosts with created events
    if (currentEvent && userRole === 'host') {
        return (
            <div className="space-y-8">
                <EventCreator />
                {eventStore.canJoinEvent && (
                    <div className="max-w-2xl mx-auto">
                        <Card title="Ready to Start">
                            <div className="space-y-4">
                                <p className="text-gray-600">
                                    Your event is ready! You can now join the video room to start the session.
                                </p>
                                <VideoRoom />
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        );
    }

    // Default: show event creator
    return (
        <div className="space-y-8">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                    Event Lifecycle Demo
                </h1>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                    Complete event management system showcasing the full lifecycle:
                    create events, manage bookings, and host video conferences.
                </p>
            </div>

            <EventCreator />
        </div>
    );
});

// Event page component for participants
const EventPage: React.FC = observer(() => {
    const { isInRoom } = roomStore;
    const { currentEvent, userRole } = eventStore;

    // Show video room if user is in room
    if (isInRoom) {
        return <VideoRoom />;
    }

    // Show video room interface if user can join (booked or host)
    if (eventStore.canJoinEvent) {
        return <VideoRoom />;
    }

    // Show booking interface
    return <EventBooking />;
});

// Logs page component
const LogsPage: React.FC = () => (
    <div className="space-y-6">
        <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Logs</h1>
            <p className="text-gray-600">
                Real-time application logs showing WebSocket events, API calls, and system status.
            </p>
        </div>
        <LogViewer />
    </div>
);

// Main App component
const App: React.FC = observer(() => {
    useEffect(() => {
        // Initialize socket store logging
        socketStore.log('info', 'Event Lifecycle application started');

        // Cleanup on unmount
        return () => {
            socketStore.disconnect();
            eventStore.reset();
            roomStore.reset();
        };
    }, []);

    return (
        <Router>
            <Layout>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/event/:eventId" element={<EventPage />} />
                    <Route path="/logs" element={<LogsPage />} />

                    {/* Catch-all route */}
                    <Route
                        path="*"
                        element={
                            <div className="text-center py-12">
                                <h2 className="text-2xl font-bold text-gray-900 mb-4">Page Not Found</h2>
                                <p className="text-gray-600 mb-6">
                                    The page you're looking for doesn't exist.
                                </p>
                                <Link to="/">
                                    <Button>Go Home</Button>
                                </Link>
                            </div>
                        }
                    />
                </Routes>
            </Layout>
        </Router>
    );
});

export default App;