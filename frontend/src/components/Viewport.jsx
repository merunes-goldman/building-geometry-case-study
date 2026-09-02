import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { lazy, Suspense, useState } from "react";
import Plan from "./Plan.jsx";

const Volume = lazy(() => import("./Volume.jsx")); // three.js is loaded on the first switch to 3D

// The plan or the 3D view of the same result: the switch at the bottom right, the mark of a preview in flight
// at the bottom left.
export default function Viewport({ site, result, parentResult, recomputing }) {
  const [view, setView] = useState("2d");
  if (!site) {
    return null;
  }
  const shown = { site, result, parentResult };
  return (
    <Box sx={{ position: "relative", minHeight: 0, overflow: "hidden" }}>
      <Suspense fallback={null}>
        {view === "2d" ? <Plan {...shown} /> : <Volume {...shown} />}
      </Suspense>
      {recomputing && (
        <Chip
          label="recomputing"
          size="small"
          sx={{ position: "absolute", left: 16, bottom: 16 }}
        />
      )}
      <ToggleButtonGroup
        value={view}
        exclusive
        size="small"
        onChange={(_event, next) => next && setView(next)}
        sx={{
          position: "absolute",
          right: 16,
          bottom: 16,
          bgcolor: "background.paper",
        }}
      >
        <ToggleButton value="2d">2D</ToggleButton>
        <ToggleButton value="3d">3D</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
