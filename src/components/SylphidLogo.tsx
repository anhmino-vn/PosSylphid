import React from 'react';

interface SylphidLogoProps {
  className?: string;
}

export function SylphidLogo({ className = "w-16 h-16" }: SylphidLogoProps) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer Blue Circle */}
      <circle cx="50" cy="50" r="48" fill="#0b66c3" />
      {/* Inner Concentric White Ring */}
      <circle cx="50" cy="50" r="42" fill="none" stroke="white" stroke-width="3" />
      {/* Text SH */}
      <text 
        x="50" 
        y="65" 
        fontFamily="'Inter', system-ui, -apple-system, sans-serif" 
        fontWeight="800" 
        fontSize="40" 
        fill="white" 
        textAnchor="middle"
        letterSpacing="-1"
      >
        SH
      </text>
    </svg>
  );
}
