import { COLORS } from "../lib/ui.js";

const PADDING_RATIO = 0.05; // free space around the site, as a share of its longer side

// Top-down view in metres, Y up. The points are negated on Y because SVG grows downwards.
const svgPoints = (polygon) => polygon.map(([x, y]) => `${x},${-y}`).join(" ");

export default function Plan({ site, result, parentResult }) {
  const xs = site.polygon.map(([x]) => x);
  const ys = site.polygon.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = Math.max(maxX - minX, maxY - minY) * PADDING_RATIO;
  const viewBox = `${minX - padding} ${-(maxY + padding)} ${maxX - minX + 2 * padding} ${maxY - minY + 2 * padding}`;
  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      role="img"
      aria-label="Site plan"
    >
      <polygon
        points={svgPoints(site.polygon)}
        fill={COLORS.site}
        stroke={COLORS.siteEdge}
        vectorEffect="non-scaling-stroke"
      />
      {parentResult?.buildings.map(({ footprint }) => (
        <polygon
          key={svgPoints(footprint)}
          points={svgPoints(footprint)}
          fill="none"
          stroke={COLORS.parent}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {result?.buildings.map(({ footprint }) => (
        <polygon
          key={svgPoints(footprint)}
          points={svgPoints(footprint)}
          fill={COLORS.building}
          fillOpacity={0.35}
          stroke={COLORS.building}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
