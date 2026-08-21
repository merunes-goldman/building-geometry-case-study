# Design note

> This is a template. Replace each section with your thinking. We read this first —
> it matters more than line count. Keep it sharp; bullet points are fine.

## Problem interpretation

**Problem.** At the very beginning of a building project the architect needs to find out what, if anything, can be built on the site under the given constraints. This takes many experiments: "what if the setback is smaller?", "what if we add floors?", etc. — and combinations of those. With pen and paper or general-purpose tools every experiment means manually redrawing and recomputing metrics; the decision history is hard to keep, options are hard to compare, and mistakes are easy to make.

**Solution.** A specialized tool that makes an experiment instant and keeps it from getting lost: from the site polygon and the constraints it computes the rough buildable volume — the massing — with its metrics, and stores every experiment in the option tree (save, branch, compare). A single computation is simple (shrinking the polygon plus arithmetic); the real value is in the exploration, so the focus is the option tree and the live preview, not the computation itself.

Three parts: the computation core (a pure function), storage with the option tree (Postgres, plain SQL), and the interactive visualization (React + SVG).

**The prototype.**

In scope:

- 5 constraints (setback, floor-to-floor height, building height limit, floor count limit, site coverage ratio)
- 1 target to aim for (GFA)
- 1 building
- identical above-ground floors: every floor plate is the whole footprint, the height is the same
- a single setback for the whole perimeter
- option tree: save an option, branch from it, compare with the parent
- an **infeasible** result is a normal result: it is saved in the tree like any other option, shown with the reason, and the user can branch from it
- any site polygon (a single ring, no holes) via the API, with full validation
- flat site, no terrain
- template sites to choose from + creating a site by pasting coordinates as text
- live preview of the current experiment

Out of scope — all in the roadmap:

- real-world zoning: new kinds of constraints (per-side setbacks, minimum footprint width, sun access rules, height control planes) and realistic value ranges for the existing ones. Every such rule or number needs a domain reason, and inventing them is guesswork: they should come from domain experts and regulations. The prototype checks only what breaks the math, not what is realistic
- drawing the site with the mouse + quality-of-life improvements: zoom, pan, panel hiding
- comparing any two options
- multiple buildings, and a building with a shape of its own (e.g. a rectangle fitted inside the footprint) — the prototype building always occupies the whole footprint
- underground floors (basements) — they live by different rules: setbacks and height limits can apply to the above-ground part only, basement area may be excluded from GFA, and the underground footprint can be wider than the building above
- GFA target auto-fit
- 3D view
- branch archiving and option renaming (see "Tree rules")
- algorithm versioning (a stored option remembers which version of the computation produced it)
- scale: metric columns for SQL search and sorting, paged tree loading, the CPU-bound computation moved to worker processes
- user accounts and collaboration
- exporting the result to other tools
- site polygon with holes: zones inside the site where building is not allowed
- sloped terrain: on a slope even "building height" needs a definition — measured from where?
- geo-referencing: real map coordinates, import from cadastre or GeoJSON (for now — plain metres on a flat plane)

## Domain model

There are two entities to persist: **site** and **option**. Constraints and the result are not separate entities but columns of the option.

- **Site** — a named polygon in metres. Immutable: all computations depend on it, so another polygon is another site.
- **Option** — a tree node: the full set of constraints plus the geometric result of the computation. Created from scratch (a root) or by branching an existing option: the parent's constraints, a few changes, a new computed result, and a link to the parent.

### Tree rules

- An option is immutable once saved; an edit is a new branch. The tree stays an honest history of experiments, and any two options remain comparable. This covers the name too: no renaming in the prototype — it comes together with archiving (roadmap).
- An option is self-contained: it stores the full set of constraints, not a diff from the parent. Reading needs no walk over ancestors; comparing two options is comparing two table rows.
- A site can have several roots — several independent trees. The parent link means "branched from"; if there were always a single root, a fresh start would have to be attached to an unrelated root with a fake link.
- No deletion of options, by design: an option is part of the history and may have children. The real future need is hiding dead-end branches without erasing them — that is archiving, and it is in the roadmap. The prototype needs neither: trees are small, and extra rows cost nothing.

### Tree storage

Considered ways to store a tree in a relational database:

