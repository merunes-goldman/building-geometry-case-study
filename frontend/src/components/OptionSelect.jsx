import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { fmt, VERDICT_COLOR, VERDICT_LABEL } from "../lib/ui.js";

// --- helpers ------------------------------------------------------------------------------------

// The API returns a flat list; children go under their parent, indented by depth.
function treeRows(options) {
  const children = new Map();
  for (const o of options) {
    const key = o.parent_id ?? "root";
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(o);
  }
  const rows = [];
  const walk = (key, depth) => {
    for (const o of children.get(key) ?? []) {
      rows.push({ option: o, depth });
      walk(o.id, depth + 1);
    }
  };
  walk("root", 0);
  return rows;
}

// --- component ----------------------------------------------------------------------------------

// The option tree as a dropdown; the first entry, "New option", starts a fresh root.
export default function OptionSelect({ options, selected, onSelect, onNew }) {
  const byId = (id) => options.find((o) => o.id === id);
  return (
    <FormControl size="small" sx={{ minWidth: 260 }}>
      <InputLabel id="option-label" shrink>
        Option
      </InputLabel>
      <Select
        labelId="option-label"
        label="Option"
        notched
        displayEmpty
        value={selected?.id ?? ""}
        onChange={(e) =>
          e.target.value ? onSelect(byId(e.target.value)) : onNew()
        }
        renderValue={(id) => (id ? byId(id)?.name || "unnamed" : "New option")}
        MenuProps={{ transitionDuration: 0 }}
      >
        <MenuItem value="">
          <ListItemText
            primary="New option"
            secondary="a new root, default constraints"
          />
        </MenuItem>
        {treeRows(options).map(({ option, depth }) => (
          <MenuItem
            key={option.id}
            value={option.id}
            sx={{ pl: 2 + depth * 2 }}
          >
            <ListItemText
              primary={option.name || "unnamed"}
              secondary={`GFA ${fmt(option.result.metrics.gfa_m2, 0)} m2, ${option.result.metrics.floor_count} floors`}
            />
            <Chip
              size="small"
              color={VERDICT_COLOR[option.result.verdict]}
              label={VERDICT_LABEL[option.result.verdict]}
              sx={{ ml: 2 }}
            />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
