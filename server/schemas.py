from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal

class BoundingBox(BaseModel):
    x: float = Field(..., description="X coordinate in viewport pixels")
    y: float = Field(..., description="Y coordinate in viewport pixels")
    width: float = Field(..., description="Width in pixels")
    height: float = Field(..., description="Height in pixels")

class DOMElementNode(BaseModel):
    id: int = Field(..., description="Zero-based unique element index")
    tag: str = Field(..., description="HTML tag name (e.g. input, button, a)")
    text: str = Field(default="", description="Descriptive label, placeholder, or aria-label text")
    bbox: BoundingBox = Field(..., description="Element bounding box coordinates")

class ScreenPayload(BaseModel):
    image: str = Field(..., description="Base64 encoded sanitized/redacted PNG screenshot")
    domElements: List[DOMElementNode] = Field(default_factory=list, description="List of indexed interactive DOM nodes")
    userGoal: str = Field(..., description="High-level user task instruction")
    stepIndex: Optional[int] = Field(0, description="Current step index for multi-step goal execution (0-based)")
    url: Optional[str] = Field(default="", description="Active page URL (optional metadata)")
    title: Optional[str] = Field(default="", description="Active page title (optional metadata)")
    maskedCount: Optional[int] = Field(default=0, description="Count of masked PII regions")

    @field_validator("image")
    @classmethod
    def validate_image_payload(cls, v: str) -> str:
        if not v or len(v) < 20:
            raise ValueError("Image payload must be a non-empty base64 string")
        return v

    @field_validator("userGoal")
    @classmethod
    def validate_goal(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("userGoal cannot be empty")
        return v.strip()

class ActionResponse(BaseModel):
    type: Literal["CLICK", "TYPE", "SCROLL", "NAVIGATE", "SELECT", "DONE", "NOOP"] = Field(
        ..., description="Action type: CLICK, TYPE, SCROLL, NAVIGATE, SELECT, DONE, NOOP"
    )
    targetId: Optional[int] = Field(None, description="Zero-based ID of the interactive DOM node to target")
    distance: Optional[int] = Field(None, description="Scroll distance offset in pixels")
    text: Optional[str] = Field(None, description="Text to type into input element if action is TYPE or SELECT")
    url: Optional[str] = Field(None, description="Destination URL if action is NAVIGATE")
    explanation: str = Field(..., description="Agent reasoning behind the decision")
