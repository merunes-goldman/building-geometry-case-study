import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

// Top-down view in metres, Y up. The points are negated on Y because SVG grows downwards.
const points = (polygon) => polygon.map(([x, y]) => `${x},${-y}`).join(" ");

export default function Plan({
  site,
  footprint,
  parentFootprint,
  recomputing,
}) {
  if (!site) return null;
  const xs = site.polygon.map((p) => p[0]);
  const ys = site.polygon.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const pad = Math.max(maxX - minX, maxY - minY) * 0.05;
  const viewBox = `${minX - pad} ${-(maxY + pad)} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
  return (
    <Box sx={{ position: "absolute", inset: 0 }}>
      <svg
        viewBox={viewBox}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Site plan"
      >
        <polygon
          points={points(site.polygon)}
          fill="#f2f2f2"
          stroke="#757575"
          vectorEffect="non-scaling-stroke"
        />
        {parentFootprint && (
          <polygon
            points={points(parentFootprint)}
            fill="none"
            stroke="#1976d2"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {footprint && (
          <polygon
            points={points(footprint)}
            fill="rgba(25, 118, 210, 0.35)"
            stroke="#1976d2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {recomputing && (
        <Chip
          label="recomputing"
          size="small"
          sx={{ position: "absolute", left: 16, bottom: 16 }}
        />
      )}
    </Box>
  );
}
