import { alpha } from "@mui/material/styles";

// The error text under a field sits on a light red background glued to the field's bottom edge.
export const errorHelperSx = {
  mt: 0,
  mx: 0,
  px: 1,
  py: 0.25,
  borderRadius: "0 0 4px 4px",
  bgcolor: (t) => alpha(t.palette.error.main, 0.08),
};

export const VERDICT_COLOR = {
  ok: "success",
  gfa_missed: "warning",
  infeasible: "error",
};
export const VERDICT_LABEL = {
  ok: "feasible",
  gfa_missed: "target missed",
  infeasible: "infeasible",
};

export const fmt = (value, digits) =>
  value == null ? "" : Number(value).toFixed(digits);
