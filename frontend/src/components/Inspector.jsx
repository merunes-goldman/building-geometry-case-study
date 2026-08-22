import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import { alpha } from "@mui/material/styles";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { errorHelperSx, formatNumber, VERDICT } from "../lib/ui.js";

// --- helpers ------------------------------------------------------------------------------------

// The constraint fields; `input` holds the hints for the number input (the real bounds live in the API).
const FIELDS = [
  { key: "setback_m", label: "Setback, m", input: { min: 0, step: "any" } },
  {
    key: "floor_to_floor_m",
    label: "Floor-to-floor, m",
    input: { min: 0.1, step: "any" },
  },
  {
    key: "max_height_m",
    label: "Max height, m",
    input: { min: 0, step: "any" },
  },
  { key: "max_floors", label: "Max floors", input: { min: 0, step: 1 } },
  {
    key: "site_coverage_ratio",
    label: "Site coverage, 0-1",
    input: { min: 0.01, max: 1, step: 0.01 },
  },
  {
    key: "gfa_target_m2",
    label: "GFA target, m2",
    input: { min: 1, step: "any" },
  },
];

const METRICS = [
  { key: "footprint_area_m2", label: "Footprint area, m2", digits: 1 },
  { key: "floor_count", label: "Floors", digits: 0 },
  { key: "height_m", label: "Height, m", digits: 1 },
  { key: "gfa_m2", label: "GFA, m2", digits: 1 },
  { key: "coverage", label: "Coverage", digits: 2 },
  { key: "far", label: "FAR", digits: 2 },
];
// Fixed column widths, so toggling the comparison moves nothing.
const PARENT_COLUMN_WIDTH = 104;
const VALUE_COLUMN_WIDTH = 88;

const REASON_TEXT = {
  footprint_collapsed:
    "the setback or the coverage inset destroyed the footprint",
  zero_floors: "no floor fits under the limits",
};

// A rejected request carries FastAPI's list of { loc, msg } for request validation, or one string from the API's own checks.
// A message for a known field goes under that field, the rest is shown as one line.
function splitError(error) {
  const fields = {};
  const general = [];
  const items = Array.isArray(error?.detail)
    ? error.detail
    : error
      ? [{ loc: [], msg: error.message }]
      : [];
  for (const { loc, msg } of items) {
    const key = loc.at(-1);
    if (FIELDS.some((field) => field.key === key)) {
      fields[key] = msg;
    } else {
      general.push(msg.replace(/^Value error, /, ""));
    }
  }
  return { fields, general: general.join("; ") };
}

function verdictText({ verdict, gfa_shortfall_m2, reason }) {
  if (verdict === "ok") {
    return "Feasible";
  }
  if (verdict === "gfa_missed") {
    return `GFA target missed by ${formatNumber(gfa_shortfall_m2, 1)} m2`;
  }
  return `Infeasible: ${REASON_TEXT[reason]}`;
}

function MetricsTable({ metrics, parent }) {
  const parentMetrics = parent?.result.metrics;
  return (
    <Table size="small" sx={{ tableLayout: "fixed" }}>
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell align="right" sx={{ width: PARENT_COLUMN_WIDTH }}>
            <Typography variant="inherit" noWrap>
              {parent && (parent.name || "unnamed")}
            </Typography>
          </TableCell>
          <TableCell align="right" sx={{ width: VALUE_COLUMN_WIDTH }}>
            current
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {METRICS.map(({ key, label, digits }) => {
          const value = formatNumber(metrics[key], digits);
          const parentValue = parentMetrics
            ? formatNumber(parentMetrics[key], digits)
            : null;
          const differs = parentValue !== null && parentValue !== value;
          return (
            <TableRow
              key={key}
              sx={{
                bgcolor: differs
                  ? (theme) => alpha(theme.palette.secondary.main, 0.16)
                  : undefined,
              }}
            >
              <TableCell>{label}</TableCell>
              <TableCell align="right" sx={{ color: "text.secondary" }}>
                {parentValue === null ? "" : `${parentValue} ->`}
              </TableCell>
              <TableCell align="right">{value}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// --- component ----------------------------------------------------------------------------------

export default function Inspector({
  selected,
  parent,
  form,
  onFormChange,
  name,
  onNameChange,
  result,
  showParent,
  onShowParent,
  onAdd,
  edited,
  onReset,
  saving,
  error,
}) {
  const compared = showParent ? parent : null;
  const differsFromParent = (key) =>
    compared && String(compared.constraints[key] ?? "") !== form[key];
  const identical =
    compared && !FIELDS.some(({ key }) => differsFromParent(key)); // an empty comparison is not a broken one
  const rejected = error?.status === 422; // a rejected input belongs to the form; anything else is the banner
  const errors = splitError(rejected ? error : null);
  return (
    <Paper sx={{ gridArea: "1 / 2 / 3 / 3", overflow: "auto" }}>
      <Stack spacing={1.5} sx={{ p: 2 }}>
        <TextField
          label="Option name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          size="small"
          slotProps={{ htmlInput: { maxLength: 30 } }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          {FIELDS.map(({ key, label, input }) => {
            const parentValue = compared?.constraints[key];
            const changed = differsFromParent(key);
            return (
              <TextField
                key={key}
                label={label}
                type="number"
                size="small"
                value={form[key]}
                onChange={(event) => onFormChange(key, event.target.value)}
                color={changed ? "secondary" : undefined}
                focused={changed || undefined}
                slotProps={{
                  htmlInput: input,
                  formHelperText: { sx: errorHelperSx },
                  input: changed
                    ? {
                        startAdornment: (
                          <InputAdornment position="start">
                            {parentValue ?? "none"} {"->"}
                          </InputAdornment>
                        ),
                      }
                    : undefined,
                }}
                error={Boolean(errors.fields[key])}
                helperText={errors.fields[key]}
              />
            );
          })}
        </Box>
        {errors.general && (
          <Typography
            variant="body2"
            color="error"
            sx={{ ...errorHelperSx, py: 0.5 }}
          >
            {errors.general}
          </Typography>
        )}
        {result && <MetricsTable metrics={result.metrics} parent={compared} />}
        <FormControlLabel
          control={
            <Switch
              checked={showParent}
              onChange={(event) => onShowParent(event.target.checked)}
            />
          }
          label="Compare to parent"
          disabled={!parent}
        />
        {error && !rejected && <Alert severity="error">{error.message}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            onClick={onAdd}
            disabled={saving || !result || rejected}
          >
            Add option
          </Button>
          <Button
            variant="outlined"
            onClick={onReset}
            disabled={saving || !edited}
          >
            Reset option
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {selected
            ? `The new option becomes a child of "${selected.name || "unnamed"}".`
            : "The new option becomes a new root."}
        </Typography>
        {result && <Divider />}
        {result && (
          <Alert severity={VERDICT[result.verdict].color}>
            {verdictText(result)}
          </Alert>
        )}
        {result?.footprint_split && result.footprint && (
          <Alert severity="info">
            The footprint split: the building stands on the kept part, the rest
            was dropped.
          </Alert>
        )}
        {identical && (
          <Alert severity="warning">
            Nothing differs from the parent: the same constraints give the same
            result.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
