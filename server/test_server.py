import base64
import io
from PIL import Image
from schemas import ScreenPayload, DOMElementNode, BoundingBox
from vlm_engine import LocalVLMEngine

def test_vlm_engine():
    # 1. Create a dummy 200x200 red PNG and encode as base64
    img = Image.new("RGB", (200, 200), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    base64_str = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

    # 2. Construct mock payload
    payload = ScreenPayload(
        image=base64_str,
        userGoal="Click the submit button",
        domElements=[
            DOMElementNode(
                id=0,
                tag="button",
                text="Submit Application",
                bbox=BoundingBox(x=50.0, y=100.0, width=120.0, height=40.0),
            ),
            DOMElementNode(
                id=1,
                tag="a",
                text="Cancel",
                bbox=BoundingBox(x=180.0, y=100.0, width=80.0, height=40.0),
            ),
        ],
    )

    # 3. Test VLM engine prediction
    engine = LocalVLMEngine()
    response = engine.predict_action(payload)
    print("Test Prediction Successful!")
    print(f"Action Type: {response.type}")
    print(f"Target ID: {response.targetId}")
    print(f"Explanation: {response.explanation}")

    assert response.type in ["CLICK", "SCROLL", "TYPE", "DONE"]
    assert response.explanation is not None

if __name__ == "__main__":
    test_vlm_engine()