| Way | How it works | Pros | Cons |
|---|---|---|---|
| **Adjacency list** | each row keeps a link to its parent (parent_id); a root is a row without a parent | branching is one inserted row; a single table | a whole subtree cannot be selected with one simple query: recursive SQL or assembling the tree in memory |
| Materialized path | each row keeps the full path from the root, like a file path: "root/option-3/option-7" | a subtree is one "path starts with ..." query | the path must be built on every insert and kept consistent (stored as text; Postgres also has a dedicated ltree extension) |
| Closure table | a second table with a row for every ancestor-descendant pair, including distant ones | "all ancestors" and "all descendants" are single queries without recursion | inserting a node at depth N adds N rows; the second table must be kept in sync with the first |

The choice: **adjacency list** — cheap branching and a single table, and its weak spot (subtree selection) does not matter here: trees are small, and the API always returns all options of a site at once — one query by site_id.

### Database schema

The principle: store the input and the product of the geometry; everything else is recomputed on every read.

- **Stored.** Constraints are the user's input — there is nothing to recover them from. The footprint polygon and the split flag are the product of the geometry: getting them again would mean keeping and running old versions of the geometry code.
- **Computed on read.** Floor count, height, GFA, footprint area, coverage and FAR, verdict, target shortfall — one-line formulas over the stored columns; the full list is in Algorithm, "Derived values". The trade-off of this decision is discussed in "Assumptions & trade-offs".

If searching or sorting options by metrics in SQL is ever needed (say, by GFA), dedicated columns will be added — roadmap.

Column suffixes _m and _m2 are the units: metres and square metres.

**sites**

| column | type | purpose |
|---|---|---|
| id | uuid | |
| name | text | |
| polygon | jsonb | polygon vertices, metres |
| created_at | timestamptz | |

**options**

| column | type | purpose |
|---|---|---|
| id | uuid | |
| site_id | uuid | the site; all its options are read by this key |
| parent_id | uuid, optional | the parent option; empty for a root |
| name | text, optional | option name |
| setback_m | numeric | setback |
| floor_to_floor_m | numeric | floor-to-floor height |
| max_height_m | numeric, optional | height limit; at least one of the two limits is set |
| max_floors | integer, optional | floor count limit |
| site_coverage_ratio | numeric, optional | site coverage; without it there is no additional inset (see Algorithm, step 3) |
| gfa_target_m2 | numeric, optional | GFA target |
| footprint | jsonb, optional | the footprint polygon after the setback and the additional inset (the kept part if it split); empty only when nothing is left of the footprint |
| footprint_split | boolean | the **footprint split** flag |
| created_at | timestamptz | |

site_id and parent_id are foreign keys (the API additionally checks that the parent belongs to the same site); site_id is indexed because the main read is all options of a site at once. Value bounds and the "at least one limit" rule are duplicated by CHECK constraints (max_floors is kept an integer by the column type itself) — a safety net besides the API validation.

**Seeding.** On backend start, if the sites table is empty, the template sites from data/sites are inserted as ordinary rows — after that they are no different from user-created ones.

Constraints are separate columns, not one JSON field (the jsonb type in Postgres): there are five of them and the set is known; columns give types and database-level checks. The price is a migration for every new constraint; fine for the prototype, moving to jsonb when the list grows — roadmap.

## Algorithm

The core is a pure function compute_massing(polygon, constraints) -> MassingResult (constraints includes the optional GFA target): no database, no HTTP, deterministic, covered by tests.

### Choosing the geometry library

The only non-trivial operation is the inset (shrinking the polygon inwards by the setback): on concave sites the footprint can vanish or split into parts. Considered libraries:

| Library | Pros | Cons |
|---|---|---|
| **Shapely** | the GEOS geometry core — the same one behind PostGIS and QGIS; the inset is a ready-made operation, including the cases where the footprint vanishes or splits; polygon validation and area computation come with it | a general-purpose library, not a special tool: its behaviour on edge cases is pinned by tests |
| Clipper | a special tool exactly for polygon offsetting | works in integers — metres must be scaled back and forth; no validation, no area computation — a second library would be needed |
| PostGIS (the geo extension of PostgreSQL) | the same geometry with the database already in place | the computation moves into the database — impossible to test or reuse separately from it |
| CGAL | mathematically strict inner offset (straight skeleton) | a big C++ library; Python bridges are unofficial and rarely updated |
| own implementation | no dependencies | a correct inset of a concave polygon is exactly the hard part; it would eat the whole time budget of the prototype |

