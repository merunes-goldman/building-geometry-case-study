import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { formatNumber, VERDICT } from "../lib/ui.js";

const NEW_OPTION = "new"; // the value of the "New option" row

// --- helpers ------------------------------------------------------------------------------------

// The API returns a flat list; children go under their parent, indented by depth.
function treeRows(options) {
  const children = new Map(); // parent id (null for a root) -> its options in list order
  for (const option of options) {
    if (!children.has(option.parent_id)) {
      children.set(option.parent_id, []);
    }
    children.get(option.parent_id).push(option);
  }
  const rows = [];
  const walk = (parentId, depth) => {
    for (const option of children.get(parentId) ?? []) {
      rows.push({ option, depth });
      walk(option.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

// What the form shows: the selected option's snapshot, the draft that branches from it, or a fresh root.
function shownValue(selected, edited) {
  if (!selected) {
    return "New option";
  }
  const name = selected.name || "unnamed";
  return edited ? `New option from "${name}"` : name;
}

// --- component ----------------------------------------------------------------------------------

// The option tree as a dropdown; the first row, "New option", starts a fresh root.
// Rows react to clicks, not to the Select's onChange: clicking the selected option again restores its snapshot
// (its row stays marked while the draft is shown).
export default function OptionSelect({
  options,
  selected,
  edited,
  onSelect,
  onNew,
}) {
  return (
    <FormControl size="small" sx={{ minWidth: 260 }}>
      <InputLabel id="option-label">Option</InputLabel>
      <Select
        labelId="option-label"
        label="Option"
        value={selected?.id ?? NEW_OPTION}
        renderValue={() => shownValue(selected, edited)}
        MenuProps={{ transitionDuration: 0 }}
      >
        <MenuItem value={NEW_OPTION} onClick={onNew}>
          <ListItemText
            primary="New option"
            secondary="a new root, default constraints"
          />
        </MenuItem>
        {treeRows(options).map(({ option, depth }) => (
          <MenuItem
            key={option.id}
            value={option.id}
            onClick={() => onSelect(option)}
            sx={{ pl: 2 + depth * 2 }}
          >
            <ListItemText
              primary={option.name || "unnamed"}
              secondary={`GFA ${formatNumber(option.result.metrics.gfa_m2, 0)} m2, ${option.result.metrics.floor_count} floors`}
            />
            <Chip
              size="small"
              color={VERDICT[option.result.verdict].color}
              label={VERDICT[option.result.verdict].label}
              sx={{ ml: 2 }}
            />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
