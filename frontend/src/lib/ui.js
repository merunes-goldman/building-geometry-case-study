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

export const VERDICT = {
  ok: { color: "success", label: "feasible" },
  gfa_missed: { color: "warning", label: "GFA target missed" },
  infeasible: { color: "error", label: "infeasible" },
};

export const formatNumber = (value, digits) => value?.toFixed(digits) ?? "";