The choice: **Shapely** — one dependency covers the inset, the validation and the area computation.

### Computation steps

1. **Polygon validation.** The polygon must be usable: at least three vertices, non-zero area, no self-intersections. A broken polygon is rejected with an explanation of the reason — no silent fixing.
2. **Setback.** Inset the polygon inwards by the setback — this gives the buildable footprint. Corners stay sharp, no rounding: the setback border follows the turns of the site border. Three outcomes: a normal footprint — continue; nothing left — the verdict is **infeasible**; the footprint split into parts — build on the largest one and raise the **footprint split** flag. Part areas are compared with a tolerance (square millimetres). If several parts tie for the largest, take the one whose left edge is furthest left; if the left edges match too, the one whose bottom edge is lower. The only point of this rule is repeatability: without it the choice would depend on library internals.
3. **Site coverage.** If the footprint takes more than the allowed share of the site, shrink it further — the same inset operation — until it fits. Shrinking, not rejecting: the answer is "the most that can be built here", not "bad input". Details:
   - the goal is to bring the footprint area to the allowed one: the coverage ratio times the site area (GFA is not involved). The allowed area is compared with the area of the largest part after sliver removal (see "Sliver threshold" below);
   - how far to shrink is found by binary search with millimetre precision; the precision, like the sliver threshold, is arbitrary — it only has to be far below any meaningful size on the plan;
   - this is not GFA auto-fit: here a mandatory rule has a single answer; auto-fit is in the roadmap;
   - why not scale the whole shape towards the centre: scaling would hit the target area in one step, but it moves points towards the centre, not away from the border — on a concave footprint a part of the outline could end up closer to the site border than the setback allows. The inset moves every point away from the border and cannot violate the setback;
   - the additional inset, like the setback, can split the footprint; then the rule of step 2 applies — the largest part and the flag. When the footprint splits, the area jumps, so the guarantee is "not above the limit", not exact equality;
   - if the allowed area is below the sliver threshold, the additional inset destroys the footprint — the verdict is **infeasible**.
4. **Floor count.**
   - The height limit is converted into **floors by height**: divide it by the floor-to-floor height and drop the fraction — 24 / 3.5 gives 6 (the division uses a small tolerance: without it 9.6 / 3.2 would give 2 floors instead of 3 because of floating point).
   - The floor count is the smaller of two numbers: the floor limit and the floors by height. If only one of the two limits is set, it acts alone; at least one is required.
   - Zero floors — the verdict is **infeasible**.
5. **Metrics.** Footprint area, floor count, building height, GFA — and, for reference, coverage and FAR. The formulas are listed in "Derived values" below; one thing to state here: a floor occupies the whole footprint, so the floor area is the footprint area.
6. **Verdict.** One of three: **feasible** — there is a building, and the GFA target (if set) is reached; **GFA target missed** — there is a building, but the GFA target is not reached, with the exact shortfall in sq. m; **infeasible** — with the reason: the footprint is gone, or no floor fits.

The result: the footprint polygon, the metrics, the verdict with reasons and flags. The polygon goes to the frontend for drawing and to the database as the option snapshot.

### Input error or the infeasible verdict

What is rejected and what is a result:

- **Input error** (HTTP 422, nothing is saved) — the question makes no sense: a broken polygon (self-intersection, fewer than three vertices, zero area); values out of bounds (negative setback, zero floor-to-floor height, coverage outside (0, 1]); neither of the two limits (height, floor count) is set. Value bounds are checked by the API layer (the pydantic validation library); the polygon geometry is checked by the core.
- **The infeasible verdict** (a normal result, saved as an option) — the question makes sense and the answer is "nothing can be built": the setback or the additional inset destroyed the footprint, or no floor fits under the limits.

There are no upper "reasonable value" bounds: a thousand floors is valid input and does not break the computation; such checks are in the roadmap. "Zero floors" is not rejected at validation either, although arithmetically it could be: it is an answer the architect must see, save in the tree and branch from, relaxing the constraints.

### Sliver threshold

After an inset, rounding errors can leave slivers — microscopic pieces of the footprint, fractions of a square millimetre; a piece below the threshold does not count as a footprint. The exact value does not matter — anything clearly larger than the slivers and clearly smaller than a real footprint works; proposed: 1 sq. m. The threshold deliberately eats real footprints below one square metre too: a 15x0.02 m strip is not a rounding artifact, but it will vanish.

