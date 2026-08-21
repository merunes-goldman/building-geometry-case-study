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
import { errorHelperSx, fmt, VERDICT_COLOR } from "../lib/ui.js";

export const INSPECTOR_WIDTH = 440;

// --- helpers ------------------------------------------------------------------------------------

const FIELDS = [
  ["setback_m", "Setback, m", { min: 0, step: "any" }],
  ["floor_to_floor_m", "Floor-to-floor, m", { min: 0, step: "any" }],
  ["max_height_m", "Max height, m", { min: 0, step: "any" }],
  ["max_floors", "Max floors", { min: 0, step: 1 }],
  ["site_coverage_ratio", "Site coverage, 0-1", { min: 0, max: 1, step: 0.01 }],
  ["gfa_target_m2", "GFA target, m2", { min: 0, step: "any" }],
];
const FIELD_LABELS = new Map(FIELDS.map(([key, label]) => [key, label]));

const METRICS = [
  ["footprint_area_m2", "Footprint area, m2", 1],
  ["floor_count", "Floors", 0],
  ["height_m", "Height, m", 1],
  ["gfa_m2", "GFA, m2", 1],
  ["coverage", "Coverage", 2],
  ["far", "FAR", 2],
];

const REASON_TEXT = {
  footprint_collapsed:
    "the setback or the coverage inset destroyed the footprint",
  zero_floors: "no floor fits under the limits",
};

// A 422 detail looks like "body.constraints.setback_m: Input should be ...; body.constraints: Value error, ...".
// Field messages go under their field, the rest is shown as one line.
function splitError(text) {
  const fields = {};
  const general = [];
  for (const part of (text ?? "").split("; ").filter(Boolean)) {
    const [loc, ...rest] = part.split(": ");
    const key = loc.split(".").pop();
    if (rest.length && FIELD_LABELS.has(key)) fields[key] = rest.join(": ");
    else
      general.push(
        rest.length ? rest.join(": ").replace(/^Value error, /, "") : part,
      );
  }
  return { fields, general: general.join("; ") };
}

function VerdictAlert({ result }) {
  const { verdict, gfa_shortfall_m2, reason, footprint_split, footprint } =
    result;
  const text = {
    ok: "Feasible",
    gfa_missed: `GFA target missed by ${fmt(gfa_shortfall_m2, 1)} m2`,
    infeasible: `Infeasible: ${REASON_TEXT[reason]}`,
  }[verdict];
  return (
    <Stack spacing={1}>
      <Alert severity={VERDICT_COLOR[verdict]}>{text}</Alert>
      {footprint_split && footprint && (
        <Alert severity="info">
          The footprint split: the building stands on the kept part, the rest
          was dropped.
        </Alert>
      )}
    </Stack>
  );
}

function MetricsTable({ metrics, parentMetrics }) {
  return (
    <Table size="small" sx={{ tableLayout: "fixed" }}>
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell align="right" sx={{ width: 104 }}>
            parent
          </TableCell>
          <TableCell align="right" sx={{ width: 88 }}>
            this
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {METRICS.map(([key, label, digits]) => {
          const value = fmt(metrics[key], digits);
          const was = parentMetrics ? fmt(parentMetrics[key], digits) : null;
          return (
            <TableRow
              key={key}
              sx={{
                bgcolor:
                  was !== null && was !== value
                    ? (t) => alpha(t.palette.warning.main, 0.16)
                    : undefined,
              }}
            >
              <TableCell>{label}</TableCell>
              <TableCell align="right" sx={{ color: "text.secondary" }}>
                {was === null ? "" : `${was} ->`}
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
  previewError,
  showParent,
  onShowParent,
  onAdd,
  saving,
  error,
}) {
  const parentConstraints = showParent && parent ? parent.constraints : null;
  const errors = splitError(previewError);
  return (
    <Paper
      sx={{
        position: "absolute",
        top: 8,
        right: 8,
        bottom: 8,
        width: INSPECTOR_WIDTH,
        overflow: "auto",
      }}
    >
      <Stack spacing={1.5} sx={{ p: 2 }}>
        <TextField
          label="Option name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          size="small"
          slotProps={{ htmlInput: { maxLength: 30 } }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          {FIELDS.map(([key, label, htmlInput]) => {
            const was = parentConstraints?.[key];
            const changed =
              parentConstraints && String(was ?? "") !== form[key];
            return (
              <TextField
                key={key}
                label={label}
                type="number"
                size="small"
                value={form[key]}
                onChange={(e) => onFormChange(key, e.target.value)}
                color={changed ? "warning" : undefined}
                focused={changed || undefined}
                slotProps={{
                  htmlInput,
                  formHelperText: { sx: errorHelperSx },
                  input: changed
                    ? {
                        startAdornment: (
                          <InputAdornment position="start">
                            {was ?? "none"} {"->"}
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
        {result && (
          <MetricsTable
            metrics={result.metrics}
            parentMetrics={showParent ? parent?.result.metrics : null}
          />
        )}
        <FormControlLabel
          control={
            <Switch
              checked={showParent}
              onChange={(e) => onShowParent(e.target.checked)}
            />
          }
          label="Compare to parent"
          disabled={!selected?.parent_id}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button
          variant="contained"
          onClick={onAdd}
          disabled={saving || !result || Boolean(previewError)}
          sx={{ alignSelf: "flex-start" }}
        >
          Add option
        </Button>
        <Typography variant="caption" color="text.secondary">
          {selected
            ? `The new option becomes a child of "${selected.name || "unnamed"}".`
            : "The new option becomes a new root."}
        </Typography>
        {result && <Divider />}
        {result && <VerdictAlert result={result} />}
      </Stack>
    </Paper>
  );
}
