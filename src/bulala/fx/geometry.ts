/** Pure layout helpers for radial menus — easy to unit-test. */

export type Point = { x: number; y: number };

export type Box = { width: number; height: number };

export type Insets = { top?: number; right?: number; bottom?: number; left?: number };

export function ringPositions(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  startAngle = -Math.PI / 2,
  sweep = Math.PI * 2,
): Point[] {
  const out: Point[] = [];
  if (count <= 0) return out;
  // Full circle: even spacing. Arc: distribute inclusive endpoints.
  const step = count === 1 ? 0 : sweep >= Math.PI * 2 - 1e-6 ? sweep / count : sweep / (count - 1);
  for (let i = 0; i < count; i++) {
    const a = startAngle + i * step;
    out.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return out;
}

/** Keep a point inside a box with padding. */
export function clampPoint(
  p: Point,
  box: { left: number; top: number; width: number; height: number },
  pad = 48,
): Point {
  return {
    x: Math.min(box.width - pad, Math.max(pad, p.x)),
    y: Math.min(box.height - pad, Math.max(pad, p.y)),
  };
}

export function directionFromCenter(cx: number, cy: number, x: number, y: number): Point {
  const dx = x - cx;
  const dy = y - cy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: -dy / len }; // y flipped for creature look space
}

/**
 * Fit a radial ring into a safe rectangle.
 * Prefers an upper arc when bottom space is tight (collection peek, tabbar).
 * Returns center (possibly nudged), radius, and blob positions — all inside the box.
 */
export function fitRadialLayout(opts: {
  cx: number;
  cy: number;
  count: number;
  desiredRadius: number;
  box: Box;
  insets?: Insets;
  blobPad?: number;
}): { center: Point; radius: number; points: Point[]; arc: boolean } {
  const pad = opts.blobPad ?? 34;
  const inset = {
    top: opts.insets?.top ?? 8,
    right: opts.insets?.right ?? 8,
    bottom: opts.insets?.bottom ?? 8,
    left: opts.insets?.left ?? 8,
  };
  const minX = inset.left + pad;
  const maxX = opts.box.width - inset.right - pad;
  const minY = inset.top + pad;
  const maxY = opts.box.height - inset.bottom - pad;

  let cx = Math.min(maxX, Math.max(minX, opts.cx));
  let cy = Math.min(maxY, Math.max(minY, opts.cy));

  const spaceAbove = cy - minY;
  const spaceBelow = maxY - cy;
  const spaceLeft = cx - minX;
  const spaceRight = maxX - cx;

  // Upper fan when bottom is reserved (collection peek) or physically cramped.
  const arc =
    inset.bottom >= 80 ||
    spaceBelow < opts.desiredRadius * 0.85 ||
    spaceBelow < 72;
  const startAngle = arc ? Math.PI * 0.95 : -Math.PI / 2;
  const sweep = arc ? Math.PI * 1.1 : Math.PI * 2;

  const maxByBox = Math.max(
    48,
    Math.min(
      spaceLeft,
      spaceRight,
      arc ? spaceAbove : Math.min(spaceAbove, spaceBelow),
      // Cap so diameter never exceeds ~72% of the shorter side.
      Math.min(opts.box.width, opts.box.height) * 0.36,
    ),
  );

  let radius = Math.min(opts.desiredRadius, maxByBox);

  // If still overflowing after angle choice, shrink until all points fit.
  for (let guard = 0; guard < 12; guard++) {
    const pts = ringPositions(cx, cy, radius, opts.count, startAngle, sweep);
    let ok = true;
    let worst = 0;
    for (const p of pts) {
      const ox = p.x < minX ? minX - p.x : p.x > maxX ? p.x - maxX : 0;
      const oy = p.y < minY ? minY - p.y : p.y > maxY ? p.y - maxY : 0;
      const o = Math.hypot(ox, oy);
      if (o > 0.5) {
        ok = false;
        worst = Math.max(worst, o);
      }
    }
    if (ok) {
      return { center: { x: cx, y: cy }, radius, points: pts, arc };
    }
    radius = Math.max(44, radius - Math.max(6, worst));
  }

  // Last resort: clamp each point into the safe box.
  const points = ringPositions(cx, cy, radius, opts.count, startAngle, sweep).map((p) => ({
    x: Math.min(maxX, Math.max(minX, p.x)),
    y: Math.min(maxY, Math.max(minY, p.y)),
  }));
  return { center: { x: cx, y: cy }, radius, points, arc };
}