Slivers are removed before the split analysis: otherwise a microscopic sliver would raise a false **footprint split** flag.

### Derived values

Everything below is recomputed on read from the stored columns — nothing here is persisted:

- footprint area — the polygon area of the stored footprint, computed from its vertices
- floor count — the smaller of max_floors and floor(max_height_m / floor_to_floor_m), with the tolerance and the one-limit rule of step 4
- height — floor count * floor_to_floor_m
- GFA — footprint area * floor count
- coverage and FAR (for reference) — footprint area / site area and GFA / site area
- GFA target shortfall — gfa_target_m2 minus GFA, when the target is set and missed
- verdict — the footprint is empty: **infeasible**; the floor count is zero: **infeasible**; otherwise **feasible**, or **GFA target missed** if the target is set and not reached

### Tests

Template sites, answers computed by hand:

- the 40x25 m rectangle with the "modest" set: a 3 m setback gives a 34x19 = 646 sq. m footprint; the additional inset for the 60% coverage brings the area to just under 600 sq. m — the check is "not above 600 and within tolerance of it", not exact equality (the millimetre search step does not land on 600.00 exactly); 6 floors; GFA = footprint area * 6;
- the L-shaped site: the inset around a concave corner; the footprint area is checked against a hand computation;
- the notched site: a moderate setback eats the neck — the footprint splits into two parts (the flag is raised); a big setback destroys the footprint — the verdict is **infeasible**;
- the choice of the largest part is tested on an asymmetric polygon: on the notched site the split parts are always equal, so that test cannot show which part the code took; the equal-parts rule — take the leftmost — is a separate test;
- the set with a 12 m setback shows that feasibility depends on the site: on the notched site the footprint is destroyed — **infeasible**, while on the 40x25 rectangle a 16x1 = 16 sq. m strip remains and 2 floors fit — **feasible**;
- the "no floor fits" reason is tested with a separate set where the height limit is below one floor-to-floor height;
- broken polygons — a figure-eight self-intersection, two vertices, zero area — give an input error with an explanation;
- a GFA target above the reachable maximum gives the **GFA target missed** verdict with the exact shortfall in sq. m.

The API layer is tested too: an end-to-end scenario — create a site, a root, a branch from it, read the tree; seeding of the template sites into an empty database; a check that the preview adds no rows to the database; error codes — 422 (polygon, value bounds, parent_id from another site) and 404.

## API contract

REST over JSON, prefix /api/v1 (room for future versions — already in the scaffold). Units in requests and responses are metres and sq. m, same as in the database.

| Method and path | Purpose |
|---|---|
| POST /sites | create a site: name + polygon; polygon validation happens here |
| GET /sites | the list of sites to choose from |
| GET /sites/{id} | one site with its polygon |
| POST /sites/{id}/options | create an option: the full set of constraints, optionally parent_id (branching) and name; the server computes the massing, saves and returns the whole option |
| GET /sites/{id}/options | all options of a site as a flat list |
| GET /options/{id} | one option |
| POST /massing/preview | the same computation without saving: site_id + constraints; nothing is written |

Decisions:

- **Branching is POST options with parent_id.** There is no separate "branch" action in the API: creating a root and branching differ only by the parent link.
- **The client sends the full set of constraints, not a diff from the parent.** The form is pre-filled with the parent's values; the user edits and sends everything back. No merging of sets on the server — fewer rules, and an option is already self-contained on arrival. A parent_id from another site is an error.
- **The tree is returned as a flat list with parent_id.** No nested structure is built on either side: for drawing, the client computes indents and row order (children under the parent) in one pass; nested JSON would be a second representation of the same thing.
- **Preview without saving.** The core is a pure function, so the handler is trivial; it gives a live recomputation while the user tunes the constraints, before anything is saved.

The computation is pure CPU and runs right in the request handler. For a single-user prototype this is fine; under load such a handler blocks the event loop for everyone — moving the computation to separate processes is in the roadmap ("Scale").

