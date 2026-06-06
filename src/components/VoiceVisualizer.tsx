import { useEffect, useRef } from 'react';

interface VoiceVisualizerProps {
  assistantVolume: number;
  userVolume: number;
  callStatus: 'connected' | 'ended' | 'connecting';
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

const interpolateRGB = (c1: RGB, c2: RGB, factor: number): string => {
  const r = Math.round(c1.r + (c2.r - c1.r) * factor);
  const g = Math.round(c1.g + (c2.g - c1.g) * factor);
  const b = Math.round(c1.b + (c2.b - c1.b) * factor);
  return `rgb(${r}, ${g}, ${b})`;
};

// Curated professional voice colors
const USER_COLOR_1: RGB = { r: 20, g: 184, b: 166 }; // Teal
const USER_COLOR_2: RGB = { r: 14, g: 165, b: 233 }; // Sky Blue
const ASSISTANT_COLOR_1: RGB = { r: 99, g: 102, b: 241 }; // Indigo
const ASSISTANT_COLOR_2: RGB = { r: 236, g: 72, b: 153 }; // Pink

export function VoiceVisualizer({
  assistantVolume,
  userVolume,
  callStatus,
}: VoiceVisualizerProps) {
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const assistantVolRef = useRef(0);
  const userVolRef = useRef(0);
  const callStatusRef = useRef(callStatus);

  useEffect(() => {
    assistantVolRef.current = assistantVolume;
  }, [assistantVolume]);

  useEffect(() => {
    userVolRef.current = userVolume;
  }, [userVolume]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Handle resizing of the wave canvas
  useEffect(() => {
    const handleResize = () => {
      const canvas = waveCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Main animation loops
  useEffect(() => {
    let animationFrameId: number;
    let time = 0;
    let colorMix = 0.5;

    // Central fluid orb loop
    const renderOrb = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.clearRect(0, 0, width, height);

      const status = callStatusRef.current;
      const av = assistantVolRef.current;
      const uv = userVolRef.current;
      const activeVol = Math.max(av, uv);

      const centerX = width / 2;
      const centerY = height / 2;

      if (status === 'connecting') {
        // --- ChatGPT Connecting/Thinking Animation (Orbiting loops) ---
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(time * 0.025);

        const ringCount = 3;
        for (let j = 0; j < ringCount; j++) {
          ctx.save();
          ctx.rotate((j * Math.PI * 2) / ringCount + Math.sin(time * 0.015) * 0.3);
          
          const radiusX = 70 + Math.sin(time * 0.04 + j) * 12;
          const radiusY = 32 + Math.cos(time * 0.04 + j) * 6;

          const grad = ctx.createLinearGradient(-radiusX, 0, radiusX, 0);
          if (j === 0) {
            grad.addColorStop(0, 'rgba(99, 102, 241, 0.8)'); // Indigo
            grad.addColorStop(1, 'rgba(236, 72, 153, 0.1)');
          } else if (j === 1) {
            grad.addColorStop(0, 'rgba(20, 184, 166, 0.8)'); // Teal
            grad.addColorStop(1, 'rgba(14, 165, 233, 0.1)');
          } else {
            grad.addColorStop(0, 'rgba(236, 72, 153, 0.8)'); // Pink
            grad.addColorStop(1, 'rgba(99, 102, 241, 0.1)');
          }

          ctx.beginPath();
          ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 3.5;
          ctx.shadowBlur = 20;
          ctx.shadowColor = j === 0 ? '#6366f1' : j === 1 ? '#14b8a6' : '#ec4899';
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      } else {
        // --- Iridescent 3D Morphing Orb (Active Call State) ---
        const targetMix = av > uv ? 1 : (uv > 0.02 ? 0 : 0.5);
        colorMix += (targetMix - colorMix) * 0.08;

        const color1 = interpolateRGB(USER_COLOR_1, ASSISTANT_COLOR_1, colorMix);
        const color2 = interpolateRGB(USER_COLOR_2, ASSISTANT_COLOR_2, colorMix);

        const baseRadius = 80;

        ctx.save();

        // 1. Draw glowing background shadow
        const glowGrad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, baseRadius * 1.8);
        const color1RGBA = color1.replace('rgb', 'rgba').replace(')', ', 0.25)');
        glowGrad.addColorStop(0, color1RGBA);
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Helper to draw a single morphing blob layer
        const drawBlob = (offsetAngle: number, scale: number, timeFactor: number, cGrad1: string, cGrad2: string) => {
          const numPoints = 12;
          const points: { x: number; y: number }[] = [];
          
          for (let i = 0; i < numPoints; i++) {
            const angle = (i * Math.PI * 2) / numPoints + offsetAngle;
            const drift = 
              Math.sin(time * 0.04 * timeFactor + i * 0.8) * 6 + 
              Math.cos(time * 0.02 * timeFactor - i * 0.5) * 4;
            
            const response = activeVol * (20 + Math.sin(time * 0.28 + i * 1.4) * 12);
            
            const r = (baseRadius + drift + response) * scale;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            
            points.push({ x, y });
          }

          ctx.beginPath();
          const firstPoint = points[0];
          const lastPoint = points[numPoints - 1];
          let xc = (firstPoint.x + lastPoint.x) / 2;
          let yc = (firstPoint.y + lastPoint.y) / 2;
          ctx.moveTo(xc, yc);

          for (let i = 0; i < numPoints - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            xc = (p1.x + p2.x) / 2;
            yc = (p1.y + p2.y) / 2;
            ctx.quadraticCurveTo(p1.x, p1.y, xc, yc);
          }

          xc = (lastPoint.x + firstPoint.x) / 2;
          yc = (lastPoint.y + firstPoint.y) / 2;
          ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, xc, yc);
          ctx.closePath();

          const grad = ctx.createRadialGradient(
            centerX - baseRadius * 0.2,
            centerY - baseRadius * 0.2,
            5,
            centerX,
            centerY,
            baseRadius * 1.3
          );
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.35, cGrad1);
          grad.addColorStop(0.85, cGrad2);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = grad;
          ctx.fill();
        };

        // Layer 1: Base Blob
        ctx.globalCompositeOperation = 'source-over';
        drawBlob(0, 1.0, 1.0, color1, color2);

        // Layer 2: Screen Blended Blob (adds iridescence)
        ctx.globalCompositeOperation = 'screen';
        const overlayColor1 = interpolateRGB(USER_COLOR_2, ASSISTANT_COLOR_2, colorMix);
        const overlayColor2 = 'rgba(99, 102, 241, 0.15)';
        drawBlob(Math.PI / 4, 0.94, 0.6, overlayColor1, overlayColor2);

        // Layer 3: Glass highlight reflection on top
        ctx.globalCompositeOperation = 'source-over';
        const highlightGrad = ctx.createRadialGradient(
          centerX - baseRadius * 0.35,
          centerY - baseRadius * 0.35,
          0,
          centerX - baseRadius * 0.35,
          centerY - baseRadius * 0.35,
          baseRadius * 0.65
        );
        highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        highlightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.12)');
        highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = highlightGrad;
        ctx.beginPath();
        ctx.arc(centerX - baseRadius * 0.22, centerY - baseRadius * 0.22, baseRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    };

    // Centered audio wave loop
    const renderWave = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.clearRect(0, 0, width, height);

      const status = callStatusRef.current;
      if (status !== 'connected') return;

      const av = assistantVolRef.current;
      const uv = userVolRef.current;
      const activeVol = Math.max(av, uv);

      // Scaled down amplitude & adjusted frequency for compact display width
      const waves = [
        { color: 'rgba(20, 184, 166, 0.35)', speed: 0.04, freq: 0.015, amp: 14, phase: 0 },       // Teal
        { color: 'rgba(99, 102, 241, 0.35)', speed: 0.03, freq: 0.01, amp: 20, phase: 2.0 },       // Indigo
        { color: 'rgba(236, 72, 153, 0.3)', speed: 0.045, freq: 0.02, amp: 10, phase: 4.0 },       // Pink
        { color: 'rgba(14, 165, 233, 0.2)', speed: 0.02, freq: 0.007, amp: 24, phase: 6.0 }       // Sky Blue
      ];

      const centerY = height / 2;

      waves.forEach((w) => {
        ctx.beginPath();
        const currentAmp = (activeVol * w.amp) + 2;

        for (let x = 0; x < width; x++) {
          const envelope = Math.pow(1 - Math.pow((2 * x) / width - 1, 2), 3);
          const y = centerY + Math.sin(x * w.freq + time * w.speed + w.phase) * currentAmp * envelope;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.strokeStyle = w.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    };

    const loop = () => {
      time += 1;

      // Render Central Orb
      const orbCanvas = orbCanvasRef.current;
      if (orbCanvas) {
        const ctx = orbCanvas.getContext('2d');
        if (ctx) {
          renderOrb(ctx, orbCanvas.width, orbCanvas.height);
        }
      }

      // Render Wave
      const waveCanvas = waveCanvasRef.current;
      if (waveCanvas) {
        const ctx = waveCanvas.getContext('2d');
        if (ctx) {
          const rect = waveCanvas.getBoundingClientRect();
          renderWave(ctx, rect.width, rect.height);
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <>
      {/* Central Visualizer Canvas */}
      <div className="orb-visualizer-container">
        <canvas
          ref={orbCanvasRef}
          width={360}
          height={360}
          className="orb-canvas"
        />
      </div>

      {/* Centered Wave Canvas */}
      <canvas
        ref={waveCanvasRef}
        className="voice-wave-canvas"
      />
    </>
  );
}
