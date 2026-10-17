import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FilterParams, BAND_COLORS } from '../types';
import { audioEngine } from '../audio/AudioEngine';
import {
  formatFrequency,
  formatGain,
  freqToLogScale,
  logScaleToFreq,
  MIN_FREQ,
  MAX_FREQ
} from '../utils/frequencies';


export interface ToleranceBand {
  centerFreq: number;
  halfWidthOctaves: number;
  status?: 'hover' | 'pinned' | 'hit' | 'miss';
}

interface SpectrumDisplayProps {
  targetFilter?: FilterParams | FilterParams[] | null;
  userFilter?: FilterParams | FilterParams[] | null;
  showTargetCurve?: boolean;
  interactive?: boolean;
  onFilterChange?: (params: { frequency: number; gain: number; q?: number }) => void;
  onFilterNodeChange?: (index: number, params: Partial<FilterParams>) => void;
  activeNodeIndex?: number;
  onActiveNodeChange?: (index: number) => void;
  onAddNode?: (freq: number, gain: number) => void;
  showNodeParameters?: boolean;
  onQChange?: (newQ: number) => void;
  currentQ?: number;
  height?: number;
  highlightFreq?: number | null;
  // Tolerance Band props for Peak Master
  toleranceBand?: ToleranceBand | null;
  onBandMove?: (freq: number) => void;
  onBandSelect?: (freq: number) => void;
  isInteractiveBand?: boolean;
  targetFreqMarker?: number | number[] | null;
  // Node Drag props for Filter Doctor and multi-filter dragging
  onNodeDrag?: (freq: number, filterType?: string, nodeIndex?: number) => void;
  // Slope adjustment (Filter Doctor desktop mousewheel)
  onSlopeChange?: (newSlope: number, filterType?: string, nodeIndex?: number) => void;
  currentSlope?: number;
  showLegend?: boolean;
  targetLegendLabel?: string;
  isMobile?: boolean;
  maxGain?: number;
  showMobileQSlider?: boolean;
}

