import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { useCallback, useEffect, useRef, useState } from "react";
import Inspector from "./components/Inspector.jsx";
import Plan from "./components/Plan.jsx";
import TopPanel from "./components/TopPanel.jsx";
import {
  createOption,
  createSite,
  listOptions,
  listSites,
  previewMassing,
} from "./lib/api.js";

// --- helpers ------------------------------------------------------------------------------------

// Valid defaults, so a reset always has something to compute: the "modest" example set without its coverage cap.
const DEFAULTS = {
  setback_m: "3",
  floor_to_floor_m: "3.5",
  max_height_m: "24",
  max_floors: "6",
  site_coverage_ratio: "",
  gfa_target_m2: "",
};
const PREVIEW_DELAY_MS = 300;

const toConstraints = (form) =>
  Object.fromEntries(
    Object.entries(form).map(([key, value]) => [
      key,
      value === "" ? null : Number(value),
    ]),
  );

const fromConstraints = (constraints) =>
  Object.fromEntries(
    Object.keys(DEFAULTS).map((key) => [
      key,
      constraints[key] == null ? "" : String(constraints[key]),
    ]),
  );

// --- component ----------------------------------------------------------------------------------

export default function App() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(null);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(DEFAULTS); // the constraint fields as typed
  const [edited, setEdited] = useState(true); // false right after a programmatic fill: the snapshot is shown, no preview runs
  const [name, setName] = useState("");
  const [result, setResult] = useState(null); // what the plan shows: the snapshot after a click, the preview after an edit
  const [pendingPreviews, setPendingPreviews] = useState(0); // previews in flight
  const [showParent, setShowParent] = useState(false); // changed only by the user: the comparison stays on across selections
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null); // the last failed request: a 422 is shown by the form, anything else as a banner
  const previewCounter = useRef(0); // every preview request gets a number; a response with a stale number is dropped
  const siteCounter = useRef(0); // the same for the option list of a site

  const site = sites.find((candidate) => candidate.id === siteId);
  // The parent of what the form shows: the selected option's parent while its snapshot is shown,
  // the selected option itself once the form is edited — the draft will branch from it.
  const parent = edited
    ? selected
    : (options.find((option) => option.id === selected?.parent_id) ?? null);

  const reset = useCallback(() => {
    setSelected(null);
    setForm(DEFAULTS);
    setEdited(true);
    setName("");
    setError(null);
  }, []);

  const selectSite = useCallback(
    async (id) => {
      const requestNo = ++siteCounter.current;
      setSiteId(id);
      setOptions([]);
      reset();
      setResult(null);
      try {
        const loaded = await listOptions(id);
        if (requestNo === siteCounter.current) {
          setOptions(loaded);
        }
      } catch (requestError) {
        if (requestNo === siteCounter.current) {
          setError(requestError);
        }
      }
    },
    [reset],
  );

  useEffect(() => {
    listSites()
      .then((loaded) => {
        setSites(loaded);
        const first =
          loaded.find((candidate) => candidate.name === "rectangle") ??
          loaded[0];
        if (first) {
          selectSite(first.id);
        }
      })
      .catch(setError);
  }, [selectSite]);

  // Live preview: a short delay after typing; the fields do not lock, requests are counted and numbered.
  useEffect(() => {
    if (!siteId || !edited) {
      return undefined;
    }
    const requestNo = ++previewCounter.current;
    const timer = setTimeout(async () => {
      setPendingPreviews((count) => count + 1);
      try {
        const computed = await previewMassing(siteId, toConstraints(form));
        if (requestNo === previewCounter.current) {
          setResult(computed);
          setError(null);
        }
      } catch (requestError) {
        if (requestNo === previewCounter.current) {
          setError(requestError); // the last valid result stays on the plan
        }
      } finally {
        setPendingPreviews((count) => count - 1);
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [siteId, form, edited]);

  function selectOption(option) {
    previewCounter.current += 1; // a preview still in flight must not land after the snapshot
    setSelected(option);
    setForm(fromConstraints(option.constraints));
    setEdited(false);
    setName("");
    setResult(option.result);
    setError(null);
  }

  function changeField(key, value) {
    setForm((fields) => ({ ...fields, [key]: value }));
    setEdited(true);
  }

  // Back to where the draft started: the selected option's snapshot, or the defaults.
  function discardDraft() {
    if (selected) {
      selectOption(selected);
    } else {
      reset();
    }
  }

  async function addOption() {
    const requestNo = siteCounter.current; // the site can be switched while the save is in flight
    setSaving(true);
    try {
      const option = await createOption(siteId, {
        name: name.trim() || null,
        parent_id: selected?.id ?? null,
        constraints: toConstraints(form),
      });
      if (requestNo !== siteCounter.current) {
        return;
      }
      setOptions((all) => [...all, option]);
      selectOption(option);
    } catch (requestError) {
      if (requestNo === siteCounter.current) {
        setError(requestError);
      }
    } finally {
      setSaving(false);
    }
  }

  async function addSite(siteName, polygon) {
    setSaving(true);
    try {
      const created = await createSite(siteName, polygon); // errors are shown by the dialog
      setSites((all) => [...all, created]);
      selectSite(created.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    // Two columns (the plan, the 440 px inspector) and two rows (the top panel, the rest); the inspector spans both rows.
    // The page is never narrower than 880 px: below that the outer box scrolls sideways.
    <Box sx={{ height: "100vh", overflowX: "auto" }}>
      <Box
        sx={{
          minWidth: 880,
          height: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 440px",
          gridTemplateRows: "auto minmax(0, 1fr)",
          gap: 2,
          p: 1,
        }}
      >
        {saving && (
          <LinearProgress
            sx={{ position: "fixed", top: 0, left: 0, right: 0 }}
          />
        )}
        <TopPanel
          sites={sites}
          siteId={siteId}
          onSelectSite={selectSite}
          onCreateSite={addSite}
          saving={saving}
          options={options}
          selected={selected}
          edited={edited}
          onSelect={selectOption}
          onNew={reset}
        />
        <Plan
          site={site}
          footprint={result?.footprint}
          parentFootprint={showParent ? parent?.result.footprint : null}
          recomputing={pendingPreviews > 0 && edited}
        />
        <Inspector
          selected={selected}
          parent={parent}
          form={form}
          onFormChange={changeField}
          name={name}
          onNameChange={setName}
          result={result}
          showParent={showParent}
          onShowParent={setShowParent}
          onAdd={addOption}
          edited={edited}
          onReset={discardDraft}
          saving={saving}
          error={error}
        />
      </Box>
    </Box>
  );
}
