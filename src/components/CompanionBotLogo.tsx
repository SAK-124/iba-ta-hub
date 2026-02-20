import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface CompanionBotLogoProps {
  className?: string;
}

export default function CompanionBotLogo({ className }: CompanionBotLogoProps) {
  const eyesRef = useRef<SVGGElement | null>(null);
  const happyTimeoutRef = useRef<number | null>(null);
  const dizzyTimeoutRef = useRef<number | null>(null);

  const lastMouseXForDizzyRef = useRef(0);
  const lastDirectionRef = useRef(0);
  const reversalCountRef = useRef(0);
  const lastReversalTimeRef = useRef(0);

  const [isHappy, setIsHappy] = useState(false);
  const [isDizzy, setIsDizzy] = useState(false);

  const resetEyesPosition = () => {
    if (eyesRef.current) {
      eyesRef.current.style.transform = 'translate(0px, 0px)';
    }
  };

  const resetDizzyTracker = () => {
    lastDirectionRef.current = 0;
    reversalCountRef.current = 0;
    lastReversalTimeRef.current = 0;
  };

  const triggerDizzy = () => {
    if (isHappy || isDizzy) return;

    if (happyTimeoutRef.current != null) {
      window.clearTimeout(happyTimeoutRef.current);
      happyTimeoutRef.current = null;
    }

    if (dizzyTimeoutRef.current != null) {
      window.clearTimeout(dizzyTimeoutRef.current);
    }

    setIsHappy(false);
    setIsDizzy(true);
    resetDizzyTracker();
    resetEyesPosition();

    dizzyTimeoutRef.current = window.setTimeout(() => {
      setIsDizzy(false);
      resetDizzyTracker();
    }, 5000);
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (isHappy || isDizzy || !eyesRef.current) return;

      const rect = eyesRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const currentMouseX = event.clientX;
      const mouseXOffset = currentMouseX - centerX;
      const mouseYOffset = event.clientY - centerY;

      const angle = Math.atan2(mouseYOffset, mouseXOffset);
      const maxRadius = 4.5;
      const distance = Math.min(Math.hypot(mouseXOffset, mouseYOffset) / 40, maxRadius);
      const moveX = Math.cos(angle) * distance;
      const moveY = Math.sin(angle) * distance;

      eyesRef.current.style.transform = `translate(${moveX}px, ${moveY}px)`;

      const deltaX = currentMouseX - lastMouseXForDizzyRef.current;
      if (Math.abs(deltaX) > 10) {
        const currentDirection = Math.sign(deltaX);
        if (lastDirectionRef.current !== 0 && currentDirection !== lastDirectionRef.current) {
          const now = Date.now();
          if (now - lastReversalTimeRef.current < 250) {
            reversalCountRef.current += 1;
            if (reversalCountRef.current >= 30) {
              triggerDizzy();
              return;
            }
          } else {
            reversalCountRef.current = 1;
          }
          lastReversalTimeRef.current = now;
        }

        lastDirectionRef.current = currentDirection;
        lastMouseXForDizzyRef.current = currentMouseX;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [isHappy, isDizzy]);

  useEffect(() => {
    return () => {
      if (happyTimeoutRef.current != null) {
        window.clearTimeout(happyTimeoutRef.current);
      }

      if (dizzyTimeoutRef.current != null) {
        window.clearTimeout(dizzyTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (isHappy || isDizzy) return;

    if (happyTimeoutRef.current != null) {
      window.clearTimeout(happyTimeoutRef.current);
    }

    setIsHappy(true);
    resetEyesPosition();

    happyTimeoutRef.current = window.setTimeout(() => {
      setIsHappy(false);
    }, 1000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('companion-bot', isHappy && 'happy', isDizzy && 'dizzy', className)}
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
          <g className="eye-hover left-eye-origin">
            <g className="bot-eye left-eye-origin">
              <circle className="normal-eye bot-eye-dot" cx="40" cy="47" r="5.5" />
              <circle className="normal-eye bot-eye-catchlight-main" cx="41.5" cy="44.5" r="1.5" />
              <circle className="normal-eye bot-eye-catchlight-sub" cx="38.5" cy="48.5" r="0.8" />
              <path className="excited-eye bot-excited-eye" d="M35 48 Q40 42 45 48" />
            </g>
          </g>

          <g className="eye-hover right-eye-origin">
            <g className="bot-eye right-eye-origin">
              <circle className="normal-eye bot-eye-dot" cx="60" cy="47" r="5.5" />
              <circle className="normal-eye bot-eye-catchlight-main" cx="61.5" cy="44.5" r="1.5" />
              <circle className="normal-eye bot-eye-catchlight-sub" cx="58.5" cy="48.5" r="0.8" />
              <path className="excited-eye bot-excited-eye" d="M55 48 Q60 42 65 48" />
            </g>
          </g>
        </g>

        <g className="bot-happy-eyes">
          <polyline points="36,47 40,43 44,47" className="bot-happy-eye-line" />
          <polyline points="56,47 60,43 64,47" className="bot-happy-eye-line" />
        </g>

        <g className="bot-dizzy-eyes">
          <path d="M36 43 L44 51 M44 43 L36 51" className="bot-dizzy-eye-line" />
          <path d="M56 43 L64 51 M64 43 L56 51" className="bot-dizzy-eye-line" />
        </g>

        <g className="bot-blush">
          <ellipse cx="32" cy="53" rx="5" ry="2.5" className="bot-blush-dot" />
          <ellipse cx="68" cy="53" rx="5" ry="2.5" className="bot-blush-dot" />
        </g>
      </svg>
    </button>
  );
}
