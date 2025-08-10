// components/ui/Input.tsx
import React from "react";

interface InputProps {
    label?: string;
    type?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    error?: string;
    className?: string;
}

export const Input: React.FC<InputProps> = ({
                                                label,
                                                type = 'text',
                                                value,
                                                onChange,
                                                placeholder,
                                                required = false,
                                                error,
                                                className = ''
                                            }) => {
    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                    {required && <span className="text-error-500 ml-1">*</span>}
                </label>
            )}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                className={`
          block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 
          focus:outline-none focus:ring-primary-500 focus:border-primary-500
          ${error ? 'border-error-500' : 'border-gray-300'}
        `}
            />
            {error && (
                <p className="mt-1 text-sm text-error-600">{error}</p>
            )}
        </div>
    );
};