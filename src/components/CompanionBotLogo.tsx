import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface CompanionBotLogoProps {
  className?: string;
}

export default function CompanionBotLogo({ className }: CompanionBotLogoProps) {
  const eyesRef = useRef<SVGGElement | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const [isHappy, setIsHappy] = useState(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (isHappy || !eyesRef.current) return;

      const rect = eyesRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const mouseX = event.clientX - centerX;
      const mouseY = event.clientY - centerY;
      const angle = Math.atan2(mouseY, mouseX);
      const maxRadius = 4.5;
      const distance = Math.min(Math.hypot(mouseX, mouseY) / 40, maxRadius);
      const moveX = Math.cos(angle) * distance;
      const moveY = Math.sin(angle) * distance;

      eyesRef.current.style.transform = `translate(${moveX}px, ${moveY}px)`;
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [isHappy]);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current != null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (isHappy) return;

    if (eyesRef.current) {
      eyesRef.current.style.transform = 'translate(0px, 0px)';
    }

    setIsHappy(true);
    resetTimeoutRef.current = window.setTimeout(() => {
      setIsHappy(false);
    }, 1000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('companion-bot', isHappy && 'happy', className)}
      aria-label="AAMD companion bot"
      title="AAMD companion bot"
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" className="companion-bot-svg" aria-hidden="true">
        <circle cx="50" cy="50" r="35" className="bot-aura" />

        <g className="bot-antenna">
          <path d="M50 25L50 8" className="bot-antenna-stem" />
          <circle cx="50" cy="8" r="4" className="bot-antenna-tip" />
        </g>

        <rect x="20" y="25" width="60" height="50" rx="15" className="bot-body" />
        <rect x="30" y="35" width="40" height="25" rx="6" className="bot-screen" />

        <g ref={eyesRef} className="bot-eyes">
          <circle cx="40" cy="47" r="4" className="bot-eye-dot" />
          <circle cx="60" cy="47" r="4" className="bot-eye-dot" />
        </g>

        <g className="bot-happy-eyes">
          <polyline points="37,47 40,44 43,47" className="bot-happy-eye-line" />
          <polyline points="57,47 60,44 63,47" className="bot-happy-eye-line" />
        </g>

        <g className="bot-blush">
          <ellipse cx="32" cy="53" rx="5" ry="2.5" className="bot-blush-dot" />
          <ellipse cx="68" cy="53" rx="5" ry="2.5" className="bot-blush-dot" />
        </g>
      </svg>
    </button>
  );
}
