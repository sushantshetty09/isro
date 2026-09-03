import base64
import io
from PIL import Image
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    print("Health check endpoint verified:", data)

def test_process_screen_endpoint():
    # Create dummy base64 test image
    img = Image.new("RGB", (200, 200), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    base64_str = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

    payload = {
        "image": base64_str,
        "userGoal": "Click login button",
        "domElements": [
            {
                "id": 10,
                "tag": "button",
                "text": "Login",
                "bbox": {"x": 100.0, "y": 200.0, "width": 80.0, "height": 30.0}
            }
        ]
    }

    response = client.post("/process-screen", json=payload)
    assert response.status_code == 200
    data = response.json()
    print("Process screen response:", data)
    assert data["type"] == "CLICK"
    assert data["targetId"] == 10
    assert "Login" in data["explanation"]

if __name__ == "__main__":
    test_health_endpoint()
    test_process_screen_endpoint()
    print("All E2E Server API tests passed successfully!")
