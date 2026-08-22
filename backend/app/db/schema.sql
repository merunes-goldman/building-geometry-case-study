-- The two tables of docs/DESIGN.md, "Database schema". Applied on every start; all statements are idempotent.

CREATE TABLE IF NOT EXISTS sites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 30),
    polygon jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites (id),
    parent_id uuid REFERENCES options (id),
    name text CHECK (char_length(name) BETWEEN 1 AND 30),
    setback_m double precision NOT NULL CHECK (setback_m >= 0),
    floor_to_floor_m double precision NOT NULL CHECK (floor_to_floor_m > 0),
    max_height_m double precision CHECK (max_height_m >= 0),
    max_floors integer CHECK (max_floors >= 0),
    site_coverage_ratio double precision CHECK (site_coverage_ratio > 0 AND site_coverage_ratio <= 1),
    gfa_target_m2 double precision CHECK (gfa_target_m2 > 0),
    footprint jsonb,
    footprint_split boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (max_height_m IS NOT NULL OR max_floors IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS options_site_id_idx ON options (site_id);
