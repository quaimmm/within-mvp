"use client";

import { useEffect, useRef } from "react";

type WindParticle = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  age: number;
  maximumAge: number;
  speed: number;
  width: number;
  alpha: number;
  phase: number;
  pale: boolean;
};

const CANVAS_BACKGROUND = "247,247,244";

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function particleCount(width: number) {
  if (width < 600) return 105;
  if (width < 900) return 210;
  return 440;
}

function createParticle(width: number, height: number, upstream = false): WindParticle {
  const x = upstream ? -30 - Math.random() * 110 : Math.random() * width;
  const y = Math.random() * height;
  const soft = Math.random() < .13;
  return {
    x,
    y,
    previousX: x,
    previousY: y,
    velocityX: .8 + Math.random() * .45,
    velocityY: 0,
    age: upstream ? 0 : Math.random() * 300,
    maximumAge: 330 + Math.random() * 420,
    speed: .72 + Math.random() * .72,
    width: soft ? 1.8 + Math.random() * 1.25 : .48 + Math.random() * .72,
    alpha: soft ? .075 + Math.random() * .045 : .15 + Math.random() * .14,
    phase: Math.random() * Math.PI * 2,
    pale: Math.random() < .28,
  };
}

export function LandingWindCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let particles: WindParticle[] = [];
    let animationFrame: number | null = null;
    let lastFrameTime = performance.now();
    let lastScrollTime = performance.now();
    let lastScrollY = window.scrollY;
    let scrollProgress = 0;
    let scrollBoostTarget = 0;
    let scrollBoost = 0;
    const pointer = { x: 0, y: 0, active: false };

    const updateScrollState = () => {
      const now = performance.now();
      const elapsed = Math.max(now - lastScrollTime, 16);
      const distance = Math.abs(window.scrollY - lastScrollY);
      const maximumScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      scrollProgress = clamp(window.scrollY / maximumScroll);
      scrollBoostTarget = Math.min((distance / elapsed) * .52, 1.65);
      const footerFade = clamp((1 - scrollProgress) / .2);
      canvas.style.opacity = `${(.9 * (.16 + footerFade * .84)).toFixed(3)}`;
      lastScrollY = window.scrollY;
      lastScrollTime = now;
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.8);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.fillStyle = `rgb(${CANVAS_BACKGROUND})`;
      context.fillRect(0, 0, width, height);
      particles = Array.from({ length: particleCount(width) }, () => createParticle(width, height));
      updateScrollState();
    };

    const fieldVector = (particle: WindParticle, time: number) => {
      const prevailingAngle = Math.sin(scrollProgress * Math.PI) * .4;
      const broadCurve = Math.sin(particle.x * .0032 + time * .00013) * .105;
      const crossCurrent = Math.cos(particle.y * .0046 - time * .0001) * .075;
      const localTurbulence = Math.sin((particle.x + particle.y) * .0022 + time * .00016 + particle.phase) * .055;
      const angle = prevailingAngle + broadCurve + crossCurrent + localTurbulence;
      let x = Math.cos(angle);
      let y = Math.sin(angle);

      if (pointer.active) {
        const deltaX = particle.x - pointer.x;
        const deltaY = particle.y - pointer.y;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        const radius = 165;
        if (distanceSquared < radius * radius && distanceSquared > 1) {
          const distance = Math.sqrt(distanceSquared);
          const influence = (1 - distance / radius) ** 2 * .2;
          x += (-deltaY / distance) * influence;
          y += (deltaX / distance) * influence;
        }
      }

      const magnitude = Math.hypot(x, y) || 1;
      return { x: x / magnitude, y: y / magnitude };
    };

    const resetParticle = (particle: WindParticle) => {
      Object.assign(particle, createParticle(width, height, true));
    };

    const advanceParticles = (time: number, frameScale: number, staticFrame = false) => {
      for (const particle of particles) {
        particle.previousX = particle.x;
        particle.previousY = particle.y;
        const vector = fieldVector(particle, time);
        const airflow = particle.speed * (1 + scrollBoost * .72);
        particle.velocityX += (vector.x * airflow - particle.velocityX) * .085;
        particle.velocityY += (vector.y * airflow - particle.velocityY) * .085;
        particle.x += particle.velocityX * frameScale;
        particle.y += particle.velocityY * frameScale;
        particle.age += frameScale;

        if (particle.x > width + 120 || particle.y < -120 || particle.y > height + 120 || particle.age > particle.maximumAge) {
          resetParticle(particle);
          continue;
        }

        const life = Math.min(particle.age / 45, (particle.maximumAge - particle.age) / 70, 1);
        if (life <= 0) continue;
        context.beginPath();
        context.moveTo(particle.previousX, particle.previousY);
        context.lineTo(particle.x, particle.y);
        context.lineCap = "round";
        context.lineWidth = particle.width;
        context.strokeStyle = particle.pale
          ? `rgba(255,255,255,${particle.alpha * life * (staticFrame ? .7 : 1)})`
          : `rgba(91,126,202,${particle.alpha * life * (staticFrame ? .7 : 1)})`;
        context.shadowBlur = particle.width > 1.5 ? 3.5 : 0;
        context.shadowColor = "rgba(104,137,207,.16)";
        context.stroke();
      }
      context.shadowBlur = 0;
    };

    const renderStaticField = () => {
      context.fillStyle = `rgb(${CANVAS_BACKGROUND})`;
      context.fillRect(0, 0, width, height);
      for (let step = 0; step < 85; step += 1) advanceParticles(step * 18, 1.15, true);
    };

    const animate = (time: number) => {
      const elapsed = Math.min(time - lastFrameTime, 34);
      lastFrameTime = time;
      scrollBoost += (scrollBoostTarget - scrollBoost) * .075;
      scrollBoostTarget *= .93;
      context.fillStyle = `rgba(${CANVAS_BACKGROUND},.045)`;
      context.fillRect(0, 0, width, height);
      advanceParticles(time, elapsed / 16.67);
      animationFrame = window.requestAnimationFrame(animate);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!finePointer) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };
    const clearPointer = () => { pointer.active = false; };

    resize();
    if (reducedMotion) renderStaticField();
    else animationFrame = window.requestAnimationFrame(animate);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", updateScrollState, { passive: true });
    if (finePointer) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("mouseleave", clearPointer);
      window.addEventListener("blur", clearPointer);
    }

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseleave", clearPointer);
      window.removeEventListener("blur", clearPointer);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-wind-canvas" aria-hidden="true" />;
}
