import React, { useState, useRef, useEffect } from 'react';

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  isLogarithmic?: boolean;
  color?: string;
  onChange: (val: number) => void;
  formatValue?: (val: number) => string;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.1,
  defaultValue,
  unit = '',
  isLogarithmic = false,
  color = '#00f0ff',
  onChange,
  formatValue
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startValRef = useRef<number>(value);

  // Map value to normalized [0, 1]
  const toNormalized = (v: number): number => {
    if (isLogarithmic) {
      const minLog = Math.log(Math.max(0.0001, min));
      const maxLog = Math.log(max);
      return Math.max(0, Math.min(1, (Math.log(Math.max(0.0001, v)) - minLog) / (maxLog - minLog)));
    }
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  };

  // Map normalized [0, 1] to value
  const fromNormalized = (n: number): number => {
    const clamped = Math.max(0, Math.min(1, n));
    if (isLogarithmic) {
      const minLog = Math.log(Math.max(0.0001, min));
      const maxLog = Math.log(max);
      return Math.exp(minLog + clamped * (maxLog - minLog));
    }
    return min + clamped * (max - min);
  };

  const normalized = toNormalized(value);
  // -135 deg to +135 deg sweep (270 deg total)
  const angleDeg = -135 + normalized * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = value;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    startYRef.current = e.touches[0].clientY;
    startValRef.current = value;
  };

  const handleDoubleClick = () => {
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startYRef.current - e.clientY;
      const sensitivity = 0.006; // 160px for full sweep
      const currentNorm = toNormalized(startValRef.current);
      const newNorm = Math.max(0, Math.min(1, currentNorm + deltaY * sensitivity));
      let newVal = fromNormalized(newNorm);
      if (step) {
        newVal = Math.round(newVal / step) * step;
      }
      onChange(Math.max(min, Math.min(max, newVal)));
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const deltaY = startYRef.current - e.touches[0].clientY;
      const sensitivity = 0.006;
      const currentNorm = toNormalized(startValRef.current);
      const newNorm = Math.max(0, Math.min(1, currentNorm + deltaY * sensitivity));
      let newVal = fromNormalized(newNorm);
      if (step) {
        newVal = Math.round(newVal / step) * step;
      }
      onChange(Math.max(min, Math.min(max, newVal)));
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, min, max, step, isLogarithmic, onChange]);

  const displayVal = formatValue ? formatValue(value) : `${value.toFixed(1)}${unit}`;

  return (
    <div className="flex flex-col items-center select-none group">
      {/* Parameter Label */}
      <span className="text-[10px] font-mono font-bold tracking-wider text-slate-300 uppercase mb-1.5 truncate max-w-[80px]">
        {label}
      </span>

      {/* Rotary Dial Body */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onDoubleClick={handleDoubleClick}
        className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full cursor-ns-resize transition-transform duration-75 flex items-center justify-center ${
          isDragging ? 'scale-105 ring-2 ring-studio-accent' : 'hover:scale-102'
        }`}
        style={{
          background: 'radial-gradient(circle at 35% 35%, #334155 0%, #1e293b 60%, #090d16 100%)',
          boxShadow: '0 6px 14px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.8)'
        }}
      >
        {/* Knurled Outer Ring Edge */}
        <div className="absolute inset-1 rounded-full border border-slate-700/60 pointer-events-none" />

        {/* Rotating Dial Cap & Indicator Line */}
        <div
          className="absolute w-full h-full rounded-full transition-transform"
          style={{ transform: `rotate(${angleDeg}deg)` }}
        >
          {/* White / Colored Pointer Notch */}
          <div
            className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-3.5 rounded-full shadow-sm"
            style={{ backgroundColor: color }}
          />
        </div>

        {/* Center Metal Cap */}
        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-700 border border-slate-600/50 shadow-inner flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-400/40" />
        </div>
      </div>

      {/* Value Display Badge */}
      <div className="mt-1.5 px-2 py-0.5 rounded-md bg-studio-950 border border-studio-800 text-[10px] font-mono font-black text-white shadow-inner min-w-[50px] text-center">
        {displayVal}
      </div>
    </div>
  );
};
