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
- scale: metric columns for SQL search and sorting, paged tree loading
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

The endpoints you exposed and their request/response shapes (create, branch, list,
get, …).

## Visualization

What you render and why you chose that approach.

## Assumptions & trade-offs

The decisions you made under ambiguity, and what you consciously traded away.

## Edge cases

How you handle concave plots, an inset that collapses to zero/splits, infeasible
constraint sets, self-intersection, an unreachable GFA target.

## What I'd do next

With another week: what you'd build, in what order, and why.
