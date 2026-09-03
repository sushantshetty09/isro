import io
import json
import socket
import base64
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from main import app
from vlm_engine import repair_and_parse_json, LocalVLMEngine
from schemas import ScreenPayload, DOMElementNode, BoundingBox

client = TestClient(app)


def generate_synthetic_redacted_screen() -> str:
    """Generate a synthetic 400x300 screenshot with redacted PII overlay."""
    img = Image.new("RGB", (400, 300), color=(245, 247, 250))
    draw = ImageDraw.Draw(img)

    # Header bar
    draw.rectangle([(0, 0), (400, 40)], fill=(30, 41, 59))
    draw.text((15, 12), "ISRO Secure Portal - Mission Dashboard", fill=(255, 255, 255))

    # Redacted PII Region
    draw.rectangle([(20, 85), (320, 130)], fill=(0, 0, 0))
    draw.text((30, 100), "[MASKED PII: SENSITIVE AADHAAR]", fill=(255, 255, 255))

    # Candidate Button
    draw.rectangle([(20, 160), (160, 205)], fill=(37, 99, 235))
    draw.text((35, 175), "Approve & Submit", fill=(255, 255, 255))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


class TestISROPrivacyAgentIntegration(unittest.TestCase):

    def setUp(self):
        self.synthetic_image = generate_synthetic_redacted_screen()

    def test_01_full_rpc_pipeline(self):
        """Test 1: End-to-End RPC pipeline with synthetic redacted screen perception frame."""
        payload = {
            "image": self.synthetic_image,
            "userGoal": "Click the Approve & Submit button to finalize application",
            "stepIndex": 0,
            "domElements": [
                {
                    "id": 0,
                    "tag": "button",
                    "text": "Approve & Submit",
                    "bbox": {"x": 20.0, "y": 160.0, "width": 140.0, "height": 45.0}
                },
                {
                    "id": 1,
                    "tag": "a",
                    "text": "Cancel",
                    "bbox": {"x": 180.0, "y": 160.0, "width": 80.0, "height": 45.0}
                }
            ]
        }

        response = client.post("/process-screen", json=payload)
        self.assertEqual(response.status_code, 200, f"Expected 200 OK, got {response.status_code}: {response.text}")

        data = response.json()
        self.assertIn(data["type"], ["CLICK", "TYPE", "SCROLL", "DONE", "NAVIGATE", "SELECT", "NOOP"])
        self.assertEqual(data["targetId"], 0)
        self.assertIn("Approve & Submit", data["explanation"])

    def test_02_json_repair_and_validation(self):
        """Test 2: Robust JSON extraction & repair from malformed LLM outputs."""
        # Case A: Markdown code fences with extra conversational text
        sample_a = 'Here is the action:\n```json\n{"type": "CLICK", "targetId": 2, "explanation": "Clicked submit"}\n```\nHope this helps!'
        res_a = repair_and_parse_json(sample_a)
        self.assertIsNotNone(res_a)
        self.assertEqual(res_a["type"], "CLICK")
        self.assertEqual(res_a["targetId"], 2)

        # Case B: Trailing commas
        sample_b = '{"type": "TYPE", "targetId": 0, "text": "tomsmith", "explanation": "Typing username",}'
        res_b = repair_and_parse_json(sample_b)
        self.assertIsNotNone(res_b)
        self.assertEqual(res_b["type"], "TYPE")
        self.assertEqual(res_b["text"], "tomsmith")

        # Case C: Single quotes around keys
        sample_c = "{'type': 'SCROLL', 'distance': 400, 'explanation': 'Scrolling page'}"
        res_c = repair_and_parse_json(sample_c)
        self.assertIsNotNone(res_c)
        self.assertEqual(res_c["type"], "SCROLL")

    def test_03_cors_origin_policy(self):
        """Test 3: CORS verification for Chrome Extensions and Localhost."""
        # Allowed Chrome Extension Origin
        headers_ext = {
            "Origin": "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef",
            "Access-Control-Request-Method": "POST",
        }
        res_ext = client.options("/process-screen", headers=headers_ext)
        self.assertEqual(res_ext.headers.get("access-control-allow-origin"), "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef")

        # Allowed Localhost Origin
        headers_local = {
            "Origin": "http://127.0.0.1:8000",
            "Access-Control-Request-Method": "POST",
        }
        res_local = client.options("/process-screen", headers=headers_local)
        self.assertEqual(res_local.headers.get("access-control-allow-origin"), "http://127.0.0.1:8000")

    def test_04_zero_network_egress_assertion(self):
        """Test 4: Strict assertion that 0 network socket connections touch external hosts."""
        orig_connect = socket.socket.connect
        remote_hosts_contacted = []

        def mock_connect(sock_self, address):
            host = address[0] if isinstance(address, tuple) else address
            # Allowed local addresses
            if host not in ("127.0.0.1", "localhost", "::1", "testclient"):
                remote_hosts_contacted.append(host)
                raise ConnectionRefusedError(f"Zero-Egress Violation: Attempted to contact external host {host}")
            return orig_connect(sock_self, address)

        with patch.object(socket.socket, "connect", side_effect=mock_connect):
            engine = LocalVLMEngine()
            payload = ScreenPayload(
                image=self.synthetic_image,
                userGoal="Search for Chandrayaan-3 and click Submit",
                domElements=[
                    DOMElementNode(id=0, tag="input", text="Search", bbox=BoundingBox(x=10, y=10, width=100, height=30)),
                    DOMElementNode(id=1, tag="button", text="Submit", bbox=BoundingBox(x=10, y=50, width=80, height=30))
                ]
            )

            # Step 0: Type search query
            act_0 = engine.predict_action(payload, step_index=0)
            self.assertEqual(act_0.type, "TYPE")
            self.assertEqual(act_0.text, "Chandrayaan-3")

            # Step 1: Click search button
            act_1 = engine.predict_action(payload, step_index=1)
            self.assertEqual(act_1.type, "CLICK")

            # Step 2: Click submit
            act_2 = engine.predict_action(payload, step_index=2)
            self.assertEqual(act_2.type, "CLICK")

            # Step 3: Strict DONE
            act_3 = engine.predict_action(payload, step_index=3)
            self.assertEqual(act_3.type, "DONE")

        # Assert zero external hosts contacted
        self.assertEqual(len(remote_hosts_contacted), 0, f"External network egress detected: {remote_hosts_contacted}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
