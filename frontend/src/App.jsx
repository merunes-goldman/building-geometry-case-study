import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { useCallback, useEffect, useRef, useState } from "react";
import Inspector, { INSPECTOR_WIDTH } from "./components/Inspector.jsx";
import Plan from "./components/Plan.jsx";
import TopPanel, { TOP_PANEL_HEIGHT } from "./components/TopPanel.jsx";
import {
  ApiError,
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
const GAP = 16;

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
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(true); // false right after a programmatic fill: the snapshot is shown, not a preview
  const [live, setLive] = useState(null); // the last valid preview
  const [previewError, setPreviewError] = useState(null);
  const [pending, setPending] = useState(0); // previews in flight
  const [showParent, setShowParent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const previewNo = useRef(0); // a response with a stale number is dropped
  const siteNo = useRef(0); // the same for the option list of a site

  const site = sites.find((s) => s.id === siteId);
  const parent = selected?.parent_id
    ? options.find((o) => o.id === selected.parent_id)
    : null;
  const result = dirty ? live : selected?.result;

  const reset = useCallback(() => {
    setSelected(null);
    setForm(DEFAULTS);
    setName("");
    setDirty(true);
    setShowParent(false);
    setPreviewError(null);
    setError(null);
  }, []);

  const selectSite = useCallback(
    async (id) => {
      const no = ++siteNo.current;
      setSiteId(id);
      setOptions([]);
      reset();
      setLive(null);
      try {
        const loaded = await listOptions(id);
        if (no === siteNo.current) setOptions(loaded);
      } catch (e) {
        if (no === siteNo.current) setError(e.message);
      }
    },
    [reset],
  );

  useEffect(() => {
    listSites()
      .then((loaded) => {
        setSites(loaded);
        const first = loaded.find((s) => s.name === "rectangle") ?? loaded[0];
        if (first) selectSite(first.id);
      })
      .catch((e) => setError(e.message));
  }, [selectSite]);

  // Live preview: a short delay after typing; the fields do not lock, requests are counted and numbered.
  useEffect(() => {
    if (!siteId || !dirty) return undefined;
    const no = ++previewNo.current;
    const timer = setTimeout(async () => {
      setPending((n) => n + 1);
      try {
        const preview = await previewMassing(siteId, toConstraints(form));
        if (no === previewNo.current) {
          setLive(preview);
          setPreviewError(null);
          setError(null);
        }
      } catch (e) {
        if (no !== previewNo.current) return;
        if (e instanceof ApiError)
          setPreviewError(e.message); // a rejected input: shown by the form
        else setError(e.message); // anything else: one banner, the last valid result stays
      } finally {
        setPending((n) => n - 1);
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [siteId, form, dirty]);

  function selectOption(option) {
    previewNo.current += 1; // a preview still in flight must not overwrite the snapshot
    setSelected(option);
    setForm(fromConstraints(option.constraints));
    setName("");
    setDirty(false);
    setLive(option.result);
    setShowParent(false);
    setPreviewError(null);
  }

  function changeField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function addOption() {
    const no = siteNo.current; // the site can be switched while the save is in flight
    setSaving(true);
    try {
      const option = await createOption(siteId, {
        name: name.trim() || null,
        parent_id: selected?.id ?? null,
        constraints: toConstraints(form),
      });
      if (no !== siteNo.current) return;
      setOptions((all) => [...all, option]);
      selectOption(option);
      setError(null);
    } catch (e) {
      if (no === siteNo.current) setError(e.message);
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
    <Box sx={{ position: "fixed", inset: 0 }}>
      {saving && (
        <LinearProgress
          sx={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1 }}
        />
      )}
      <Box
        sx={{
          position: "absolute",
          top: TOP_PANEL_HEIGHT + GAP,
          left: 0,
          right: INSPECTOR_WIDTH + GAP,
          bottom: 0,
        }}
      >
        <Plan
          site={site}
          footprint={result?.footprint}
          parentFootprint={showParent ? parent?.result.footprint : null}
          recomputing={pending > 0}
        />
      </Box>
      <TopPanel
        sites={sites}
        siteId={siteId}
        onSelectSite={selectSite}
        onCreateSite={addSite}
        saving={saving}
        options={options}
        selected={selected}
        onSelect={selectOption}
        onNew={reset}
      />
      <Inspector
        selected={selected}
        parent={parent}
        form={form}
        onFormChange={changeField}
        name={name}
        onNameChange={setName}
        result={result}
        previewError={previewError}
        showParent={showParent}
        onShowParent={setShowParent}
        onAdd={addOption}
        saving={saving}
        error={error}
      />
    </Box>
  );
}
