import type { TernaryDataPoint } from '@/types/election';

export interface TernaryCoordinate {
  x: number;
  y: number;
}

export interface TernaryPlotConfig {
  width: number;
  height: number;
  padding: number;
  labels: [string, string, string];
}

/**
 * Convert barycentric coordinates (a, b, c where a+b+c=1) to Cartesian coordinates
 * for an equilateral triangle.
 *
 * The triangle is oriented with:
 * - Labour (a) at the top vertex
 * - Conservative (b) at bottom-right vertex
 * - Other (c) at bottom-left vertex
 */
export function barycentricToCartesian(
  a: number,
  b: number,
  c: number,
  radius: number
): TernaryCoordinate {
  // Ensure values sum to 1
  const total = a + b + c;
  const normA = a / total;
  const normB = b / total;
  const normC = c / total;

  // Equilateral triangle vertices (centered at origin)
  // Top vertex (Labour)
  const ax = 0;
  const ay = -radius;
  // Bottom-right vertex (Conservative)
  const bx = radius * Math.cos(Math.PI / 6);
  const by = radius * Math.sin(Math.PI / 6);
  // Bottom-left vertex (Other)
  const cx = -radius * Math.cos(Math.PI / 6);
  const cy = radius * Math.sin(Math.PI / 6);

  // Weighted average of vertices
  const x = normA * ax + normB * bx + normC * cx;
  const y = normA * ay + normB * by + normC * cy;

  return { x, y };
}

/**
 * Generate the path for the triangle boundary
 */
export function generateTrianglePath(radius: number): string {
  // Top vertex
  const topX = 0;
  const topY = -radius;
  // Bottom-right vertex
  const brX = radius * Math.cos(Math.PI / 6);
  const brY = radius * Math.sin(Math.PI / 6);
  // Bottom-left vertex
  const blX = -radius * Math.cos(Math.PI / 6);
  const blY = radius * Math.sin(Math.PI / 6);

  return `M ${topX} ${topY} L ${brX} ${brY} L ${blX} ${blY} Z`;
}

/**
 * Generate grid lines for the ternary plot
 */
export function generateGridLines(
  radius: number,
  divisions: number = 10
): Array<{ x1: number; y1: number; x2: number; y2: number; value: number }> {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; value: number }> = [];

  for (let i = 1; i < divisions; i++) {
    const value = i / divisions;

    // Lines parallel to each side
    // Lines of constant Labour (parallel to Conservative-Other edge)
    const labStart = barycentricToCartesian(value, 1 - value, 0, radius);
    const labEnd = barycentricToCartesian(value, 0, 1 - value, radius);
    lines.push({ x1: labStart.x, y1: labStart.y, x2: labEnd.x, y2: labEnd.y, value });

    // Lines of constant Conservative (parallel to Labour-Other edge)
    const conStart = barycentricToCartesian(1 - value, value, 0, radius);
    const conEnd = barycentricToCartesian(0, value, 1 - value, radius);
    lines.push({ x1: conStart.x, y1: conStart.y, x2: conEnd.x, y2: conEnd.y, value });

    // Lines of constant Other (parallel to Labour-Conservative edge)
    const othStart = barycentricToCartesian(1 - value, 0, value, radius);
    const othEnd = barycentricToCartesian(0, 1 - value, value, radius);
    lines.push({ x1: othStart.x, y1: othStart.y, x2: othEnd.x, y2: othEnd.y, value });
  }

  return lines;
}

/**
 * Generate axis tick positions and labels
 */
export function generateAxisTicks(
  radius: number,
  divisions: number = 10
): Array<{ x: number; y: number; label: string; axis: 'labour' | 'conservative' | 'other' }> {
  const ticks: Array<{ x: number; y: number; label: string; axis: 'labour' | 'conservative' | 'other' }> = [];
  const offset = 15; // Offset from triangle edge

  for (let i = 0; i <= divisions; i++) {
    const value = i / divisions;

    // Labour axis (bottom edge, from Conservative to Other)
    const labPos = barycentricToCartesian(0, 1 - value, value, radius);
    ticks.push({
      x: labPos.x,
      y: labPos.y + offset,
      label: `${Math.round(value * 100)}%`,
      axis: 'labour',
    });

    // Conservative axis (left edge, from Other to Labour)
    const conPos = barycentricToCartesian(value, 0, 1 - value, radius);
    ticks.push({
      x: conPos.x - offset,
      y: conPos.y,
      label: `${Math.round(value * 100)}%`,
      axis: 'conservative',
    });

    // Other axis (right edge, from Labour to Conservative)
    const othPos = barycentricToCartesian(1 - value, value, 0, radius);
    ticks.push({
      x: othPos.x + offset,
      y: othPos.y,
      label: `${Math.round(value * 100)}%`,
      axis: 'other',
    });
  }

  return ticks;
}

/**
 * Transform ternary data points to screen coordinates
 */
export function transformTernaryPoints(
  data: TernaryDataPoint[],
  config: TernaryPlotConfig,
  radiusOverride?: number,
  centerXOverride?: number,
  centerYOverride?: number
): Array<TernaryDataPoint & TernaryCoordinate> {
  const radius = radiusOverride ?? (Math.min(config.width, config.height) / 2 - config.padding);
  const centerX = centerXOverride ?? config.width / 2;
  const centerY = centerYOverride ?? config.height / 2;

  return data.map((point) => {
    const coord = barycentricToCartesian(
      point.labour,
      point.conservative,
      point.other,
      radius
    );
    return {
      ...point,
      x: coord.x + centerX,
      y: coord.y + centerY,
    };
  });
}