The polygon in requests and responses is an array of [x, y] pairs in metres, without repeating the first vertex (as in the template sites). A site in responses is an object { id, name, polygon, created_at }; GET /sites is an array of such objects. An option is as in the example below; GET /sites/{id}/options is an array of such objects. Metrics and the verdict are computed on read (see "Database schema"). Machine names of the verdicts: ok, gfa_missed (with gfa_shortfall_m2), infeasible (with reason: footprint_collapsed or zero_floors).

Example — creating a root option with POST /api/v1/sites/{id}/options. The site coverage ratio is not set (it is optional), so there is no additional inset and all numbers are exact. The request:

```json
{
  "name": "baseline",
  "parent_id": null,
  "constraints": {
    "setback_m": 3,
    "floor_to_floor_m": 3.5,
    "max_height_m": 24,
    "max_floors": 6
  }
}
```

The response:

```json
{
  "id": "9b2f...",
  "site_id": "51c0...",
  "parent_id": null,
  "name": "baseline",
  "constraints": {
    "setback_m": 3,
    "floor_to_floor_m": 3.5,
    "max_height_m": 24,
    "max_floors": 6,
    "site_coverage_ratio": null,
    "gfa_target_m2": null
  },
  "result": {
    "footprint": [[3, 3], [37, 3], [37, 22], [3, 22]],
    "footprint_split": false,
    "metrics": {
      "footprint_area_m2": 646.0,
      "floor_count": 6,
      "height_m": 21.0,
      "gfa_m2": 3876.0,
      "coverage": 0.646,
      "far": 3.876
    },
    "verdict": "ok"
  },
  "created_at": "2026-08-18T12:00:00Z"
}
```

Errors: 422 — a broken polygon, values out of bounds, or a parent_id from another site, with an explanation of the reason; 404 — no such site or option. The **infeasible** verdict is not an error (see "Input error or the infeasible verdict" in Algorithm).

## Visualization

### Choosing the rendering approach

The scene is tiny: two polygons with a dozen vertices each. With the backend it was the other way around: there a library covered a hard algorithm (the inset); here there is no hard algorithm — a browser can draw two polygons by itself, the only question is using what. Considered approaches:

| Approach | Pros | Cons |
|---|---|---|
| **SVG** | React itself redraws the picture when the data changes; clicks and hover work like on ordinary page elements; sharp at any scale | slow with thousands of shapes — not the case here |
| Canvas 2D | fast with many shapes | redrawing and "what was clicked" detection must be written by hand; no gain on a scene this small |
| 2D scene libraries: Konva, Fabric, Pixi | ready-made shapes, events, dragging | engines on top of Canvas/WebGL with their own scene management next to React; they solve the problems of big and editable scenes — there are none here |
| d3 | utilities for scales, axes, zoom | manages the page itself — coexists poorly with React; built for charts, not plans |
| three.js (WebGL, 3D) | true volume: floors visible as a stack | camera, lighting, mouse picking — a separate layer of work; adds no new data — the building is the footprint stretched upwards, so the plan plus the floor count carries everything |

The choice: **SVG rendered by React**, no libraries. They will become appropriate later, and that is in the roadmap: drawing the site with the mouse is exactly a task for Konva or Fabric, the 3D view — for three.js.

The panels around the scene are ordinary UI, and there a component library is appropriate: **MUI** (form fields, lists, buttons, dialogs, banners). The choice is mostly taste: the needed set of components is small and any mainstream kit covers it (Ant Design, Chakra, Mantine — or the stock browser controls, which take longer to make look decent). The deciding argument is familiarity: MUI is the most downloaded of them on npm, I have used it before and I like how it looks; the time is better spent on the core of the task than on learning a new library.

### The screen

The layout is Figma-like: the canvas with the plan takes the whole screen, and the panels float on top of it. Panel hiding and collapsing — roadmap.

- **The plan (full screen).** Top-down view: the site polygon and the buildable footprint. Redrawn on every recomputation; fitted into the area free of panels.
- **The top panel.** Site selection and the "Create site" button — a dialog with a name and coordinates pasted as text (an array of [x, y] pairs). The template sites are pre-seeded (see "Database schema"); drawing the site with the mouse — roadmap.
- **The inspector (right).** The top half is the option list: all options of the site in a single list, nesting shown by indents, roots as top-level rows; a row carries the name, GFA, floor count and a verdict icon, so a rough comparison is readable straight from the list. The bottom half is the selected option: the constraint fields, the metrics and the verdict, and the controls — the "Add option" and "Start fresh" buttons and the "Show parent" toggle. Next to "Add option" a note explains what the new option will become: a child of the selected one or a new root. "Show parent" shows the parent's metrics as a second column with the differences highlighted, and its polygon dashed on the plan (details in Behaviour).

