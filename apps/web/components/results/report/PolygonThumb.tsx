import type { LatLng, SalinityClass } from '@rice/contracts';
import { verticesToSvgPoints } from '@/lib/display/geometry';
import { fmt } from '@/lib/display/fmt';
import th from '@/messages/th.json';
import { SALINITY_FILL } from '../ResultCards';

const W = 240;
const H = 180;

/** Static inline-SVG outline of the field (no Google Maps on the report, Phase 1). */
export function PolygonThumb({
  vertices,
  areaLabel,
  salinityClass,
}: {
  vertices: LatLng[];
  areaLabel: string;
  salinityClass: SalinityClass | null;
}) {
  const color = salinityClass ? SALINITY_FILL[salinityClass] : '#1f7a45';
  const points = verticesToSvgPoints(vertices, W, H, 16);
  const coords = points.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
  const label = fmt(th.fields.report.polygonAlt, {
    n: vertices.length,
    area: areaLabel,
    cls: salinityClass ? th.results.salinity.classes[salinityClass] : '–',
  });
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="h-auto w-full rounded-lg bg-[#eef3ea]"
    >
      <defs>
        <pattern id="field-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#d6dfd1" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#field-grid)" />
      <polygon
        points={points}
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {coords.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={9} fill="#15803d" stroke="#fff" strokeWidth={2} />
          <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
