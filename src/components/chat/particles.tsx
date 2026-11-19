"use client";

import { useEffect, useRef } from "react";

/**
 * Gentle floating dots behind the chat (like the original), made cheap:
 *  - 60 dots on desktop, 28 on phones.
 *  - Sharp on retina screens, but resolution capped at 2× (3× phones would
 *    draw 2.25× more pixels for no visible gain).
 *  - Pauses when the tab is hidden or the canvas is off-screen.
 *  - Reduced motion: drawn once, no movement.
 *  - Turning particles off in Settings unmounts this; turning them on again
 *    starts cleanly (the original could not restart).
 */
type Dot = { x: number; y: number; vx: number; vy: number; r: number; a: number };

export default function Particles({
  className = "pointer-events-none fixed inset-0 -z-10 size-full",
}: {
  /** Where the canvas sits. Default: fixed behind the whole screen. */
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    let frame: number | null = null;
    let visible = true;
    let color = "255,255,255";

    const readColor = () => {
      color = document.documentElement.classList.contains("dark") ? "255,255,255" : "15,23,42";
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 768 ? 28 : 60;
      if (dots.length !== count) {
        dots = Array.from({ length: count }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          r: Math.random() * 1.5 + 0.2,
          a: Math.random() * 0.5 + 0.15,
        }));
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${d.a})`;
        ctx.fill();
      }
    };

    const tick = () => {
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -5) d.x = width + 5;
        else if (d.x > width + 5) d.x = -5;
        if (d.y < -5) d.y = height + 5;
        else if (d.y > height + 5) d.y = -5;
      }
      draw();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reduced) return draw();
      if (frame === null && visible && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    readColor();
    resize();
    start();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    resizeObserver.observe(canvas);

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
      else stop();
    });
    intersection.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    const themeObserver = new MutationObserver(() => {
      readColor();
      if (reduced) draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