### Behaviour

1. The user picks a site and enters constraints; the preview recomputes on every change (POST /massing/preview, with a short delay after typing). Switching the site clears the selection, resets the form and recomputes the plan right away — the old site's footprint does not stay on the plan.
2. "Add option" saves the computation — as a child of the option selected in the list or, when nothing is selected, as a new root (the start of a new tree). The selection moves to the new option: the next edit branches from it.
3. Clicking an option shows its snapshot from the database (the footprint, the metrics) and fills the form with its constraints; the preview turns on with the first manual edit — programmatic filling does not trigger a recomputation. "Start fresh" clears the selection, resets the form and recomputes the plan right away: there is no snapshot left to protect.
4. Comparison with the parent: a selected non-root option has the "Show parent" toggle — the parent's polygon is drawn dashed over the plan, its metrics appear as a second column in the inspector, and the changed constraints and differing metrics are highlighted. Comparing any two options — roadmap.
5. The verdict on screen: **feasible** — the normal view; **GFA target missed** — a yellow banner with the shortfall; **infeasible** — a red banner with the reason. The footprint leaves the plan only when it is destroyed; with zero floors the footprint exists, is stored and is shown.
6. Buttons that create data ("Add option", site creation) are disabled for the duration of the request; the loading is shown by a single shared indicator: chaotic clicks create no duplicates and break nothing. The preview does not lock the fields — that would kill the live recomputation; instead the plan gets a "recomputing" indicator, the requests are numbered, and a response with a stale number is dropped; no request cancellation is needed.
7. Request errors: on a preview 422 the plan keeps the last valid footprint and the reason text is shown by the form; a failed save shows a banner with the text, and the buttons unlock.

### Drawing details

