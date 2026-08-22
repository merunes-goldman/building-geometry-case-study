import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

const PADDING_RATIO = 0.05; // free space around the site, as a share of its longer side

// Top-down view in metres, Y up. The points are negated on Y because SVG grows downwards.
// Colours: MUI primary for the footprint, MUI secondary (#9c27b0) for the parent — the same tint the inspector uses for differences.
const svgPoints = (polygon) => polygon.map(([x, y]) => `${x},${-y}`).join(" ");

export default function Plan({
  site,
  footprint,
  parentFootprint,
  recomputing,
}) {
  if (!site) {
    return null;
  }
  const xs = site.polygon.map(([x]) => x);
  const ys = site.polygon.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = Math.max(maxX - minX, maxY - minY) * PADDING_RATIO;
  const viewBox = `${minX - padding} ${-(maxY + padding)} ${maxX - minX + 2 * padding} ${maxY - minY + 2 * padding}`;
  return (
    <Box sx={{ position: "relative", minHeight: 0 }}>
      <svg
        viewBox={viewBox}
        width="100%"
        height="100%"
        role="img"
        aria-label="Site plan"
      >
        <polygon
          points={svgPoints(site.polygon)}
          fill="#f2f2f2"
          stroke="#757575"
          vectorEffect="non-scaling-stroke"
        />
        {parentFootprint && (
          <polygon
            points={svgPoints(parentFootprint)}
            fill="none"
            stroke="#9c27b0"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {footprint && (
          <polygon
            points={svgPoints(footprint)}
            fill="#1976d2"
            fillOpacity={0.35}
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
