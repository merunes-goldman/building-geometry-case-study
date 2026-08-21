# Design note

> This is a template. Replace each section with your thinking. We read this first —
> it matters more than line count. Keep it sharp; bullet points are fine.

## Problem interpretation

**Problem.** At the very beginning of a building project the architect needs to find out what can be built on the site under the given constraints at all. This takes many experiments: "what if the setback is smaller?", "what if we add floors?", etc. — and combinations of those. With pen and paper or general-purpose tools every experiment means manually redrawing and recomputing metrics; the decision history is hard to keep, options are hard to compare, and mistakes are easy to make.

**Solution.** A specialized tool that makes an experiment instant and keeps it from getting lost. A single computation is simple (polygon inset plus arithmetic); the real value is in the exploration, so the focus is the option tree and the live preview, not the computation itself.

Three parts: the computation core (a pure function), storage with the option tree (Postgres, plain SQL), and the visualization (React + SVG).

**The prototype.**

In scope:

- 5 constraints (setback, floor-to-floor height, building height limit, floor count limit, site coverage ratio)
- 1 target to aim for (GFA)
- 1 building
- identical above-ground floors: same floor plate, same height
- a single setback for the whole perimeter
- option tree: save an option, branch from it, compare with the parent
- an infeasible result is a normal result: it is saved in the tree like any other option, shown with the reason, and the user can branch from it
- any site polygon (a single ring, no holes) via the API, with full validation
- flat site, no terrain
- template sites to choose from + creating a site by pasting coordinates as text
- live preview of the current experiment

Out of scope — all in the roadmap:

- real-world zoning: new kinds of constraints (per-side setbacks, sun access rules) and realistic values for the existing ones (value ranges, minimum footprint width, proportion limits). Every such rule or number needs a domain reason — why is 50 floors fine and a million not? — and inventing them is guesswork: they should come from domain experts and regulations. The prototype checks only what breaks the math, not what is realistic
- drawing the site with the mouse + quality-of-life improvements: zoom, pan, panel hiding
- comparing any two options (the prototype compares only with the parent)
- multiple buildings
- underground floors (basements) — they probably live by different rules: setbacks and height limits can apply to the above-ground part only, basement area may not count toward GFA, and the underground footprint can be wider than the building above
- GFA target auto-fit
- 3D view
- branch archiving and option renaming (in the prototype options are immutable, and there is no deletion by design)
- algorithm versioning (a stored option remembers which version of the computation produced it)
- scale: metric columns for SQL search and sorting, paged tree loading
- user accounts and collaboration
- exporting the result to other tools
- site polygon with holes: zones inside the site where building is not allowed
- sloped terrain: the prototype treats the site as flat; on a slope even "building height" needs a definition — measured from where?
- geo-referencing: real map coordinates, import from cadastre or GeoJSON (for now — plain metres on a flat plane)

## Domain model

There are two entities to persist: **site** and **option**. Constraints and the result are not separate entities but columns of the option.

- **Site** — a named polygon in metres. Immutable: all computations depend on it, so another polygon is another site.
- **Option** — a tree node: the full set of constraints plus the geometric result of the computation. Created from scratch (a root) or by branching an existing option: the parent's constraints, a few changes, a new computed result, and a link to the parent.

### Tree rules

- An option is immutable once saved; an edit is a new branch. The tree stays an honest history of experiments, and any two options remain comparable. This covers the name too: no renaming in the prototype — it comes together with archiving (roadmap).
- An option is self-contained: it stores the full set of constraints, not a diff from the parent. Reading needs no walk over ancestors; comparing two options is comparing two table rows.
- A site can have several roots — several independent trees. The parent link means "branched from"; if the root were always single, a fresh start would have to be attached to a foreign root with a fake link.
- No deletion of options, by design: an option is part of the history and may have children. The real future need is hiding dead-end branches without erasing them — that is archiving, and it is in the roadmap. The prototype needs neither: trees are small, spare rows cost nothing.

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
| site_id | uuid | the site; all its options are read by it |
| parent_id | uuid, optional | the parent option; empty for a root |
| name | text, optional | option name |
| setback_m | numeric | setback |
| floor_to_floor_m | numeric | floor-to-floor height |
| max_height_m | numeric, optional | height limit; at least one of the two limits is set |
| max_floors | integer, optional | floor count limit |
| site_coverage_ratio | numeric, optional | site coverage; without it there is no additional inset (see Algorithm) |
| gfa_target_m2 | numeric, optional | GFA target |
| footprint | jsonb, optional | the footprint polygon after the setback and the additional inset (the kept part if it split); empty only when nothing is left of the footprint |
| footprint_split | boolean | the **footprint split** flag |
| created_at | timestamptz | |

site_id and parent_id are foreign keys (the API additionally checks that the parent belongs to the same site); site_id is indexed because the main read is all options of a site at once. Value bounds and the "at least one limit" rule are duplicated by CHECK constraints — a safety net besides the API validation; for max_floors the integer column type is enough.

**Seeding.** On backend start, if the sites table is empty, the template sites from data/sites are inserted as ordinary rows — after that they are no different from user-created ones.

Constraints are separate columns, not one JSON field (the jsonb type in Postgres): there are five of them and the set is known; columns give types and database-level checks. The price is a migration for every new constraint; fine for the prototype, moving to jsonb when the list grows — roadmap.

## Algorithm

### Derived values

Everything below is recomputed on read from the stored columns — nothing here is persisted:

- footprint area — the polygon area of the stored footprint, computed from its vertices
- floor count — the smaller of max_floors and floor(max_height_m / floor_to_floor_m); if only one limit is set, it acts alone; the division uses a small tolerance (so 9.6 / 3.2 gives 3 floors, not 2)
- height — floor count * floor_to_floor_m
- GFA — footprint area * floor count
- coverage and FAR (for reference) — footprint area / site area and GFA / site area
- GFA target shortfall — gfa_target_m2 minus GFA, when the target is set and missed
- verdict — the footprint is empty: **infeasible**; the floor count is zero: **infeasible**; otherwise **ok**, or **GFA target missed** if the target is set and not reached

How you turn a site polygon + constraints into a massing: setback inset, floor
stacking, metrics (footprint area, GFA, floor count), feasibility. Note the geometry
library or approach and why.

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
