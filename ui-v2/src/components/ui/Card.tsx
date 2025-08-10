// components/ui/Card.tsx
import React from "react";

interface CardProps {
    children: React.ReactNode,
    className?: string,
    title?: React.JSX.Element | string
}

export const Card: React.FC<CardProps> = ({children, title, className = ''}) => {
    return (
        <div className={`bg-white rounded-lg shadow-md border border-gray-200 ${className}`}>
            {title && (
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">{title}</h3>
                </div>
            )}
            <div className="p-6">
                {children}
            </div>
        </div>
    );
};