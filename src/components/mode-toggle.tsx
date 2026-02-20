import { useTheme } from "@/components/theme-provider"

export function ModeToggle() {
    const { theme, setTheme } = useTheme()
    const isDark = theme === "dark" || theme === "system"

    return (
        <label className="theme-toggle-label" aria-label="Toggle dark mode">
            <input
                type="checkbox"
                className="theme-toggle-checkbox"
                checked={isDark}
                onChange={(event) => setTheme(event.target.checked ? "dark" : "light")}
            />
            <span className="theme-toggle-track" aria-hidden="true" />

            <svg className="scenery-night" viewBox="0 0 140 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path className="star star-1" d="M 30 15 L 32 20 L 37 22 L 32 24 L 30 29 L 28 24 L 23 22 L 28 20 Z" fill="#e2e8f0" />
                <path className="star star-2" d="M 55 35 L 56.5 38.5 L 60 40 L 56.5 41.5 L 55 45 L 53.5 41.5 L 50 40 L 53.5 38.5 Z" fill="#cbd5e1" />
                <path className="star star-3" d="M 15 45 L 16 48 L 19 49 L 16 50 L 15 53 L 14 50 L 11 49 L 14 48 Z" fill="#e2e8f0" />
                <circle cx="45" cy="18" r="1" fill="#fff" opacity="0.6" />
                <circle cx="20" cy="30" r="1.5" fill="#fff" opacity="0.8" />
                <circle cx="65" cy="22" r="1" fill="#fff" opacity="0.4" />
            </svg>

            <svg className="scenery-day" viewBox="0 0 140 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                    <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#ffffff" />
                        <stop offset="100%" stopColor="#e0f2fe" />
                    </linearGradient>
                </defs>
                <g fill="url(#cloudGrad)">
                    <circle cx="85" cy="60" r="18" />
                    <circle cx="110" cy="55" r="22" />
                    <circle cx="135" cy="65" r="20" />
                    <path d="M 70 64 L 140 64 L 140 50 Z" />
                </g>
            </svg>

            <div className="toggle-thumb">
                <svg className="moon-icon" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <defs>
                        <linearGradient id="moonBase" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f8fafc" />
                            <stop offset="100%" stopColor="#cbd5e1" />
                        </linearGradient>
                        <linearGradient id="craterShade" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#94a3b8" />
                            <stop offset="100%" stopColor="#cbd5e1" />
                        </linearGradient>
                    </defs>
                    <circle cx="26" cy="26" r="26" fill="url(#moonBase)" />
                    <circle cx="16" cy="20" r="6" fill="url(#craterShade)" />
                    <circle cx="15.5" cy="19.5" r="5" fill="#cbd5e1" opacity="0.6" />
                    <circle cx="34" cy="34" r="8" fill="url(#craterShade)" />
                    <circle cx="33" cy="33" r="7" fill="#cbd5e1" opacity="0.6" />
                    <circle cx="36" cy="16" r="4" fill="url(#craterShade)" />
                    <circle cx="35.5" cy="15.5" r="3" fill="#cbd5e1" opacity="0.6" />
                    <circle cx="20" cy="38" r="3" fill="url(#craterShade)" />
                    <path d="M 26 0 A 26 26 0 0 1 26 52 A 20 26 0 0 0 26 0 Z" fill="#0f172a" opacity="0.15" />
                </svg>

                <svg className="sun-icon" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <defs>
                        <linearGradient id="sunBase" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#fef08a" />
                            <stop offset="100%" stopColor="#f59e0b" />
                        </linearGradient>
                    </defs>
                    <circle cx="26" cy="26" r="26" fill="#fef08a" opacity="0.2" />
                    <circle cx="26" cy="26" r="22" fill="#fde047" opacity="0.4" />
                    <g stroke="#f59e0b" strokeWidth="3" strokeLinecap="round">
                        <line x1="26" y1="4" x2="26" y2="8" />
                        <line x1="26" y1="48" x2="26" y2="44" />
                        <line x1="4" y1="26" x2="8" y2="26" />
                        <line x1="48" y1="26" x2="44" y2="26" />
                        <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" />
                        <line x1="41.5" y1="41.5" x2="38.5" y2="38.5" />
                        <line x1="10.5" y1="41.5" x2="13.5" y2="38.5" />
                        <line x1="41.5" y1="10.5" x2="38.5" y2="13.5" />
                    </g>
                    <circle cx="26" cy="26" r="14" fill="url(#sunBase)" className="sun-core" />
                </svg>
            </div>
        </label>
    )
}
