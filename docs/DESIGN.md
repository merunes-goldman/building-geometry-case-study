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
- an infeasible result is a normal result: it is saved in the tree with a reason, and the user can branch from it
- any site polygon (a single ring, no holes) via the API, with full validation
- flat site, no terrain
- template sites to choose from + creating a site by pasting coordinates as text
- live preview of the current experiment

Out of scope — all in the roadmap:

- real-world zoning: new kinds of constraints (per-side setbacks, sun access rules) and realistic values for the existing ones (value ranges, minimum footprint width, proportion limits) — every such rule or number needs a domain reason: why is 50 floors fine and a million not? Inventing such numbers is just guesswork — they should come from domain experts and regulations. The prototype checks only what breaks the math, not what is realistic
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
- exporting the result for other tools
- site polygon with holes: zones inside the site where building is not allowed
- sloped terrain: the prototype treats the site as flat; on a slope even "building height" needs a definition — measured from where?
- geo-referencing: real map coordinates, import from cadastre or GeoJSON (for now — plain metres on a flat plane)

## Domain model

The core types — site, constraints, massing/option — and how the saved options form
a decision tree. Include the persistence schema (tables / relationships).

## Algorithm

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
