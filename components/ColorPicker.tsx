import React, { useState } from 'react';
import { Label } from "@/components/ui/label";

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  id?: string;
  className?: string;
}

export function ColorPicker({ label, value, onChange, id, className = "" }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={id || `color-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {label}
      </Label>
      
      <div className="relative">
        {/* Color Display Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 w-full p-3 bg-white/80 border border-gray-300 rounded-lg hover:bg-gray-50 focus:border-gray-500 focus:outline-none transition-colors"
        >
          {/* Color Swatch */}
          <div 
            className="w-6 h-6 rounded-md border-2 border-gray-200 shadow-sm"
            style={{ backgroundColor: value }}
          />
          
          {/* Color Value */}
          <span className="text-sm font-mono text-gray-700 uppercase">
            {value}
          </span>
          
          {/* Chevron Icon */}
          <svg 
            className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Hidden Native Color Input */}
        <input
          type="color"
          id={id || `color-${label.toLowerCase().replace(/\s+/g, '-')}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

export default ColorPicker;