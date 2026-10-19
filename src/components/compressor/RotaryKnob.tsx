import React, { useState, useRef, useCallback } from 'react';

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  isLogarithmic?: boolean;
  isRatioCurve?: boolean;
  color?: string;
  size?: 'sm' | 'md';
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
  isRatioCurve = false,
  color = '#00f0ff',
  size = 'md',
  onChange,
  formatValue
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startNormRef = useRef<number>(0);
  const lastTapRef = useRef<number>(0);

  // Map value to normalized [0, 1]
  const toNormalized = useCallback((v: number): number => {
    if (isRatioCurve) {
      if (v >= 50) return 1.0;
      if (v > 8.0) {
        const t = Math.max(0, Math.min(1, (v - 8.0) / 12.0));
        return 0.5 + t * 0.44; // 8:1 to 20:1 covers 0.50 to 0.94
      }
      const t = Math.max(0, Math.min(1, (v - 1.0) / 7.0));
      return t * 0.5; // 1:1 to 8:1 covers the first half (0 to 0.5)
    }
    if (isLogarithmic) {
      const minLog = Math.log(Math.max(0.0001, min));
      const maxLog = Math.log(max);
      return Math.max(0, Math.min(1, (Math.log(Math.max(0.0001, v)) - minLog) / (maxLog - minLog)));
    }
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  }, [isLogarithmic, isRatioCurve, min, max]);

  // Map normalized [0, 1] to value
  const fromNormalized = useCallback((n: number): number => {
    const clamped = Math.max(0, Math.min(1, n));
    if (isRatioCurve) {
      if (clamped >= 0.94) return 100.0; // Brickwall limiting at very end
      if (clamped > 0.5) {
        const t = (clamped - 0.5) / 0.44;
        return 8.0 + t * 12.0; // 8:1 to 20:1
      }
      const t = clamped / 0.5;
      return 1.0 + t * 7.0; // 1:1 to 8:1
    }
    if (isLogarithmic) {
      const minLog = Math.log(Math.max(0.0001, min));
      const maxLog = Math.log(max);
      return Math.exp(minLog + clamped * (maxLog - minLog));
    }
    return min + clamped * (max - min);
  }, [isLogarithmic, isRatioCurve, min, max]);

  const normalized = toNormalized(value);
  // -135 deg to +135 deg sweep (270 deg total)
  const angleDeg = -135 + normalized * 270;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Check for double-tap on touchscreens
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (defaultValue !== undefined) {
        onChange(defaultValue);
      }
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    setIsDragging(true);
    startYRef.current = e.clientY;
    startNormRef.current = toNormalized(value);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();

    // Natural touch sensitivity: ~170px of vertical drag covers the full 270° dial range
    // Hold Shift on desktop for precision mode (0.2x speed)
    const speed = e.shiftKey ? 0.0015 : 0.006;
    const deltaY = startYRef.current - e.clientY;
    const newNorm = Math.max(0, Math.min(1, startNormRef.current + deltaY * speed));

    let newVal = fromNormalized(newNorm);
    if (isRatioCurve) {
      if (newVal >= 50) {
        newVal = 100.0;
      } else if (newVal > 8.0) {
        newVal = Math.round(newVal * 2) / 2; // 0.5 step for higher ratios
      } else {
        newVal = Math.round(newVal * 10) / 10; // 0.1 step for subtle ratios
      }
    } else if (step) {
      newVal = Math.round(newVal / step) * step;
    }
    onChange(Math.max(min, Math.min(max, newVal)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setIsDragging(false);
    }
  };

  const handleDoubleClick = () => {
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  };

  const displayVal = formatValue ? formatValue(value) : `${value.toFixed(1)}${unit}`;

  const isSmall = size === 'sm';

  return (
    <div className="flex flex-col items-center select-none group touch-none">
      {/* Parameter Label */}
      <span className={`font-mono font-bold tracking-wider text-slate-300 uppercase mb-1.5 truncate text-center ${
        isSmall ? 'text-[9px] max-w-[70px]' : 'text-[10px] max-w-[85px]'
      }`}>
        {label}
      </span>

      {/* Rotary Dial Body */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className={`relative rounded-full cursor-ns-resize flex items-center justify-center touch-none transition-transform duration-75 ${
          isSmall ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-16 h-16 sm:w-20 sm:h-20'
        } ${
          isDragging ? 'scale-105 ring-2 ring-studio-accent' : 'hover:scale-102'
        }`}
        style={{
          background: 'radial-gradient(circle at 35% 35%, #334155 0%, #1e293b 60%, #090d16 100%)',
          boxShadow: isDragging
            ? '0 6px 18px rgba(0,0,0,0.7), inset 0 2px 4px rgba(255,255,255,0.18), 0 0 12px rgba(0,240,255,0.45)'
            : '0 5px 14px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.12)'
        }}
        title={`${label}: ${displayVal} (Drag up/down, double-tap to reset)`}
      >
        {/* Knurled Outer Ring Edge */}
        <div className="absolute inset-1 rounded-full border border-slate-700/60 pointer-events-none" />

        {/* Rotating Dial Cap & Indicator Notch */}
        <div
          className="absolute w-full h-full rounded-full pointer-events-none"
          style={{ transform: `rotate(${angleDeg}deg)` }}
        >
          {/* White / Colored Pointer Notch */}
          <div
            className={`absolute top-1 left-1/2 -translate-x-1/2 rounded-full shadow-md ${
              isSmall ? 'w-1 h-2.5' : 'w-1.5 h-4'
            }`}
            style={{ backgroundColor: color }}
          />
        </div>

        {/* Center Metal Cap */}
        <div className={`rounded-full bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-700 border border-slate-600/60 shadow-inner flex items-center justify-center pointer-events-none ${
          isSmall ? 'w-5 h-5 sm:w-6 sm:h-6' : 'w-7 h-7 sm:w-9 sm:h-9'
        }`}>
          <div className="w-1.5 h-1.5 rounded-full bg-slate-400/40" />
        </div>
      </div>

      {/* Value Display Badge */}
      <div className={`mt-1.5 rounded-lg bg-studio-950 border border-studio-800 font-mono font-bold text-white shadow-inner text-center ${
        isSmall ? 'px-1.5 py-0.5 text-[9.5px] min-w-[48px]' : 'px-2.5 py-0.5 text-[11px] min-w-[56px] mt-2'
      }`}>
        {displayVal}
      </div>
    </div>
  );
};
