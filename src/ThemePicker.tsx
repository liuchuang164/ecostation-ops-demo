import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { THEMES, type ThemeId } from "./theme";

export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const current = THEMES.find((theme) => theme.id === value)!;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggle.current?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const options = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitemradio"]',
          ) || [],
        );
        if (!ref.current?.contains(document.activeElement)) return;
        event.preventDefault();
        const index = options.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          index < 0
            ? event.key === "ArrowDown"
              ? 0
              : options.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) %
              options.length;
        options[next]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keydown);
    };
  }, [open]);
  return (
    <div className="theme-picker" ref={ref}>
      <button
        className="theme-toggle"
        ref={toggle}
        aria-label={`颜色风格：${current.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="切换颜色风格"
      >
        <Palette size={16} />
        <span>{current.name}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="theme-menu" role="menu" aria-label="选择颜色风格">
          <div className="theme-menu-title">颜色风格</div>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-option${value === theme.id ? " active" : ""}`}
              role="menuitemradio"
              aria-checked={value === theme.id}
              aria-label={theme.name}
              onClick={() => {
                onChange(theme.id);
                setOpen(false);
                toggle.current?.focus();
              }}
            >
              <span className={`theme-swatch ${theme.id}`} aria-hidden="true" />
              <span className="theme-option-info">
                <b>{theme.name}</b>
                <small>{theme.description}</small>
              </span>
              {value === theme.id && (
                <Check size={16} className="theme-current" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
