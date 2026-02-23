import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface CompanionBotLogoProps {
  className?: string;
}

const BOT_STATE_CLASSES = [
  'hovered',
  'happy',
  'sleeping',
  'annoyed-1',
  'annoyed-2',
  'annoyed-3',
  'typing',
  'pinging',
  'dizzy',
  'petting',
  'vacation',
  'vacation-shock',
  'vacation-falling',
  'vacation-headbutt',
  'vacation-nervous',
  'charging',
  'overloaded',
  'exploding',
] as const;

const BOT_SVG_MARKUP = `
  <g id="vacation-chair" style="transform-origin: center;">
    <rect x="25" y="65" width="5" height="20" fill="#8B4513"/>
    <rect x="70" y="65" width="5" height="20" fill="#8B4513"/>
    <rect x="18" y="75" width="6" height="15" fill="#A0522D"/>
    <rect x="76" y="75" width="6" height="15" fill="#A0522D"/>
    <polygon points="25,65 75,65 82,80 18,80" fill="#CD853F" />
    <line x1="23" y1="70" x2="77" y2="70" stroke="#8B4513" stroke-width="2"/>
    <line x1="20" y1="75" x2="80" y2="75" stroke="#8B4513" stroke-width="2"/>
    <polygon points="25,65 75,65 65,15 35,15" fill="#D2691E" />
    <line x1="33" y1="25" x2="67" y2="25" stroke="#8B4513" stroke-width="2"/>
    <line x1="30" y1="35" x2="70" y2="35" stroke="#8B4513" stroke-width="2"/>
    <line x1="28" y1="45" x2="72" y2="45" stroke="#8B4513" stroke-width="2"/>
    <line x1="26" y1="55" x2="74" y2="55" stroke="#8B4513" stroke-width="2"/>
  </g>

  <circle cx="50" cy="50" r="35" fill="var(--bot-accent-blue)" opacity="0.05" filter="blur(5px)" />

  <g id="bot-zzz">
    <text x="65" y="25" fill="var(--bot-accent-blue)" font-size="12" font-weight="bold" class="z-float">Z</text>
    <text x="75" y="15" fill="var(--bot-accent-blue)" font-size="9" font-weight="bold" class="z-float delay-1">z</text>
    <text x="82" y="5" fill="var(--bot-accent-blue)" font-size="6" font-weight="bold" class="z-float delay-2">z</text>
  </g>

  <g id="bot-hearts">
    <path class="float-heart fh-1" d="M 10 30 A 3 3 0 0 1 15 30 A 3 3 0 0 1 20 30 Q 20 36 15 42 Q 10 36 10 30 Z" fill="var(--bot-accent-pink)" />
    <path class="float-heart fh-2" d="M 80 20 A 4 4 0 0 1 87 20 A 4 4 0 0 1 94 20 Q 94 28 87 35 Q 80 28 80 20 Z" fill="var(--bot-accent-pink)" />
    <path class="float-heart fh-3" d="M 20 15 A 2 2 0 0 1 24 15 A 2 2 0 0 1 28 15 Q 28 19 24 23 Q 20 19 20 15 Z" fill="var(--bot-accent-pink)" />
  </g>

  <g id="bot-steam">
    <path class="steam-puff puff-1" d="M 18 35 Q 10 25 18 15" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>
    <path class="steam-puff puff-2" d="M 14 38 Q 8 28 15 18" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
    <path class="steam-puff puff-1" d="M 82 35 Q 90 25 82 15" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>
    <path class="steam-puff puff-2" d="M 86 38 Q 92 28 85 18" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
  </g>

  <g id="bot-gibs" style="transform-origin: 50px 50px;">
    <g class="gib-1" style="transform-origin: 50px 50px;">
      <circle cx="50" cy="50" r="6" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="2 2" />
      <circle cx="50" cy="50" r="2" fill="#94a3b8" />
    </g>
    <g class="gib-2" style="transform-origin: 50px 50px;">
      <path d="M 46 44 L 52 46 L 48 50 L 54 52 L 50 56" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g class="gib-3" style="transform-origin: 50px 50px;">
      <circle cx="50" cy="50" r="3" fill="#64748b" />
      <line x1="48" y1="50" x2="52" y2="50" stroke="#0f172a" stroke-width="1"/>
    </g>
    <g class="gib-4" style="transform-origin: 50px 50px;">
      <rect x="47" y="47" width="6" height="6" fill="#10b981" />
      <circle cx="50" cy="50" r="1.5" fill="#fcd34d" />
    </g>
  </g>

  <g id="bot-assembly">
    <g id="bot-antenna" style="transform-origin: 50px 25px;">
      <path d="M50,25 L50,8" stroke="#64748b" stroke-width="4" stroke-linecap="round"/>
      <circle id="antenna-bulb" cx="50" cy="8" r="4" fill="#ef4444" />
    </g>

    <rect id="bot-body" x="20" y="25" width="60" height="50" rx="15" fill="#1e293b" stroke="#334155" stroke-width="3" style="transform-origin: 50px 50px;" />

    <g id="bot-head-plate" style="transform-origin: 50px 47px;">
      <rect id="bot-face" x="30" y="35" width="40" height="25" rx="6" fill="#0f172a" stroke="#020617" stroke-width="2" />

      <g id="bot-eyes" style="transform-origin: 50px 47px;">
        <g class="eye-hover left-eye-origin">
          <g class="bot-eye left-eye-origin">
            <circle class="normal-eye" cx="40" cy="47" r="5.5" fill="var(--bot-accent-blue)" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
            <circle class="normal-eye" cx="41.5" cy="44.5" r="1.5" fill="#ffffff" opacity="0.9" />
            <circle class="normal-eye" cx="38.5" cy="48.5" r="0.8" fill="#ffffff" opacity="0.6" />
            <path class="excited-eye" d="M 35 48 Q 40 42 45 48" fill="none" stroke="var(--bot-accent-blue)" stroke-width="2.5" stroke-linecap="round" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
          </g>
        </g>
        <g class="eye-hover right-eye-origin">
          <g class="bot-eye right-eye-origin">
            <circle class="normal-eye" cx="60" cy="47" r="5.5" fill="var(--bot-accent-blue)" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
            <circle class="normal-eye" cx="61.5" cy="44.5" r="1.5" fill="#ffffff" opacity="0.9" />
            <circle class="normal-eye" cx="58.5" cy="48.5" r="0.8" fill="#ffffff" opacity="0.6" />
            <path class="excited-eye" d="M 55 48 Q 60 42 65 48" fill="none" stroke="var(--bot-accent-blue)" stroke-width="2.5" stroke-linecap="round" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
          </g>
        </g>
      </g>

      <g id="bot-happy-eyes">
        <polyline points="36,47 40,43 44,47" stroke="var(--bot-accent-blue)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="56,47 60,43 64,47" stroke="var(--bot-accent-blue)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </g>

      <g id="bot-vacation-eyes">
        <path d="M 36 43 Q 40 52 44 43" fill="none" stroke="var(--bot-accent-blue)" stroke-width="2.5" stroke-linecap="round" filter="drop-shadow(0 0 2px var(--bot-accent-blue))"/>
        <path d="M 56 43 Q 60 52 64 43" fill="none" stroke="var(--bot-accent-blue)" stroke-width="2.5" stroke-linecap="round" filter="drop-shadow(0 0 2px var(--bot-accent-blue))"/>
      </g>

      <circle id="bot-vacation-mouth" cx="50" cy="53" r="2.5" fill="#0f172a" stroke="var(--bot-accent-blue)" stroke-width="1.5" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" style="transform-origin: 50px 53px;" />

      <g id="bot-surprised-eyes">
        <circle cx="40" cy="46" r="4" fill="none" stroke="var(--bot-accent-blue)" stroke-width="2.5" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
        <circle cx="60" cy="46" r="4" fill="none" stroke="var(--bot-accent-blue)" stroke-width="2.5" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
      </g>

      <g id="bot-panicked-eyes">
        <circle cx="38" cy="46" r="4.5" fill="none" stroke="var(--bot-accent-blue)" stroke-width="2" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
        <circle cx="62" cy="46" r="4.5" fill="none" stroke="var(--bot-accent-blue)" stroke-width="2" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
        <circle cx="38" cy="46" r="1.5" fill="var(--bot-accent-blue)" />
        <circle cx="62" cy="46" r="1.5" fill="var(--bot-accent-blue)" />
        <polyline points="46,52 48,50 52,54 54,52" fill="none" stroke="var(--bot-accent-blue)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <path class="sweat-drop" d="M 66 32 Q 70 38 66 41 Q 62 38 66 32 Z" fill="#0ea5e9" opacity="0.9" />
      </g>

      <g id="bot-heart-eyes">
        <path d="M 35 45 A 3 3 0 0 1 40 45 A 3 3 0 0 1 45 45 Q 45 50 40 54 Q 35 50 35 45 Z" fill="var(--bot-accent-pink)" filter="drop-shadow(0 0 3px var(--bot-accent-pink))"/>
        <path d="M 55 45 A 3 3 0 0 1 60 45 A 3 3 0 0 1 65 45 Q 65 50 60 54 Q 55 50 55 45 Z" fill="var(--bot-accent-pink)" filter="drop-shadow(0 0 3px var(--bot-accent-pink))"/>
      </g>

      <g id="bot-typing-eyes">
        <rect x="36" y="48" width="8" height="3" rx="1.5" fill="var(--bot-accent-blue)" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
        <rect x="56" y="48" width="8" height="3" rx="1.5" fill="var(--bot-accent-blue)" filter="drop-shadow(0 0 2px var(--bot-accent-blue))" />
      </g>

      <g id="bot-annoyed-1-eyes">
        <line x1="34" y1="46" x2="46" y2="46" stroke="var(--bot-accent-blue)" stroke-width="3" stroke-linecap="round" />
        <line x1="54" y1="46" x2="66" y2="46" stroke="var(--bot-accent-blue)" stroke-width="3" stroke-linecap="round" />
      </g>

      <g id="bot-annoyed-2-eyes">
        <line x1="32" y1="43" x2="46" y2="46" stroke="var(--bot-accent-secondary)" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="68" y1="43" x2="54" y2="46" stroke="var(--bot-accent-secondary)" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="40" cy="48" r="3.5" fill="var(--bot-accent-secondary)" />
        <circle cx="60" cy="48" r="3.5" fill="var(--bot-accent-secondary)" />
      </g>

      <g id="bot-annoyed-3-eyes">
        <path d="M 33 42 L 45 46 L 35 50 Z" fill="var(--bot-accent-red)" filter="drop-shadow(0 0 3px var(--bot-accent-red))"/>
        <path d="M 67 42 L 55 46 L 65 50 Z" fill="var(--bot-accent-red)" filter="drop-shadow(0 0 3px var(--bot-accent-red))"/>
        <line x1="31" y1="39" x2="47" y2="43" stroke="var(--bot-accent-red)" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="69" y1="39" x2="53" y2="43" stroke="var(--bot-accent-red)" stroke-width="2.5" stroke-linecap="round"/>
      </g>

      <g id="bot-sleepy-eyes">
        <line x1="36" y1="48" x2="44" y2="48" stroke="var(--bot-accent-blue)" stroke-width="2.5" stroke-linecap="round" />
        <line x1="56" y1="48" x2="64" y2="48" stroke="var(--bot-accent-blue)" stroke-width="2.5" stroke-linecap="round" />
      </g>

      <g id="bot-dizzy-eyes">
        <path d="M 36 43 L 44 51 M 44 43 L 36 51" stroke="var(--bot-accent-blue)" stroke-width="2.5" stroke-linecap="round" />
        <path d="M 56 43 L 64 51 M 64 43 L 56 51" stroke="var(--bot-accent-blue)" stroke-width="2.5" stroke-linecap="round" />
      </g>
    </g>

    <g id="bot-blush">
      <ellipse cx="32" cy="53" rx="5" ry="2.5" fill="#ef4444" opacity="0.8" filter="blur(1px)"/>
      <ellipse cx="68" cy="53" rx="5" ry="2.5" fill="#ef4444" opacity="0.8" filter="blur(1px)"/>
    </g>
  </g>

  <g id="vacation-drink">
    <rect x="73" y="66" width="20" height="4" fill="#8B4513" rx="1"/>
    <rect x="81" y="70" width="4" height="20" fill="#8B4513"/>
    <rect x="76" y="48" width="14" height="18" rx="2" fill="#ef4444" />
    <rect x="76" y="50" width="14" height="3" fill="#cbd5e1" />
    <text x="83" y="61" fill="#ffffff" font-size="4.5" font-family="sans-serif" font-weight="bold" text-anchor="middle">cola</text>
    <path d="M 83 48 L 83 34 L 53 39" fill="none" stroke="#fcd34d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <g id="bot-typing-gear">
    <path d="M 18 64 L 82 64 L 92 78 L 8 78 Z" fill="#0f172a" stroke="#38bdf8" stroke-width="2" stroke-linejoin="round" filter="drop-shadow(0 4px 6px rgba(56,189,248,0.2))" />
    <rect x="24" y="66" width="6" height="4" rx="1" fill="#cbd5e1" />
    <rect x="32" y="66" width="6" height="4" rx="1" fill="#cbd5e1" />
    <rect x="40" y="66" width="6" height="4" rx="1" fill="#cbd5e1" />
    <rect x="48" y="66" width="6" height="4" rx="1" fill="#cbd5e1" />
    <rect x="56" y="66" width="6" height="4" rx="1" fill="#cbd5e1" />
    <rect x="64" y="66" width="6" height="4" rx="1" fill="#cbd5e1" />
    <rect x="72" y="66" width="6" height="4" rx="1" fill="#cbd5e1" />
    <rect x="22" y="72" width="8" height="4" rx="1" fill="#ef4444" />
    <rect x="32" y="72" width="36" height="4" rx="1.5" fill="var(--bot-accent-blue)" />
    <rect x="70" y="72" width="8" height="4" rx="1" fill="#8b5cf6" />

    <g id="bot-hand-l">
      <rect x="32" y="58" width="10" height="12" rx="3" fill="#1e293b" stroke="var(--bot-accent-blue)" stroke-width="1.5" />
    </g>
    <g id="bot-hand-r">
      <rect x="58" y="58" width="10" height="12" rx="3" fill="#1e293b" stroke="var(--bot-accent-blue)" stroke-width="1.5" />
    </g>
  </g>
`;

