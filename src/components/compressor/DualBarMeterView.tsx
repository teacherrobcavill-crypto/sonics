import React, { useState, useEffect } from 'react';
import { CompressorTelemetry } from '../../types/compressor';

interface DualBarMeterViewProps {
  telemetry: CompressorTelemetry;
  isBypassed?: boolean;
}

export const DualBarMeterView: React.FC<DualBarMeterViewProps> = ({ telemetry, isBypassed }) => {
  const [inPeakHold, setInPeakHold] = useState<number>(-60);
  const [grPeakHold, setGrPeakHold] = useState<number>(0);

  // Peak hold decay
  useEffect(() => {
    const currentInPeak = Math.max(telemetry.inputPeakL, telemetry.inputPeakR);
    if (currentInPeak > inPeakHold) {
      setInPeakHold(currentInPeak);
    } else {
      const timer = setTimeout(() => {
        setInPeakHold(prev => Math.max(-60, prev - 1.5));
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [telemetry.inputPeakL, telemetry.inputPeakR, inPeakHold]);

  useEffect(() => {
    const currentGr = Math.abs(telemetry.gainReductionDb);
    if (currentGr > grPeakHold) {
      setGrPeakHold(currentGr);
    } else {
      const timer = setTimeout(() => {
        setGrPeakHold(prev => Math.max(0, prev - 0.8));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [telemetry.gainReductionDb, grPeakHold]);

  // Input meter percentage (-48 dBFS = 0%, +6 dBFS = 100%)
  const maxIn = Math.max(telemetry.inputRmsL, telemetry.inputRmsR);
  const inNorm = Math.max(0, Math.min(100, ((maxIn + 48) / 54) * 100));
  const inPeakNorm = Math.max(0, Math.min(100, ((inPeakHold + 48) / 54) * 100));

  // Gain reduction percentage (0 dB = 0%, 20 dB = 100%)
  const grNorm = Math.max(0, Math.min(100, (Math.abs(telemetry.gainReductionDb) / 20) * 100));
  const grPeakNorm = Math.max(0, Math.min(100, (grPeakHold / 20) * 100));

  return (
    <div className="w-full h-full flex flex-col justify-center px-4 py-3 bg-studio-950 rounded-xl border-2 border-slate-700/80 space-y-4">
      {/* 1. Input Level Track (Left to Right) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-300 font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>INPUT LEVEL</span>
          </span>
          <span className="text-cyan-400 font-bold">
            {maxIn > -55 ? `${maxIn.toFixed(1)} dBFS` : '-inf'}
            <span className="text-slate-500 font-normal ml-1">
              (Peak: {inPeakHold > -55 ? inPeakHold.toFixed(1) : '-inf'})
            </span>
          </span>
        </div>

        <div className="relative h-6 bg-studio-900 rounded-lg p-0.5 border border-studio-800 overflow-hidden flex items-center">
          {/* Gradients: Green (-48 to -12) -> Yellow (-12 to -2) -> Red (-2 to +6) */}
          <div
            className="h-full rounded bg-gradient-to-r from-emerald-500 via-cyan-400 to-amber-400 transition-all duration-75 shadow-sm"
            style={{ width: `${inNorm}%` }}
          />
          {/* Peak Hold Pip */}
          {inPeakNorm > 2 && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-lg transition-all"
              style={{ left: `${inPeakNorm}%` }}
            />
          )}
        </div>

        <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
          <span>-48</span>
          <span>-36</span>
          <span>-24</span>
          <span>-18</span>
          <span>-12</span>
          <span>-6</span>
          <span>0 dB</span>
          <span className="text-rose-400 font-bold">+6</span>
        </div>
      </div>

      {/* 2. Gain Reduction Track (Right to Left: 0 dB at right, -20 dB at left) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-300 font-bold flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isBypassed ? 'bg-slate-500' : 'bg-rose-500'}`} />
            <span>GAIN REDUCTION (GR)</span>
          </span>
          <span className="text-rose-400 font-bold">
            {isBypassed ? '0.0 dB (Bypassed)' : `-${Math.abs(telemetry.gainReductionDb).toFixed(1)} dB`}
            <span className="text-slate-500 font-normal ml-1">
              (Max: -{grPeakHold.toFixed(1)} dB)
            </span>
          </span>
        </div>

        {/* Right-to-Left Meter Container */}
        <div className="relative h-6 bg-studio-900 rounded-lg p-0.5 border border-studio-800 overflow-hidden flex items-center justify-end">
          <div
            className="h-full rounded bg-gradient-to-l from-amber-400 via-rose-500 to-red-600 transition-all duration-75 shadow-sm"
            style={{ width: isBypassed ? '0%' : `${grNorm}%` }}
          />
          {/* Peak Hold Pip */}
          {!isBypassed && grPeakNorm > 1 && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-lg transition-all"
              style={{ right: `${grPeakNorm}%` }}
            />
          )}
        </div>

        <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
          <span className="text-rose-400 font-bold">-20</span>
          <span>-15</span>
          <span>-10</span>
          <span>-7</span>
          <span>-5</span>
          <span>-3</span>
          <span>-1</span>
          <span>0 dB</span>
        </div>
      </div>
    </div>
  );
};
