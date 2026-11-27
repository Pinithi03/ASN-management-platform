/**
 * Drag handle on the sidebar's right edge (desktop only).
 *
 * - Invisible at rest; on hover (after ~150 ms) a 2 px navy line appears, cursor col-resize.
 * - Pointer drag (pointer capture + requestAnimationFrame). While dragging the
 *   sidebar's width transition is off, and body cursor / user-select are locked.
 * - Dragging below ~140 px snaps to the collapsed rail; dragging out of the rail expands it.
 * - Double-click resets to the default width.
 * - Keyboard: ← / → change the width by 16 px, Home / End jump to min / max.
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_DEFAULT = 256;
const COLLAPSE_BELOW = 140;
const KEY_STEP = 16;

export const clampSidebarWidth = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));

interface Props {
  width: number;
  collapsed: boolean;
  /** Live updates while dragging (not saved). */
  onPreview: (next: { width: number; collapsed: boolean }) => void;
  /** Final value on release / keyboard / double-click (saved by the parent). */
  onCommit: (next: { width: number; collapsed: boolean }) => void;
  onDraggingChange: (dragging: boolean) => void;
}

export default function SidebarResizeHandle({ width, collapsed, onPreview, onCommit, onDraggingChange }: Props) {
  const { t } = useTranslation("layout");
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startW: number; last: { width: number; collapsed: boolean } } | null>(null);
  const frame = useRef<number | null>(null);

  const resolve = (raw: number) =>
    raw < COLLAPSE_BELOW ? { width, collapsed: true } : { width: clampSidebarWidth(raw), collapsed: false };

  const stopDragging = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setDragging(false);
    onDraggingChange(false);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startW = collapsed ? 64 : width;
    drag.current = { startX: e.clientX, startW, last: { width, collapsed } };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setDragging(true);
    onDraggingChange(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = resolve(d.startW + (e.clientX - d.startX));
    d.last = next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (drag.current) onPreview(drag.current.last);
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    stopDragging();
    if (d) onCommit(d.last);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const current = collapsed ? SIDEBAR_MIN - KEY_STEP : width;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = current - KEY_STEP;
    else if (e.key === "ArrowRight") next = collapsed ? SIDEBAR_MIN : current + KEY_STEP;
    else if (e.key === "Home") next = SIDEBAR_MIN;
    else if (e.key === "End") next = SIDEBAR_MAX;
    if (next === null) return;
    e.preventDefault();
    // Arrow-left past the minimum collapses to the rail, like dragging.
    if (e.key === "ArrowLeft" && !collapsed && width <= SIDEBAR_MIN) {
      onCommit({ width, collapsed: true });
      return;
    }
    onCommit({ width: clampSidebarWidth(next), collapsed: false });
  };

  const now = collapsed ? 64 : width;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("sidebar.resize")}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={now}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onCommit({ width: SIDEBAR_DEFAULT, collapsed: false })}
      onKeyDown={onKeyDown}
      className="group absolute right-0 top-0 z-40 h-full w-1.5 translate-x-1/2 cursor-col-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary transition-opacity motion-reduce:transition-none",
          dragging ? "opacity-100" : "opacity-0 delay-150 duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        )}
      />
    </div>
  );
}
