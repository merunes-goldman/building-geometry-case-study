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

const HEALTH_INTERVAL_MS = 10_000;
const HEALTH_COLOR = { healthy: "success", unreachable: "error" };

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
  return (
    <Chip
      size="small"
      variant="outlined"
      color={HEALTH_COLOR[status] ?? "default"}
      label={`backend: ${status ?? "checking"}`}
    />
  );
}

function CreateSiteDialog({ open, onClose, onCreate, saving }) {
  const [name, setName] = useState("");
  const [polygonText, setPolygonText] = useState("");
  const [error, setError] = useState(null); // the failed request: a 409 belongs to the name, anything else to the polygon
  const nameTaken = error?.status === 409;

  function close() {
    setError(null);
    onClose();
  }

  async function submit() {
    try {
      await onCreate(name.trim(), JSON.parse(polygonText));
      setName("");
      setPolygonText("");
      close();
    } catch (requestError) {
      setError(requestError);
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
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            size="small"
            error={nameTaken}
            helperText={nameTaken ? error.message : undefined}
            slotProps={{
              htmlInput: { maxLength: 30 },
              formHelperText: { sx: errorHelperSx },
            }}
          />
          <TextField
            label="Polygon: [x, y] pairs in metres"
            placeholder="[[0, 0], [40, 0], [40, 25], [0, 25]]"
            value={polygonText}
            onChange={(event) => {
              setPolygonText(event.target.value);
              setError(null);
            }}
            multiline
            minRows={4}
            error={Boolean(error) && !nameTaken}
            helperText={error && !nameTaken ? error.message : undefined}
            slotProps={{ formHelperText: { sx: errorHelperSx } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          onClick={submit}
          variant="contained"
          disabled={saving || !name.trim() || !polygonText.trim()}
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
  edited,
  onSelect,
  onNew,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <Paper sx={{ p: 1, justifySelf: "start" }}>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ flexWrap: "wrap", alignItems: "center" }}
      >
        <Button variant="outlined" onClick={() => setDialogOpen(true)}>
          Create site
        </Button>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="site-label">Site</InputLabel>
          <Select
            labelId="site-label"
            label="Site"
            value={siteId ?? ""}
            onChange={(event) => onSelectSite(event.target.value)}
            MenuProps={{ transitionDuration: 0 }}
          >
            {sites.map((site) => (
              <MenuItem key={site.id} value={site.id}>
                {site.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <OptionSelect
          options={options}
          selected={selected}
          edited={edited}
          onSelect={onSelect}
          onNew={onNew}
        />
        <BackendHealth />
      </Stack>
      <CreateSiteDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={onCreateSite}
        saving={saving}
      />
    </Paper>
  );
}
