import { alpha } from "@mui/material/styles";

// The error text under a field sits on a light red background glued to the field's bottom edge.
export const errorHelperSx = {
  mt: 0,
  mx: 0,
  px: 1,
  py: 0.25,
  borderRadius: "0 0 4px 4px",
  bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
};

// Colours shared by the plan and the 3D view: greys for the site, MUI primary for the buildings,
// MUI secondary for the parent's — the same tint the inspector uses for differences.
export const COLORS = {
  site: "#f2f2f2",
  siteEdge: "#757575",
  building: "#1976d2",
  parent: "#9c27b0",
};

export const VERDICT = {
  ok: { color: "success", label: "feasible" },
  gfa_missed: { color: "warning", label: "GFA target missed" },
  infeasible: { color: "error", label: "infeasible" },
};

export const formatNumber = (value, digits) => value?.toFixed(digits) ?? "";
