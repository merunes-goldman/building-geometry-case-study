"""Request and response shapes of the API (docs/DESIGN.md, "API contract")."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.geometry.massing import Constraints, MassingResult, Polygon

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]


class SiteIn(BaseModel):
    name: Name
    polygon: Polygon


class Site(BaseModel):
    id: UUID
    name: str
    polygon: Polygon
    created_at: datetime


class OptionIn(BaseModel):
    name: Name | None = None
    parent_id: UUID | None = None  # branching; a root has no parent
    constraints: Constraints


class Option(BaseModel):
    id: UUID
    site_id: UUID
    parent_id: UUID | None
    name: str | None
    constraints: Constraints
    result: MassingResult
    created_at: datetime


class PreviewIn(BaseModel):
    site_id: UUID
    constraints: Constraints
