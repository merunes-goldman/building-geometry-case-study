import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useState } from "react";
import { getHealth } from "../lib/api.js";
import { errorHelperSx } from "../lib/ui.js";
import OptionSelect from "./OptionSelect.jsx";

export const TOP_PANEL_HEIGHT = 56; // 8 px padding + a small select + 8 px; the plan starts below it
const HEALTH_INTERVAL_MS = 10_000;

// GET /health on mount and then periodically: "healthy" from the response, "unreachable" on any failure.
function BackendHealth() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const check = () =>
      getHealth()
        .then((data) => setStatus(data.status))
        .catch(() => setStatus("unreachable"));
    check();
    const timer = setInterval(check, HEALTH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  const color =
    { healthy: "success", unreachable: "error" }[status] ?? "default";
  return (
    <Chip
      size="small"
      variant="outlined"
      color={color}
      label={`backend: ${status ?? "checking"}`}
    />
  );
}

function CreateSiteDialog({ open, onClose, onCreate, saving }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  function close() {
    setError(null);
    onClose();
  }

  async function submit() {
    try {
      await onCreate(name.trim(), JSON.parse(text));
      setName("");
      setText("");
      close();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle>Create site</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            slotProps={{ htmlInput: { maxLength: 30 } }}
          />
          <TextField
            label="Polygon: [x, y] pairs in metres"
            placeholder="[[0, 0], [40, 0], [40, 25], [0, 25]]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
            minRows={4}
            error={Boolean(error)}
            helperText={error}
            slotProps={{ formHelperText: { sx: errorHelperSx } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          onClick={submit}
          variant="contained"
          disabled={saving || !name.trim() || !text.trim()}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function TopPanel({
  sites,
  siteId,
  onSelectSite,
  onCreateSite,
  saving,
  options,
  selected,
  onSelect,
  onNew,
}) {
  const [open, setOpen] = useState(false);
  return (
    <Paper sx={{ position: "absolute", top: 8, left: 8, p: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Button variant="outlined" onClick={() => setOpen(true)}>
          Create site
        </Button>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="site-label">Site</InputLabel>
          <Select
            labelId="site-label"
            label="Site"
            value={siteId ?? ""}
            onChange={(e) => onSelectSite(e.target.value)}
          >
            {sites.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <OptionSelect
          options={options}
          selected={selected}
          onSelect={onSelect}
          onNew={onNew}
        />
        <BackendHealth />
      </Stack>
      <CreateSiteDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreate={onCreateSite}
        saving={saving}
      />
    </Paper>
  );
}