- Coordinates are in metres with the Y axis pointing up; in SVG the Y axis grows downwards, so the drawing flips it.
- No pan and zoom: the site is fitted into the window automatically (the viewBox follows the polygon's bounding box). Zoom — roadmap.
- Comparing any two options (overlaid footprints, a table of differences) — roadmap; in the prototype — the metrics in the list rows and the parent overlay.

## Assumptions & trade-offs

**Data model:**

- A site and an option are immutable: a new polygon is a new site, an edit of an option is a new branch. Deletion and archiving — roadmap.
- An option is self-contained: the full set of constraints, not a diff from the parent; the price is a few numbers duplicated between options.
- From the result only the product of the geometry is stored — the footprint and the split flag; the metrics and the verdict are formulas over it, recomputed on read. The asymmetry is deliberate: the stored footprint will not change when the geometry code is updated, while the metrics, when a formula changes, recompute across the whole history — at once and identically. Freezing the metrics at write time was rejected in favour of a narrow table; full protection from logic changes is algorithm versioning (roadmap).
- Trees are small — tens of options per site; large ones — roadmap.
- There is no user in the model: no accounts, no permissions, all data is shared. Accounts and collaboration — roadmap.

**API:**

- The computation runs right in the request handler and blocks the event loop; acceptable for a single user, moving it to separate processes — roadmap ("Scale").

**Interface:**

- Top-down view instead of 3D: with identical floors the volume carries no new data and is expensive. The 3D view — roadmap.
- Option comparison is the metrics in the list rows and the parent overlay on the plan; comparing any two options — roadmap.
- The site is always fitted into the window whole; pan and zoom — roadmap.
- The panels are fixed: no hiding, no dragging; hiding — roadmap.

**Algorithm:**

- The building occupies the whole footprint, whatever its shape: an L-shaped footprint gives an L-shaped building. There are no buildings with a shape of their own fitted inside the footprint — roadmap. All floors are identical and above ground, so GFA = footprint area * floor count; underground floors — roadmap.
- A single setback for the whole perimeter; per-side setbacks — roadmap.
- The site is flat; terrain — roadmap.
- The site polygon is a single ring without holes; holes — zones inside the site where building is not allowed — roadmap.
- One building: when the footprint splits, only the largest part is built on; multiple buildings — roadmap.
- The additional inset for site coverage is uniform from all sides; choosing a side — roadmap.
- The 1 sq. m sliver threshold is an arbitrary value from the safe range (see "Sliver threshold"); it also eats real footprints below one square metre. Narrow but large footprints pass (a 16x1 m strip is **feasible**); minimum footprint width — roadmap.
- The GFA target is a reference for comparison, not an optimizer; fitting the constraints to the target — roadmap.
- Ready-made geometry instead of an own one — see the library table in Algorithm.

## Edge cases

- a concave site: the inset around a concave corner is done by GEOS, the behaviour is pinned by a test;
- the setback destroyed the footprint: the **infeasible** verdict with the reason;
- the setback split the footprint into parts: build on the largest one and raise the **footprint split** flag (on a tie — the leftmost, then the lowest part; see Algorithm, step 2);
- the additional inset for coverage split the footprint itself: the same rule — the largest part plus the flag; an exact hit on the area limit is not guaranteed;
- the allowed area under the coverage ratio is below the sliver threshold: the additional inset destroys the footprint — the **infeasible** verdict;
- the height limit is below one floor-to-floor height: zero floors — the **infeasible** verdict;
- self-intersection or a degenerate polygon: an input error with an explanation (the checklist is in "Input error or the infeasible verdict");
- the GFA target is unreachable under the given limits: the verdict with the shortfall in sq. m;
- slivers from rounding errors: the 1 sq. m sliver threshold (see the assumption above).

## What I'd do next

The order follows the value-to-cost ratio and the dependencies.

1. **Comparing any two options.** Picking two in the list, overlaid footprints on the plan, a table of constraint and metric differences — a generalization of the prototype's parent comparison. The data is already in the database, the work is entirely on the frontend. The small interface debts go here too: zoom and pan, panel hiding.
2. **Drawing the site with the mouse.** Direct editing of vertices on the plan; in the prototype the polygon is entered only as text.
3. **Real-world zoning.** The new constraint kinds and realistic value ranges from "Out of scope", with the numbers from domain experts and regulations. Constraints stop being five numbers: they move to jsonb and a schema version appears; the inset with its own distance per side is the biggest jump in core complexity.
4. **Algorithm versioning and branch archiving.** Needs of live use: the algorithm changes — an option keeps the version of the computation that produced it; trees grow — dead-end branches get hidden without being erased. Option renaming goes here too: in the prototype the name is frozen together with the other fields.
5. **The 3D view.** Floors stacked in three.js: the footprint stretched upwards by the floor count. The data is already there (the footprint, the floor count, the floor-to-floor height); the value is clarity, the volume adds no new data.
6. **GFA target auto-fit.** The target is optional and reachable by different combinations of constraints, so this is a search over the allowed ranges with suggestions on how to cover the shortfall: one floor higher or a wider footprint. That is the difference from the additional inset (Algorithm, step 3) — there a mandatory rule has a single answer. It needs a stable core, hence late.
7. **Multiple buildings.** Building on all parts of a split footprint, keeping the distances between buildings. A building with a shape of its own, not equal to the footprint (e.g. a rectangle fitted inside it), goes here too. This changes the model: an option stops being a single polygon.
8. **Underground floors.** Basements live by their own rules (listed in "Out of scope") — up to an underground footprint wider than the building above: parking under the whole site. A separate extension of the floor model.
9. **Scale.** Dedicated metric columns for SQL search and sorting, paged tree loading — as the number of users and the size of trees grow. The computation is pure CPU: moving it to separate processes (a worker pool or a task queue via a message broker) keeps it from blocking the event loop of the API server (see "API contract").
10. **Exporting the result.** To other tools where the architect continues the work, and to a report for the client — for now the result lives only in this interface.
11. **A site polygon with holes.** Zones inside the site where building is not allowed: the polygon stops being a single ring. The geometry already handles holes; validation, the wire format and the interface change.
12. **Terrain.** The prototype treats the site as flat; on a slope even the building height needs a definition — from which level to measure. Changes both the computation and the drawing.
13. **Geo-referencing.** Real map coordinates, import from cadastre or GeoJSON; for now — metres on a flat plane, not attached to any map.
14. **Accounts and collaboration.** There is no user as an entity yet: no authorization, no data separation — everyone sees the same thing. Accounts pull in permissions on sites and trees.