export default function CompanionBotLogo({ className }: CompanionBotLogoProps) {
  const botContainerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const botContainer = botContainerRef.current;
    if (!botContainer) {
      return undefined;
    }

    const botEyes = botContainer.querySelector<SVGGElement>('#bot-eyes');
    if (!botEyes) {
      return undefined;
    }

    let isAnimating = false;
    let isSleeping = false;
    let annoyedLevel = 0;
    let isCharging = false;
    let isOverloaded = false;
    let isMouseOutside = false;

    let idleTimer: number | null = null;
    let typingTimer: number | null = null;
    let pettingTimer: number | null = null;
    let annoyedResetTimer: number | null = null;
    let happyBounceTimer: number | null = null;
    let holdChargeTimer: number | null = null;
    let vacationTimer: number | null = null;
    let wasJustChargingTimer: number | null = null;

    let clickCount = 0;
    let lastClickTime = 0;
    let petCount = 0;
    let lastPetX = 0;
    let wasJustCharging = false;
    let lastMouseXForDizzy = 0;
    let lastDirection = 0;
    let reversalCount = 0;
    let lastReversalTime = 0;

    const trackedTimeouts = new Set<number>();

    const trackTimeout = (callback: () => void, delayMs: number) => {
      const timeoutId = window.setTimeout(() => {
        trackedTimeouts.delete(timeoutId);
        callback();
      }, delayMs);
      trackedTimeouts.add(timeoutId);
      return timeoutId;
    };

    const clearTimeoutIfSet = (timeoutId: number | null) => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        trackedTimeouts.delete(timeoutId);
      }
    };

    const resetEyeTracking = () => {
      botEyes.style.transform = 'translate(0px, 0px)';
    };

    const clearAllStates = () => {
      botContainer.classList.remove(...BOT_STATE_CLASSES);
      annoyedLevel = 0;
      isSleeping = false;
      isCharging = false;
      isOverloaded = false;
      resetEyeTracking();

      clearTimeoutIfSet(annoyedResetTimer);
      annoyedResetTimer = null;
      clearTimeoutIfSet(happyBounceTimer);
      happyBounceTimer = null;
      clearTimeoutIfSet(holdChargeTimer);
      holdChargeTimer = null;
    };

    const resetIdleTimer = () => {
      if (isSleeping) {
        isSleeping = false;
        botContainer.classList.remove('sleeping');
      }

      clearTimeoutIfSet(idleTimer);
      idleTimer = null;

      if (!isAnimating && annoyedLevel === 0 && !isMouseOutside) {
        idleTimer = trackTimeout(() => {
          if (!isAnimating && annoyedLevel === 0 && !isMouseOutside) {
            isSleeping = true;
            botContainer.classList.remove('hovered');
            botContainer.classList.add('sleeping');
            resetEyeTracking();
          }
        }, 4000);
      }
    };

    const playLockedAnimation = (
      classes: string | string[],
      durationMs: number,
      callback?: () => void,
    ) => {
      isAnimating = true;
      clearAllStates();

      const classNames = Array.isArray(classes) ? classes : [classes];
      classNames.forEach((classNameToAdd) => botContainer.classList.add(classNameToAdd));

      trackTimeout(() => {
        botContainer.classList.remove(...classNames);
        isAnimating = false;
        resetIdleTimer();
        if (callback) {
          callback();
        }
      }, durationMs);
    };

    const setAnnoyed = (level: 1 | 2 | 3) => {
      annoyedLevel = level;
      botContainer.classList.remove('hovered', 'annoyed-1', 'annoyed-2', 'annoyed-3');
      botContainer.classList.add(`annoyed-${level}`);
      resetEyeTracking();

      clearTimeoutIfSet(annoyedResetTimer);
      annoyedResetTimer = trackTimeout(() => {
        clearAllStates();
        clickCount = 0;
      }, 2500);
    };

    const handleMouseEnterBot = () => {
      if (!isAnimating && !isSleeping && annoyedLevel === 0) {
        botContainer.classList.add('hovered');
      }
    };

    const handleMouseLeaveBot = () => {
      botContainer.classList.remove('hovered');
    };

    const handleDocumentMouseLeave = () => {
      isMouseOutside = true;
      clearTimeoutIfSet(idleTimer);
      idleTimer = null;

      if (
        isAnimating ||
        isCharging ||
        annoyedLevel > 0 ||
        botContainer.classList.contains('typing')
      ) {
        return;
      }

      clearTimeoutIfSet(vacationTimer);
      vacationTimer = trackTimeout(() => {
        isAnimating = true;
        clearAllStates();
        botContainer.classList.add('vacation');
      }, 4000);
    };

    const handleDocumentMouseEnter = () => {
      isMouseOutside = false;
      clearTimeoutIfSet(vacationTimer);
      vacationTimer = null;

      if (botContainer.classList.contains('vacation')) {
        botContainer.classList.remove('vacation');
        botContainer.classList.add('vacation-shock');

        trackTimeout(() => {
          botContainer.classList.remove('vacation-shock');
          botContainer.classList.add('vacation-falling');

          trackTimeout(() => {
            botContainer.classList.remove('vacation-falling');
            botContainer.classList.add('vacation-headbutt');

            trackTimeout(() => {
              botContainer.classList.remove('vacation-headbutt');
              botContainer.classList.add('vacation-nervous');

              trackTimeout(() => {
                botContainer.classList.remove('vacation-nervous');
                isAnimating = false;
                resetIdleTimer();
              }, 3000);
            }, 800);
          }, 600);
        }, 800);
      } else {
        resetIdleTimer();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      resetIdleTimer();

      if (isAnimating || isSleeping || annoyedLevel > 0) {
        return;
      }

      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) {
        return;
      }

      botContainer.classList.add('typing');
      resetEyeTracking();

      clearTimeoutIfSet(typingTimer);
      typingTimer = trackTimeout(() => {
        botContainer.classList.remove('typing');
      }, 800);
    };

    const handleGlobalMouseMove = (event: MouseEvent) => {
      resetIdleTimer();

      if (isAnimating || isSleeping || annoyedLevel > 0 || botContainer.classList.contains('typing')) {
        return;
      }

      const currentMouseX = event.clientX;
      const rect = botEyes.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const mouseXOffset = currentMouseX - centerX;
      const mouseYOffset = event.clientY - centerY;

      const angle = Math.atan2(mouseYOffset, mouseXOffset);
      const maxRadius = 4.5;
      const distance = Math.min(Math.hypot(mouseXOffset, mouseYOffset) / 40, maxRadius);

      const moveX = Math.cos(angle) * distance;
      const moveY = Math.sin(angle) * distance;

      botEyes.style.transform = `translate(${moveX}px, ${moveY}px)`;

      const deltaX = currentMouseX - lastMouseXForDizzy;
      if (Math.abs(deltaX) > 10) {
        const currentDirection = Math.sign(deltaX);

        if (lastDirection !== 0 && currentDirection !== lastDirection) {
          const now = Date.now();

          if (now - lastReversalTime < 250) {
            reversalCount += 1;

            if (reversalCount >= 30) {
              reversalCount = 0;
              playLockedAnimation('dizzy', 5000);
              return;
            }
          } else {
            reversalCount = 1;
          }

          lastReversalTime = now;
        }

        lastDirection = currentDirection;
        lastMouseXForDizzy = currentMouseX;
      }
    };

    const handleBotMouseMove = (event: MouseEvent) => {
      if (isAnimating || isSleeping || annoyedLevel > 0) {
        return;
      }

      const localDeltaX = Math.abs(event.clientX - lastPetX);
      if (localDeltaX > 3) {
        petCount += 1;
        lastPetX = event.clientX;

        if (petCount > 10 && !botContainer.classList.contains('petting')) {
          botContainer.classList.add('petting');
          botContainer.classList.remove('hovered');
          resetEyeTracking();
        }

        clearTimeoutIfSet(pettingTimer);
        pettingTimer = trackTimeout(() => {
          petCount = 0;
          botContainer.classList.remove('petting');
        }, 200);
      }
    };

    const handleDocumentMouseDown = (event: MouseEvent) => {
      resetIdleTimer();
      if (botContainer.contains(event.target as Node) || isAnimating) {
        return;
      }

      botContainer.classList.add('pinging');
      trackTimeout(() => {
        botContainer.classList.remove('pinging');
      }, 200);
    };

    const handleBotMouseDown = () => {
      reversalCount = 0;

      if (annoyedLevel === 3 && !isAnimating) {
        isCharging = true;
        botContainer.classList.add('charging');

        clearTimeoutIfSet(annoyedResetTimer);
        annoyedResetTimer = null;

        holdChargeTimer = trackTimeout(() => {
          if (isCharging) {
            isOverloaded = true;
            botContainer.classList.remove('charging');
            botContainer.classList.add('overloaded');
          }
        }, 4000);
      }
    };

    const handleWindowMouseUp = () => {
      clearTimeoutIfSet(holdChargeTimer);
      holdChargeTimer = null;

      if (isCharging || isOverloaded) {
        wasJustCharging = true;

        clearTimeoutIfSet(wasJustChargingTimer);
        wasJustChargingTimer = trackTimeout(() => {
          wasJustCharging = false;
        }, 50);

        if (isOverloaded) {
          isOverloaded = false;
          isCharging = false;
          botContainer.classList.remove('overloaded');
          playLockedAnimation('exploding', 6000);
        } else {
          isCharging = false;
          botContainer.classList.remove('charging');
          annoyedResetTimer = trackTimeout(() => {
            clearAllStates();
          }, 2500);
        }
      }
    };

    const handleBotClick = () => {
      if (wasJustCharging || isAnimating || isSleeping || isCharging || isOverloaded) {
        return;
      }

      reversalCount = 0;
      const now = Date.now();

      if (now - lastClickTime < 800) {
        clickCount += 1;
      } else {
        clickCount = 1;
      }
      lastClickTime = now;

      botContainer.classList.remove('happy');
      clearTimeoutIfSet(happyBounceTimer);
      happyBounceTimer = null;

      if (clickCount >= 12) {
        setAnnoyed(3);
      } else if (clickCount >= 8) {
        setAnnoyed(2);
      } else if (clickCount >= 4) {
        setAnnoyed(1);
      } else if (annoyedLevel === 0) {
        botContainer.classList.add('happy');
        resetEyeTracking();

        happyBounceTimer = trackTimeout(() => {
          botContainer.classList.remove('happy');
        }, 600);
      }
    };

    botContainer.addEventListener('mouseenter', handleMouseEnterBot);
    botContainer.addEventListener('mouseleave', handleMouseLeaveBot);
    document.addEventListener('mouseleave', handleDocumentMouseLeave);
    document.addEventListener('mouseenter', handleDocumentMouseEnter);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousemove', handleGlobalMouseMove);
    botContainer.addEventListener('mousemove', handleBotMouseMove);
    document.addEventListener('mousedown', handleDocumentMouseDown);
    botContainer.addEventListener('mousedown', handleBotMouseDown);
    window.addEventListener('mouseup', handleWindowMouseUp);
    botContainer.addEventListener('click', handleBotClick);

    resetIdleTimer();

    return () => {
      botContainer.removeEventListener('mouseenter', handleMouseEnterBot);
      botContainer.removeEventListener('mouseleave', handleMouseLeaveBot);
      document.removeEventListener('mouseleave', handleDocumentMouseLeave);
      document.removeEventListener('mouseenter', handleDocumentMouseEnter);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      botContainer.removeEventListener('mousemove', handleBotMouseMove);
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      botContainer.removeEventListener('mousedown', handleBotMouseDown);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      botContainer.removeEventListener('click', handleBotClick);

      trackedTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      trackedTimeouts.clear();
    };
  }, []);

  return (
    <button
      ref={botContainerRef}
      type="button"
      className={cn('companion-bot', className)}
      aria-label="AAMD companion bot"
      title="AAMD companion bot"
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        className="companion-bot-svg"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: BOT_SVG_MARKUP }}
      />
    </button>
  );
}
