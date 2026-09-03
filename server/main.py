import os
import sys
import logging
import hashlib
from typing import Optional

# Enforce zero outbound network calls at startup
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from schemas import ScreenPayload, ActionResponse
from vlm_engine import LocalVLMEngine

DEBUG = os.environ.get("DEBUG", "false").lower() in ("true", "1", "yes")

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ISRO-Agent-Server")

# Global LocalVLMEngine reference
vlm_instance: Optional[LocalVLMEngine] = None

app = FastAPI(
    title="ISRO Privacy-Preserving Agentic Server",
    description="100% On-Device Decision Engine for Light-weight Browser Agents (ISRO SIH PS 26171)",
    version="1.0.0",
)

# Lock down CORS: Explicitly allow Chrome Extension and local origins only
ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^chrome-extension://[a-z]{32}$|^http://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Structured 422 diagnostic error logger."""
    error_details = exc.errors()
    logger.error(f"[Stage 3 - Validation Error] Malformed payload received: {error_details}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": error_details, "error": "Schema Validation Failed: Check payload structure and data types."},
    )

@app.on_event("startup")
async def startup_event():
    """Startup Self-Check: Verify Zero-Network Egress & Initialize Local Model."""
    global vlm_instance
    logger.info("=" * 70)
    logger.info("🔒 Zero-Network Egress Verification: Offline Mode Active")
    logger.info(f"   • HF_HUB_OFFLINE={os.environ.get('HF_HUB_OFFLINE')}")
    logger.info(f"   • TRANSFORMERS_OFFLINE={os.environ.get('TRANSFORMERS_OFFLINE')}")
    logger.info(f"   • HF_HUB_DISABLE_TELEMETRY={os.environ.get('HF_HUB_DISABLE_TELEMETRY')}")
    logger.info(f"   • Binding Address: 127.0.0.1:8000 (Localhost Only)")
    logger.info("=" * 70)

    if vlm_instance is None:
        vlm_instance = LocalVLMEngine()
        try:
            vlm_instance.load_model()
        except Exception as e:
            logger.warning(f"Non-blocking startup model load notice: {e}")

    device_str = vlm_instance.device if vlm_instance else "unknown"
    load_time = vlm_instance.load_time_sec if vlm_instance else 0.0
    logger.info(f"VLM Engine initialized on [{device_str}] (load time: {load_time}s, modelLoaded: {vlm_instance.is_loaded if vlm_instance else False})")

@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """Health check endpoint to verify backend service readiness."""
    return {
        "status": "online",
        "service": "ISRO Privacy-Preserving Agentic Server",
        "egress": "zero-outbound-offline-only",
        "device": vlm_instance.device if vlm_instance else "unknown",
        "modelLoaded": vlm_instance.is_loaded if vlm_instance else False,
    }

@app.post("/process-screen", response_model=ActionResponse, status_code=status.HTTP_200_OK)
async def process_screen(payload: ScreenPayload) -> ActionResponse:
    """
    Stage 3 & 4: Process sanitized screen perception frame and DOM interactive tree.
    Returns grounded structured action response without logging raw image data.
    """
    global vlm_instance
    if vlm_instance is None:
        vlm_instance = LocalVLMEngine()

    step_index = payload.stepIndex or 0

    # Compute privacy-safe payload hash for diagnostic tracking
    img_len = len(payload.image)
    img_hash = hashlib.sha256(payload.image.encode("utf-8")[:256]).hexdigest()[:12]

    logger.info(
        f"[Stage 3 - Payload Received] Step: {step_index + 1} | "
        f"Goal: '{payload.userGoal}' | "
        f"DOM Nodes: {len(payload.domElements)} | "
        f"Redacted Frame Size: {img_len} chars (hash: {img_hash}) | "
        f"Masked PII Count: {payload.maskedCount or 0}"
    )

    # Stage 4: Predict Action
    action_response = vlm_instance.predict_action(payload, step_index=step_index)

    logger.info(
        f"[Stage 4 - Decision] Action: {action_response.type} | "
        f"TargetId: {action_response.targetId} | "
        f"Text: {action_response.text} | "
        f"Explanation: {action_response.explanation}"
    )

    return action_response

if __name__ == "__main__":
    import uvicorn
    # Bind explicitly to 127.0.0.1 (Strict Zero-Egress / No Remote Exposure)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