export const SpectrumDisplay: React.FC<SpectrumDisplayProps> = ({
  targetFilter = null,
  userFilter = null,
  showTargetCurve = false,
  interactive = false,
  targetLegendLabel,
  onFilterChange,
  onFilterNodeChange,
  activeNodeIndex,
  onActiveNodeChange,
  onAddNode,
  showNodeParameters = false,
  onQChange,
  currentQ,
  height = 300,
  highlightFreq = null,
  toleranceBand = null,
  onBandMove,
  onBandSelect,
  isInteractiveBand = false,
  targetFreqMarker = null,
  onNodeDrag,
  onSlopeChange,
  currentSlope,
  showLegend = true,
  isMobile = false,
  maxGain = 18,
  showMobileQSlider = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const hoveredNodeRef = useRef<number | null>(null);
  hoveredNodeRef.current = hoveredNode;
  const [isDraggingState, setIsDraggingState] = useState(false);
  const activeDragNodeIndexRef = useRef<number | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ freq: number; gain: number; x: number; y: number } | null>(null);
  const [qFeedback, setQFeedback] = useState<{ q: number; visible: boolean; label?: string } | null>(null);
  const qFeedbackTimeoutRef = useRef<number | null>(null);
  const [slopeFeedback, setSlopeFeedback] = useState<{ slope: number; label?: string; visible: boolean } | null>(null);
  const slopeFeedbackTimeoutRef = useRef<number | null>(null);

  // Smooth mobile Q touch-drag control
  const qTrackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingQRef = useRef(false);

  const updateQFromPointer = useCallback((clientX: number) => {
    if (!qTrackRef.current || !onQChange) return;
    const rect = qTrackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const norm = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const minQ = 0.5;
    const maxQ = 6.0;
    const rawQ = minQ + norm * (maxQ - minQ);
    const nextQ = Math.round(rawQ * 20) / 20; // 0.05 step
    onQChange(nextQ);
  }, [onQChange]);

  const handleQPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!interactive || (userFilter && !Array.isArray(userFilter) && userFilter.type !== 'peaking')) return;
    isDraggingQRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    updateQFromPointer(e.clientX);
  }, [interactive, userFilter, updateQFromPointer]);

  const handleQPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!isDraggingQRef.current) return;
    updateQFromPointer(e.clientX);
  }, [updateQFromPointer]);

  const handleQPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isDraggingQRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  const toleranceBandRef = useRef(toleranceBand);
  toleranceBandRef.current = toleranceBand;

  const targetFreqMarkerRef = useRef(targetFreqMarker);
  targetFreqMarkerRef.current = targetFreqMarker;

  // Frequency grid points
  const gridFreqs = [20, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000];
  const gridDbs = [18, 12, 6, 0, -6, -12, -18];

  // Helper to convert dB to canvas Y
  const dbToY = useCallback((db: number, h: number) => {
    const minDb = -18;
    const maxDb = 18;
    const norm = (db - minDb) / (maxDb - minDb);
    return h - norm * h;
  }, []);

  // Helper to convert canvas Y to dB
  const yToDb = useCallback((y: number, h: number) => {
    const norm = 1 - y / h;
    return -18 + norm * 36;
  }, []);

  // Generate frequency sample points for rendering curves
  const numPoints = 250;
  const sampleFreqs = useRef<Float32Array>(new Float32Array(numPoints));

  useEffect(() => {
    for (let i = 0; i < numPoints; i++) {
      const norm = i / (numPoints - 1);
      sampleFreqs.current[i] = logScaleToFreq(norm);
    }
  }, []);

  // Render loop for 60fps spectrum + curves
  useEffect(() => {
    let animationId: number;
    const fftArray = new Uint8Array(1024);

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Clear background
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, w, h);

      // Draw subtle grid lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#1a233a';
      ctx.fillStyle = '#51648d';
      ctx.font = '10px JetBrains Mono, monospace';

      // Horizontal dB lines
      gridDbs.forEach(db => {
        const y = dbToY(db, h);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.strokeStyle = db === 0 ? '#2a3b63' : '#141c2e';
        ctx.stroke();

        ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 8, y - 3);
      });

      // Vertical Frequency lines
      gridFreqs.forEach(freq => {
        const norm = freqToLogScale(freq);
        const x = norm * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.strokeStyle = (freq === 100 || freq === 1000 || freq === 10000) ? '#263454' : '#141c2e';
        ctx.stroke();

        const label = formatFrequency(freq);
        const textWidth = ctx.measureText(label).width;
        ctx.fillText(label, Math.max(2, Math.min(w - textWidth - 4, x - textWidth / 2)), h - 8);
      });

      // Highlight frequency vertical marker if specified
      if (highlightFreq) {
        const x = freqToLogScale(highlightFreq) * w;
        ctx.strokeStyle = 'rgba(255, 183, 3, 0.4)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Live Audio Spectrum Analyzer (FFT)
      audioEngine.getSpectrumData(fftArray);
      ctx.beginPath();
      ctx.moveTo(0, h);

      // Map FFT bins to logarithmic scale
      const nyquist = 22050;
      const binCount = fftArray.length;
      let prevX = 0;

      for (let i = 0; i < w; i += 2) {
        const normX = i / w;
        const freq = logScaleToFreq(normX);
        const bin = Math.min(binCount - 1, Math.floor((freq / nyquist) * binCount));
        const val = fftArray[bin] / 255.0; // 0 to 1
        const barH = val * (h * 0.7);
        const y = h - barH;

        if (i === 0) {
          ctx.moveTo(0, y);
        } else {
          ctx.lineTo(i, y);
        }
        prevX = i;
      }
      ctx.lineTo(prevX, h);
      ctx.closePath();

      const spectrumGrad = ctx.createLinearGradient(0, h * 0.3, 0, h);
      spectrumGrad.addColorStop(0, 'rgba(0, 240, 255, 0.18)');
      spectrumGrad.addColorStop(0.7, 'rgba(0, 240, 255, 0.05)');
      spectrumGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
      ctx.fillStyle = spectrumGrad;
      ctx.fill();

      // Draw User Filter Curve (if active)
      if (userFilter) {
        const dbs = audioEngine.getFrequencyResponse(userFilter, sampleFreqs.current);
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffb703'; // Amber

        for (let i = 0; i < numPoints; i++) {
          const normX = i / (numPoints - 1);
          const x = normX * w;
          const y = dbToY(dbs[i], h);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Node handles
        const filtersToDraw = Array.isArray(userFilter) ? userFilter : [userFilter];
        filtersToDraw.forEach((f, idx) => {
          const nodeX = freqToLogScale(f.frequency) * w;
          const nodeY = dbToY(f.gain || (f.type === 'highpass' || f.type === 'lowpass' ? -3 : 0), h);
          const isMultiBand = showNodeParameters || filtersToDraw.length > 2;
          const color = isMultiBand
            ? BAND_COLORS[idx % BAND_COLORS.length]
            : f.type === 'highpass' ? '#00d4ff' : f.type === 'lowpass' ? '#ffb703' : '#ffb703';
          const isNodeActive = activeNodeIndex === idx;
          const isNodeHovered = hoveredNodeRef.current === idx;
          const isNodeDragged = isDraggingRef.current && activeDragNodeIndexRef.current === idx;
          const isHighlighted = isNodeActive || isNodeHovered || isNodeDragged;

          // Outer glowing halo when hovered, active, or dragged
          if (isHighlighted) {
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, isNodeDragged ? 16 : isNodeActive ? 14 : 12, 0, Math.PI * 2);
            ctx.fillStyle = color + '40';
            ctx.fill();
            ctx.strokeStyle = color + 'cc';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Node core circle
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(nodeX, nodeY, isNodeDragged ? 10 : isNodeActive ? 9 : isNodeHovered ? 8 : 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = isHighlighted ? 2.5 : 2;
          ctx.stroke();

          // Band number inside the node circle (when multi-band)
          if (isMultiBand || filtersToDraw.length > 1) {
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#0a0d14';
            ctx.fillText(`${idx + 1}`, nodeX, nodeY);
          }

          // If highpass or lowpass, draw vertical dashed indicator line
          if (f.type === 'highpass' || f.type === 'lowpass') {
            ctx.strokeStyle = isHighlighted ? color + 'd9' : color + '66';
            ctx.lineWidth = isHighlighted ? 2 : 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(nodeX, 0);
            ctx.lineTo(nodeX, h);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Minimal Vertical Parameter Badge next to the EQ node
          if (showNodeParameters || isMultiBand) {
            const isCut = f.type === 'highpass' || f.type === 'lowpass';
            const freqShort = f.frequency >= 1000
              ? (f.frequency >= 10000 ? `${Math.round(f.frequency / 1000)}k` : `${(f.frequency / 1000).toFixed(1)}k`)
              : `${Math.round(f.frequency)}Hz`;
            const gainShort = isCut
              ? `${f.slope || 18}dB`
              : `${f.gain > 0 ? '+' : ''}${Math.round(f.gain * 10) / 10}dB`;
            const qShort = `Q ${f.q.toFixed(1)}`;

            // Vertical stacked lines of minimal text
            const lines = isCut ? [freqShort, gainShort] : [freqShort, gainShort, qShort];

            ctx.font = isHighlighted ? 'bold 8.5px JetBrains Mono, monospace' : '8px JetBrains Mono, monospace';
            const maxTextW = Math.max(...lines.map(l => ctx.measureText(l).width));
            const badgeW = Math.max(36, maxTextW + 8);
            const lineHeight = 10.5;
            const badgeH = lines.length * lineHeight + 5;

            // Position vertically next to the node:
            // Default to right of node; flip to left if near right edge
            let badgeX = nodeX + 13;
            if (badgeX + badgeW > w - 4) {
              badgeX = nodeX - badgeW - 13;
            }
            badgeX = Math.max(4, Math.min(w - badgeW - 4, badgeX));

            // Vertically centered on node handle
            let badgeY = nodeY - badgeH / 2;
            badgeY = Math.max(4, Math.min(h - badgeH - 4, badgeY));

            // Background card
            ctx.fillStyle = isHighlighted ? 'rgba(10, 15, 26, 0.94)' : 'rgba(10, 15, 26, 0.80)';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
            } else {
              ctx.rect(badgeX, badgeY, badgeW, badgeH);
            }
            ctx.fill();

            // Border
            ctx.strokeStyle = isHighlighted ? color : 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = isHighlighted ? 1.5 : 1;
            ctx.stroke();

            // Text lines inside vertical badge
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const centerX = badgeX + badgeW / 2;
            const startY = badgeY + 2.5 + lineHeight / 2;

            lines.forEach((lineText, lIdx) => {
              const textY = startY + lIdx * lineHeight;
              if (lIdx === 0) {
                ctx.fillStyle = color; // Frequency in band color
              } else if (lIdx === 1) {
                ctx.fillStyle = isCut ? '#94a3b8' : f.gain > 0 ? '#34d399' : f.gain < 0 ? '#f87171' : '#cbd5e1';
              } else {
                ctx.fillStyle = '#94a3b8'; // Q in soft slate
              }
              ctx.fillText(lineText, centerX, textY);
            });
          } else if (f.type === 'highpass' || f.type === 'lowpass') {
            ctx.font = `${isNodeDragged || isNodeHovered ? 'bold 10px' : 'bold 9px'} JetBrains Mono, monospace`;
            ctx.fillStyle = color;
            ctx.fillText(
              `${f.type === 'highpass' ? 'HPF' : 'LPF'}: ${formatFrequency(f.frequency)}${f.slope ? ` (${f.slope}dB)` : ''}`,
              Math.max(10, Math.min(w - 105, nodeX - 35)),
              25 + idx * 14
            );
          }
        });
      }

      // Draw Target (Mystery) Filter Curve when revealed
      if (showTargetCurve && targetFilter) {
        const dbs = audioEngine.getFrequencyResponse(targetFilter, sampleFreqs.current);

        // Fill under curve
        ctx.beginPath();
        ctx.moveTo(0, dbToY(0, h));
        for (let i = 0; i < numPoints; i++) {
          const normX = i / (numPoints - 1);
          const x = normX * w;
          const y = dbToY(dbs[i], h);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, dbToY(0, h));
        ctx.closePath();

        const targetGrad = ctx.createLinearGradient(0, 0, 0, h);
        targetGrad.addColorStop(0, 'rgba(0, 255, 136, 0.25)');
        targetGrad.addColorStop(1, 'rgba(0, 255, 136, 0.02)');
        ctx.fillStyle = targetGrad;
        ctx.fill();

        // Target Line
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#00ff88'; // Neon Green
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;

        for (let i = 0; i < numPoints; i++) {
          const normX = i / (numPoints - 1);
          const x = normX * w;
          const y = dbToY(dbs[i], h);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

        // Target Node Handles
        const targetFiltersToDraw = Array.isArray(targetFilter) ? targetFilter : [targetFilter];
        targetFiltersToDraw.forEach(tf => {
          const nodeX = freqToLogScale(tf.frequency) * w;
          const nodeY = dbToY(tf.gain ?? (tf.type === 'highpass' || tf.type === 'lowpass' ? -3 : 0), h);

          ctx.fillStyle = '#00ff88';
          ctx.beginPath();
          ctx.arc(nodeX, nodeY, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0a0d14';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }

      // Draw Tolerance Band (for Peak Master interactive targeting)
      const currentToleranceBand = toleranceBandRef.current;
      if (currentToleranceBand) {
        const { centerFreq, halfWidthOctaves, status = 'hover' } = currentToleranceBand;
        const minFreq = Math.max(MIN_FREQ, centerFreq * Math.pow(2, -halfWidthOctaves));
        const maxFreq = Math.min(MAX_FREQ, centerFreq * Math.pow(2, halfWidthOctaves));
        const xStart = freqToLogScale(minFreq) * w;
        const xEnd = freqToLogScale(maxFreq) * w;
        const xCenter = freqToLogScale(centerFreq) * w;
        const bandWidth = Math.max(12, xEnd - xStart);

        let fillColor = 'rgba(0, 240, 255, 0.14)';
        let borderColor = '#00f0ff';
        let centerLineColor = '#00f0ff';

        if (status === 'pinned') {
          fillColor = 'rgba(255, 183, 3, 0.18)';
          borderColor = '#ffb703';
          centerLineColor = '#ffb703';
        } else if (status === 'hit') {
          fillColor = 'rgba(0, 255, 136, 0.22)';
          borderColor = '#00ff88';
          centerLineColor = '#00ff88';
        } else if (status === 'miss') {
          fillColor = 'rgba(239, 68, 68, 0.22)';
          borderColor = '#ef4444';
          centerLineColor = '#ef4444';
        }

        // Shaded vertical tolerance area
        ctx.fillStyle = fillColor;
        ctx.fillRect(xStart, 0, bandWidth, h);

        // Left & right boundary lines
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = status === 'hit' || status === 'miss' ? 2 : 1;
        ctx.setLineDash(status === 'miss' ? [5, 4] : [3, 3]);
        ctx.beginPath();
        ctx.moveTo(xStart, 0);
        ctx.lineTo(xStart, h);
        ctx.moveTo(xEnd, 0);
        ctx.lineTo(xEnd, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Center hairline
        ctx.strokeStyle = centerLineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xCenter, 0);
        ctx.lineTo(xCenter, h);
        ctx.stroke();

        // Top & bottom boundary caps / brackets
        const bracketW = Math.min(10, bandWidth / 2);
        ctx.fillStyle = borderColor;
        ctx.fillRect(xStart, 0, bracketW, 4);
        ctx.fillRect(Math.max(xStart, xEnd - bracketW), 0, bracketW, 4);
        ctx.fillRect(xStart, h - 4, bracketW, 4);
        ctx.fillRect(Math.max(xStart, xEnd - bracketW), h - 4, bracketW, 4);
      }

      // Draw Target Frequency Marker if revealed
      const currentTargetMarker = targetFreqMarkerRef.current;
      if (currentTargetMarker) {
        const markers = Array.isArray(currentTargetMarker) ? currentTargetMarker : [currentTargetMarker];
        markers.forEach(m => {
          const xTarget = freqToLogScale(m) * w;
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(xTarget, 0);
          ctx.lineTo(xTarget, h);
          ctx.stroke();
          ctx.setLineDash([]);

          // Top target node
          ctx.fillStyle = '#00ff88';
          ctx.beginPath();
          ctx.arc(xTarget, 8, 4.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [targetFilter, userFilter, showTargetCurve, highlightFreq, dbToY]);

  // Handle Resize (including container width changes when switching Desktop/Mobile view)
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width;
        canvasRef.current.height = height;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    const observer = containerRef.current ? new ResizeObserver(handleResize) : null;
    if (observer && containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [height]);

  // Mousewheel Q or Slope Adjustment
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (!interactive && !onSlopeChange)) return;

    const handleWheel = (e: WheelEvent) => {
      // Case 1: Interactive Q / Slope adjustment (EQ Sandbox / EQMatch)
      if (interactive) {
        e.preventDefault();
        const userFiltersArray = Array.isArray(userFilter) ? userFilter : userFilter ? [userFilter] : [];
        let targetIndex = activeNodeIndex ?? 0;

        if (userFiltersArray.length > 1) {
          const rect = canvas.getBoundingClientRect();
          const cursorX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const cursorY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
          let bestDist = Infinity;
          userFiltersArray.forEach((f, idx) => {
            const nx = freqToLogScale(f.frequency) * rect.width;
            const ny = dbToY(f.gain || (f.type === 'highpass' || f.type === 'lowpass' ? -3 : 0), rect.height);
            const d = Math.hypot(cursorX - nx, cursorY - ny);
            if (d < bestDist) {
              bestDist = d;
              if (d < 100) {
                targetIndex = idx;
              }
            }
          });
        }

        const firstTargetFilter = Array.isArray(targetFilter) ? targetFilter[0] : targetFilter;
        const activeFilter = userFiltersArray[targetIndex] || firstTargetFilter;
        if (!activeFilter) return;

        // If HPF or LPF, scroll wheel alters slope
        if (activeFilter.type === 'highpass' || activeFilter.type === 'lowpass') {
          const availableSlopes = [6, 12, 18, 24, 36, 48, 72, 96];
          const cur = activeFilter.slope || 12;
          let idx = availableSlopes.indexOf(cur);
          if (idx === -1) idx = 1;
          const nextIdx = e.deltaY < 0 ? Math.min(availableSlopes.length - 1, idx + 1) : Math.max(0, idx - 1);
          const nextSlope = availableSlopes[nextIdx];

          if (onFilterNodeChange) {
            onFilterNodeChange(targetIndex, { slope: nextSlope });
          } else if (onSlopeChange) {
            onSlopeChange(nextSlope, activeFilter.type, targetIndex);
          }

          setSlopeFeedback({
            slope: nextSlope,
            label: `${activeFilter.type === 'highpass' ? 'HPF' : 'LPF'} Slope: ${nextSlope} dB/oct (Band ${targetIndex + 1})`,
            visible: true
          });
          if (slopeFeedbackTimeoutRef.current) window.clearTimeout(slopeFeedbackTimeoutRef.current);
          slopeFeedbackTimeoutRef.current = window.setTimeout(() => setSlopeFeedback(null), 1500);
        } else {
          // Bell / Shelf: scroll wheel alters Q factor (bandwidth for Bell, slope gradient for Shelves)
          const isShelf = activeFilter.type === 'lowshelf' || activeFilter.type === 'highshelf';
          const maxQ = isShelf ? 3.0 : 10.0;
          const minQ = 0.3;
          const effectiveQ = activeFilter.q ?? currentQ ?? (isShelf ? 0.707 : 1.41);
          const step = isShelf ? 0.05 : 0.15;
          const delta = e.deltaY < 0 ? step : -step;
          const nextQ = Math.max(minQ, Math.min(maxQ, Math.round((effectiveQ + delta) * 100) / 100));

          if (onFilterNodeChange) {
            onFilterNodeChange(targetIndex, { q: nextQ });
          } else {
            if (onQChange) onQChange(nextQ);
            if (onFilterChange) {
              onFilterChange({
                frequency: activeFilter.frequency,
                gain: activeFilter.gain,
                q: nextQ
              });
            }
          }

          const shelfDesc = nextQ < 0.6 ? 'Shallow' : nextQ > 1.0 ? 'Steep' : 'Natural';
          setQFeedback({
            q: nextQ,
            visible: true,
            label: isShelf
              ? `Shelf Slope Q: ${nextQ.toFixed(2)} (${shelfDesc})`
              : `Bandwidth Q: ${nextQ.toFixed(2)}`
          });
          if (qFeedbackTimeoutRef.current) window.clearTimeout(qFeedbackTimeoutRef.current);
          qFeedbackTimeoutRef.current = window.setTimeout(() => setQFeedback(null), 1500);
        }
        return;
      }

      // Case 2: Slope adjustment (Filter Doctor desktop mousewheel)
      if (onSlopeChange) {
        e.preventDefault();
        const availableSlopes = [6, 12, 18, 24, 36, 48, 72, 96];
        const userFiltersArray = Array.isArray(userFilter) ? userFilter : userFilter ? [userFilter] : [];
        let targetFilterObj = userFiltersArray[0];
        let targetIndex = 0;

        if (userFiltersArray.length > 1) {
          const rect = canvas.getBoundingClientRect();
          const cursorX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const cursorFreq = logScaleToFreq(cursorX / rect.width);
          let bestDiff = Infinity;
          userFiltersArray.forEach((f, idx) => {
            const diff = Math.abs(Math.log2(f.frequency / cursorFreq));
            if (diff < bestDiff) {
              bestDiff = diff;
              targetFilterObj = f;
              targetIndex = idx;
            }
          });
        }

        const cur = targetFilterObj?.slope ?? currentSlope ?? 24;
        let idx = availableSlopes.indexOf(cur);
        if (idx === -1) {
          idx = availableSlopes.reduce((bestIdx, s, i) =>
            Math.abs(s - cur) < Math.abs(availableSlopes[bestIdx] - cur) ? i : bestIdx, 0);
        }
        const nextIdx = e.deltaY < 0 ? Math.min(availableSlopes.length - 1, idx + 1) : Math.max(0, idx - 1);
        const nextSlope = availableSlopes[nextIdx];
        onSlopeChange(nextSlope, targetFilterObj?.type, targetIndex);

        const filterName = targetFilterObj?.type === 'highpass' ? 'HPF' : targetFilterObj?.type === 'lowpass' ? 'LPF' : 'Filter';
        setSlopeFeedback({
          slope: nextSlope,
          label: `${filterName} Slope: ${nextSlope} dB/oct`,
          visible: true
        });
        if (slopeFeedbackTimeoutRef.current) {
          window.clearTimeout(slopeFeedbackTimeoutRef.current);
        }
        slopeFeedbackTimeoutRef.current = window.setTimeout(() => {
          setSlopeFeedback(prev => prev ? { ...prev, visible: false } : null);
        }, 1500);
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      if (qFeedbackTimeoutRef.current) {
        window.clearTimeout(qFeedbackTimeoutRef.current);
      }
      if (slopeFeedbackTimeoutRef.current) {
        window.clearTimeout(slopeFeedbackTimeoutRef.current);
      }
    };
  }, [interactive, onSlopeChange, currentSlope, currentQ, userFilter, targetFilter, onQChange, onFilterChange, onFilterNodeChange, activeNodeIndex]);

  // Mouse / Touch interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const normX = x / rect.width;
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, logScaleToFreq(normX)));
    const gain = yToDb(y, rect.height);

    // Case 1: Multi-node Interactive EQ (SandboxEQ)
    if (interactive && onFilterNodeChange && userFilter) {
      const userFiltersArray = Array.isArray(userFilter) ? userFilter : [userFilter];
      let targetIndex = 0;
      let bestDist = Infinity;
      userFiltersArray.forEach((f, idx) => {
        const nx = freqToLogScale(f.frequency) * rect.width;
        const ny = dbToY(f.gain || (f.type === 'highpass' || f.type === 'lowpass' ? -3 : 0), rect.height);
        const d = Math.hypot(x - nx, y - ny);
        if (d < bestDist) {
          bestDist = d;
          targetIndex = idx;
        }
      });

      isDraggingRef.current = true;
      activeDragNodeIndexRef.current = targetIndex;
      setIsDraggingState(true);
      if (onActiveNodeChange) {
        onActiveNodeChange(targetIndex);
      }
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}

      const targetFilterObj = userFiltersArray[targetIndex];
      const isCut = targetFilterObj?.type === 'highpass' || targetFilterObj?.type === 'lowpass';
      onFilterNodeChange(targetIndex, {
        frequency: freq,
        gain: isCut ? 0 : Math.max(-maxGain, Math.min(maxGain, Math.round(gain * 2) / 2))
      });
      return;
    }

    // Case 2: Filter Doctor / Node Dragging (explicit onNodeDrag OR isInteractiveBand without toleranceBand)
    if (onNodeDrag || (isInteractiveBand && !toleranceBand && userFilter)) {
      const userFiltersArray = Array.isArray(userFilter) ? userFilter : userFilter ? [userFilter] : [];
      let targetIndex = 0;
      if (userFiltersArray.length > 1) {
        let bestDist = Infinity;
        userFiltersArray.forEach((f, idx) => {
          const nx = freqToLogScale(f.frequency) * rect.width;
          const ny = dbToY(f.gain || (f.type === 'highpass' || f.type === 'lowpass' ? -3 : 0), rect.height);
          const d = Math.hypot(x - nx, y - ny);
          const dX = Math.abs(x - nx);
          const effectiveDist = Math.min(d, dX * 1.5);
          if (effectiveDist < bestDist) {
            bestDist = effectiveDist;
            targetIndex = idx;
          }
        });
      }

      isDraggingRef.current = true;
      activeDragNodeIndexRef.current = targetIndex;
      setIsDraggingState(true);
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}

      const targetFilterObj = userFiltersArray[targetIndex];
      if (onNodeDrag) {
        onNodeDrag(freq, targetFilterObj?.type, targetIndex);
      } else if (onBandSelect) {
        onBandSelect(freq);
      }
      return;
    }

    // Case 3: Peak Master tolerance band selection
    if (isInteractiveBand && onBandSelect) {
      onBandSelect(freq);
      return;
    }

    // Case 4: Single-filter Interactive parametric EQ
    if (!interactive || !onFilterChange) return;
    isDraggingRef.current = true;
    setIsDraggingState(true);
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    updateFilterFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const normX = x / rect.width;
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, logScaleToFreq(normX)));
    const gain = yToDb(y, rect.height);

    setHoverInfo({ freq, gain, x, y });

    // Node proximity detection for cursor and hover glow (when not currently dragging)
    if (!isDraggingRef.current && userFilter) {
      const userFiltersArray = Array.isArray(userFilter) ? userFilter : [userFilter];
      let nearIndex: number | null = null;
      let minD = Infinity;
      userFiltersArray.forEach((f, idx) => {
        const nx = freqToLogScale(f.frequency) * rect.width;
        const ny = dbToY(f.gain || (f.type === 'highpass' || f.type === 'lowpass' ? -3 : 0), rect.height);
        const d = Math.hypot(x - nx, y - ny);
        const dX = Math.abs(x - nx);
        if (d < 24 || ((f.type === 'highpass' || f.type === 'lowpass') && dX < 14)) {
          if (d < minD) {
            minD = d;
            nearIndex = idx;
          }
        }
      });
      setHoveredNode(nearIndex);
    }

    // Multi-node interactive dragging
    if (isDraggingRef.current && activeDragNodeIndexRef.current !== null && onFilterNodeChange && userFilter) {
      const userFiltersArray = Array.isArray(userFilter) ? userFilter : [userFilter];
      const targetFilterObj = userFiltersArray[activeDragNodeIndexRef.current];
      const isCut = targetFilterObj?.type === 'highpass' || targetFilterObj?.type === 'lowpass';
      onFilterNodeChange(activeDragNodeIndexRef.current, {
        frequency: freq,
        gain: isCut ? 0 : Math.max(-maxGain, Math.min(maxGain, Math.round(gain * 2) / 2))
      });
      return;
    }

    // Dragging active node (Filter Doctor or multi-filter)
    if (isDraggingRef.current && activeDragNodeIndexRef.current !== null) {
      const userFiltersArray = Array.isArray(userFilter) ? userFilter : userFilter ? [userFilter] : [];
      const targetFilterObj = userFiltersArray[activeDragNodeIndexRef.current];
      if (onNodeDrag) {
        onNodeDrag(freq, targetFilterObj?.type, activeDragNodeIndexRef.current);
      } else if (onBandSelect) {
        onBandSelect(freq);
      }
      return;
    }

    if (isInteractiveBand && onBandMove) {
      onBandMove(freq);
    }

    if (interactive && isDraggingRef.current && onFilterChange) {
      onFilterChange({
        frequency: freq,
        gain: Math.max(-maxGain, Math.min(maxGain, Math.round(gain * 2) / 2))
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    activeDragNodeIndexRef.current = null;
    setIsDraggingState(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const updateFilterFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !onFilterChange) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const normX = x / rect.width;
    const freq = logScaleToFreq(normX);
    const gain = yToDb(y, rect.height);

    onFilterChange({
      frequency: Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)),
      gain: Math.max(-maxGain, Math.min(maxGain, Math.round(gain * 2) / 2))
    });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !onAddNode) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const normX = x / rect.width;
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, logScaleToFreq(normX)));
    const gain = Math.max(-maxGain, Math.min(maxGain, Math.round(yToDb(y, rect.height) * 2) / 2));
    onAddNode(freq, gain);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden border border-studio-800 bg-studio-950 shadow-2xl select-none"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className={`w-full h-full block touch-none ${
          isDraggingState
            ? 'cursor-grabbing'
            : hoveredNode !== null && (onNodeDrag || !toleranceBand)
            ? 'cursor-grab'
            : isInteractiveBand
            ? 'cursor-crosshair'
            : interactive
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onPointerLeave={() => {
          setHoverInfo(null);
          if (!isDraggingRef.current) setHoveredNode(null);
        }}
      />

      {/* Real-time Mousewheel Q indicator */}
      {qFeedback && qFeedback.visible && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 px-3 py-1.5 text-xs font-mono bg-studio-accent text-studio-950 font-bold rounded-xl shadow-xl border border-white/30 flex items-center space-x-1.5 animate-pulse">
          <span>{qFeedback.label || `Q: ${qFeedback.q.toFixed(2)}`}</span>
          <span className="text-[10px] font-normal opacity-80">(Mousewheel)</span>
        </div>
      )}

      {/* Real-time Mousewheel Slope indicator */}
      {slopeFeedback && slopeFeedback.visible && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 px-3 py-1.5 text-xs font-mono bg-studio-neonOrange text-studio-950 font-bold rounded-xl shadow-xl border border-white/30 flex items-center space-x-1.5 animate-pulse">
          <span>{slopeFeedback.label || `Slope: ${slopeFeedback.slope} dB/oct`}</span>
          <span className="text-[10px] font-normal opacity-80">(Mousewheel)</span>
        </div>
      )}

      {/* Interactive Helper Hint (Desktop Only) */}
      {!isMobile && interactive && (
        <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] font-mono text-slate-400 bg-studio-950/80 px-2.5 py-1 rounded border border-studio-800/80 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-studio-accent animate-pulse" />
          <span>
            {onAddNode
              ? 'Drag: Freq & Gain • Scroll: Q/Slope • Double-click canvas: Add EQ Point'
              : 'Scroll Wheel: Q (Bandwidth) • Drag: Freq & Gain'}
          </span>
        </div>
      )}

      {onSlopeChange && !interactive && !isMobile && (
        <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-mono text-slate-400 bg-studio-950/80 px-2.5 py-1 rounded border border-studio-800/80 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-studio-neonOrange animate-pulse" />
          <span>Scroll Wheel: Alter Slope ({currentSlope || 24} dB/oct)</span>
        </div>
      )}

      {isInteractiveBand && !interactive && !toleranceBand && !isMobile && (
        <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] font-mono text-slate-400 bg-studio-950/80 px-2.5 py-1 rounded border border-studio-800/80 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>Click & hold frequency dots to drag &bull; Use sliders or audition [C] live</span>
        </div>
      )}

      {isInteractiveBand && !interactive && toleranceBand && !isMobile && (
        <div className="hidden sm:flex pointer-events-none absolute bottom-2 left-3 text-[10px] font-mono text-slate-400 bg-studio-950/80 px-2.5 py-1 rounded border border-studio-800/80 items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-studio-accent animate-ping" />
          <span>Move mouse over spectrum to aim &bull; Click to lock frequency</span>
        </div>
      )}

      {/* Hover readout badge */}
      {hoverInfo && (
        <div
          className="pointer-events-none absolute px-2.5 py-1 text-xs font-mono bg-studio-900/90 text-studio-accent rounded border border-studio-700 shadow backdrop-blur-sm z-20"
          style={{
            left: Math.min(hoverInfo.x + 12, (containerRef.current?.clientWidth || 300) - 170),
            top: Math.max(8, hoverInfo.y - 32)
          }}
        >
          {isInteractiveBand && toleranceBand ? (
            <span>
              🎯 {formatFrequency(hoverInfo.freq)} <span className="text-slate-400 text-[10px]">(±{toleranceBand.halfWidthOctaves.toFixed(2)} oct)</span>
            </span>
          ) : (
            <span>{formatFrequency(hoverInfo.freq)} | {formatGain(hoverInfo.gain)}</span>
          )}
        </div>
      )}

      {/* Legend badges / Mobile Q slider (replaces 'Your Guess / EQ' on mobile) */}
      {showLegend && (
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 font-mono pointer-events-none z-20">
          {/* On mobile in EQ Correct, replace 'Your Guess / EQ' with the touch-drag Q width box */}
          {isMobile && showMobileQSlider && onQChange ? (
            <div
              className={`pointer-events-auto flex flex-col justify-center px-2.5 py-1 bg-studio-950/95 backdrop-blur-md rounded-xl border border-amber-500/50 shadow-xl text-[10px] font-mono w-[145px] h-[38px] select-none cursor-ew-resize transition-all ${
                !interactive || (userFilter && !Array.isArray(userFilter) && userFilter.type !== 'peaking')
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:border-amber-400 active:ring-1 active:ring-amber-400'
              }`}
              style={{ touchAction: 'none' }}
              onPointerDown={handleQPointerDown}
              onPointerMove={handleQPointerMove}
              onPointerUp={handleQPointerUp}
              onPointerCancel={handleQPointerUp}
            >
              <div className="flex items-center justify-between leading-none mb-1 pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
                  <span className="text-amber-400 font-bold text-[9px] uppercase tracking-wider">Q (Width)</span>
                </div>
                <span className="text-white font-bold text-[10px] bg-studio-900/90 px-1.5 py-0.5 rounded border border-studio-800">
                  {userFilter && !Array.isArray(userFilter) && userFilter.type !== 'peaking'
                    ? 'Shelf'
                    : currentQ ? currentQ.toFixed(2) : '1.41'}
                </span>
              </div>

              {/* Custom Smooth Touch Track */}
              <div
                ref={qTrackRef}
                className="relative w-full h-2 bg-studio-900 rounded-full border border-studio-800 flex items-center pointer-events-none overflow-visible"
              >
                {/* Active amber glow fill */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, (((currentQ ?? 1.41) - 0.5) / (6.0 - 0.5)) * 100))}%`
                  }}
                />
                {/* Smooth grab handle thumb */}
                <div
                  className="absolute -top-1 w-4 h-4 bg-amber-400 rounded-full shadow-[0_0_8px_#fbbf24] border-2 border-white -ml-2 transition-transform active:scale-125"
                  style={{
                    left: `${Math.max(0, Math.min(100, (((currentQ ?? 1.41) - 0.5) / (6.0 - 0.5)) * 100))}%`
                  }}
                />
              </div>
            </div>
          ) : (
            /* Desktop or standard: 'Your Guess / EQ' badge */
            userFilter && (
              <div className="flex items-center space-x-1.5 bg-studio-900/80 px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <span>Your Guess / EQ</span>
              </div>
            )
          )}

          {/* Solution Target Curve Badge (revealed when round answered) */}
          {showTargetCurve && targetFilter && (
            <div className="flex items-center space-x-1.5 bg-studio-900/90 backdrop-blur-md px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-400 text-[10px] shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"></span>
              <span>{targetLegendLabel || 'Target Answer'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
