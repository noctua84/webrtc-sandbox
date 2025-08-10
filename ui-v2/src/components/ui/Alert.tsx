// components/ui/Alert.tsx
import React from "react";

interface AlertProps {
    children: React.ReactNode;
    variant?: 'info' | 'success' | 'warning' | 'error';
    className?: string;
}

export const Alert: React.FC<AlertProps> = ({
                                                children,
                                                variant = 'info',
                                                className = ''
                                            }) => {
    const variantClasses = {
        info: 'bg-primary-50 border-primary-200 text-primary-800',
        success: 'bg-success-50 border-success-200 text-success-800',
        warning: 'bg-warning-50 border-warning-200 text-warning-800',
        error: 'bg-error-50 border-error-200 text-error-800'
    };

    return (
        <div className={`border rounded-md p-4 ${variantClasses[variant]} ${className}`}>
            {children}
        </div>
    );
};