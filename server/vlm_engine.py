import io
import re
import os
import ast
import json
import time
import base64
import hashlib
import logging
from typing import Optional, List, Dict, Any, Tuple
from PIL import Image

# Enforce strict offline execution at the module level
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    TORCH_AVAILABLE = False

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    requests = None
    REQUESTS_AVAILABLE = False

from schemas import ScreenPayload, ActionResponse

DEBUG = os.environ.get("DEBUG", "false").lower() in ("true", "1", "yes")
logger = logging.getLogger("ISRO-VLM-Engine")


def repair_and_parse_json(raw_text: str) -> Optional[Dict[str, Any]]:
    """
    Robust JSON parser and repair engine for VLM outputs:
    1. Strips markdown fences (```json ... ```)
    2. Extracts balanced JSON object via regex
    3. Fixes trailing commas and common formatting anomalies
    4. Validates object structure
    """
    if not raw_text or not raw_text.strip():
        return None

    cleaned = raw_text.strip()

    # 1. Strip markdown code fences if present
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL | re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    # 2. Extract outermost JSON object
    if not (cleaned.startswith("{") and cleaned.endswith("}")):
        obj_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", cleaned, re.DOTALL)
        if obj_match:
            cleaned = obj_match.group(0).strip()

    # 3. Direct JSON parse attempt
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 4. Try safe AST literal evaluation (handles single quotes and Python dict formats safely)
    try:
        import ast
        evaluated = ast.literal_eval(cleaned)
        if isinstance(evaluated, dict):
            return evaluated
    except Exception:
        pass

    # 5. Repair passes for common LLM syntax flaws (trailing commas)
    repaired = cleaned
    repaired = re.sub(r",\s*([\}\]])", r"\1", repaired)

    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    return None


class LocalVLMEngine:
    """
    Zero-Trust Local Vision-Language Model Inference Engine
    - Strictly bound to local disk/HF cache (Zero Outbound Egress)
    - Hardware-aware loader (CUDA / MPS / CPU) with latency tracking
    - Strict JSON output repair & schema validation
    - Deterministic fallback for guaranteed execution continuity
    """

    def __init__(self, model_id: str = "Qwen/Qwen2-VL-2B-Instruct"):
        self.model_id = model_id
        self.device = "cuda" if (TORCH_AVAILABLE and torch.cuda.is_available()) else "cpu"
        self.model = None
        self.processor = None
        self.is_loaded = False
        self._load_attempted = False
        self.load_time_sec = 0.0

        # Optional local Ollama endpoint (strictly localhost)
        self.ollama_url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
        self.ollama_model = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")

        logger.info(f"LocalVLMEngine initialized on device: {self.device} (PyTorch: {TORCH_AVAILABLE})")

    def load_model(self):
        """Lazy loader for local Qwen2-VL weights strictly from local disk cache."""
        if self.is_loaded or self._load_attempted:
            return

        self._load_attempted = True

        if not TORCH_AVAILABLE:
            logger.info("PyTorch not present. Operating in 100% local deterministic semantic mode.")
            return

        t_start = time.perf_counter()
        try:
            from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
            torch_dtype = torch.float16 if self.device == "cuda" else torch.float32

            logger.info(f"Loading local weights for {self.model_id} on {self.device} (Offline Mode)...")
            self.model = Qwen2VLForConditionalGeneration.from_pretrained(
                self.model_id,
                torch_dtype=torch_dtype,
                device_map="auto" if self.device == "cuda" else None,
                low_cpu_mem_usage=True,
                local_files_only=True,
            )
            self.processor = AutoProcessor.from_pretrained(self.model_id, local_files_only=True)
            self.is_loaded = True
            self.load_time_sec = round(time.perf_counter() - t_start, 2)
            logger.info(f"Loaded {self.model_id} successfully in {self.load_time_sec}s on {self.device}.")
        except Exception as e:
            self.load_time_sec = round(time.perf_counter() - t_start, 2)
            logger.info(f"Local HF cache not pre-loaded ({e}). Using local in-memory decision planner.")
            self.is_loaded = False

    @staticmethod
    def decode_base64_image(base64_str: str) -> Image.Image:
        """Strip data URI header and decode base64 string to a PIL RGB Image."""
        if not base64_str:
            raise ValueError("Base64 string cannot be empty")

        if "," in base64_str:
            base64_str = base64_str.split(",", 1)[1]

        image_data = base64.b64decode(base64_str)
        image = Image.open(io.BytesIO(image_data))
        return image.convert("RGB")

    def _query_local_ollama(self, payload: ScreenPayload, step_index: int) -> Optional[ActionResponse]:
        """Query local Ollama instance on http://127.0.0.1:11434 with strict JSON validation."""
        if not REQUESTS_AVAILABLE:
            return None

        try:
            health = requests.get(f"{self.ollama_url}/api/tags", timeout=(0.3, 0.8))
            if health.status_code != 200:
                return None

            available = [m.get("name", "") for m in health.json().get("models", [])]
            target_model = self.ollama_model
            if target_model not in available and available:
                target_model = available[0]

            nodes_legend = "\n".join([
                f"[{n.id}] <{n.tag}> text=\"{n.text}\""
                for n in payload.domElements[:25]
            ])

            system_prompt = (
                "You are an autonomous browser agent running 100% locally on-device.\n"
                "STRICT RULES:\n"
                "1. Execute ONLY the specific action needed for the current step of the USER GOAL.\n"
                "2. When all requested tasks are complete, output {\"type\": \"DONE\"}.\n"
                "3. Respond ONLY with a valid JSON object matching this schema:\n"
                "{\"type\": \"TYPE\" | \"CLICK\" | \"SCROLL\" | \"DONE\", \"targetId\": <int or null>, \"text\": \"<string or null>\", \"explanation\": \"<short reason>\"}"
            )

            user_prompt = (
                f"USER GOAL: \"{payload.userGoal}\"\n"
                f"CURRENT STEP: {step_index + 1}\n\n"
                f"INTERACTIVE DOM NODES ON PAGE:\n{nodes_legend}\n\n"
                "Next Action JSON:"
            )

            req_body = {
                "model": target_model,
                "prompt": user_prompt,
                "system": system_prompt,
                "stream": False,
                "format": "json"
            }

            resp = requests.post(f"{self.ollama_url}/api/generate", json=req_body, timeout=10)
            if resp.status_code == 200:
                raw_response = resp.json().get("response", "")
                parsed = repair_and_parse_json(raw_response)
                if parsed and "type" in parsed:
                    action_type = str(parsed.get("type", "CLICK")).upper()
                    if action_type in ("CLICK", "TYPE", "SCROLL", "NAVIGATE", "SELECT", "DONE", "NOOP"):
                        return ActionResponse(
                            type=action_type,  # type: ignore
                            targetId=parsed.get("targetId"),
                            text=parsed.get("text"),
                            distance=parsed.get("distance", 350 if action_type == "SCROLL" else None),
                            url=parsed.get("url"),
                            explanation=f"[Local Ollama:{target_model}] {parsed.get('explanation', 'Grounded action')}"
                        )
        except Exception as e:
            if DEBUG:
                logger.debug(f"Ollama local query notice: {e}")

        return None

    def _strict_semantic_grounding(self, payload: ScreenPayload, step_index: int) -> ActionResponse:
        """
        Deterministic, zero-latency in-memory semantic grounding engine.
        Strictly executes assigned tasks in order and emits DONE immediately upon completion.
        """
        goal = payload.userGoal.strip()
        nodes = payload.domElements

        if not nodes:
            return ActionResponse(
                type="SCROLL",
                targetId=None,
                distance=400,
                text=None,
                url=None,
                explanation="No interactive elements detected; scrolling down 400px."
            )

        # 1. Parse atomic instructions strictly from the user's prompt (with word boundaries \b)
        clauses = re.split(r'\s*(?:\band\s+then\b|\bthen\b|\band\b|\.|\;|\&)\s*', goal, flags=re.IGNORECASE)
        tasks = []

        for c in clauses:
            c = c.strip()
            if not c:
                continue

            c_lower = c.lower()

            # Navigation intent: "go to google.com" / "open wikipedia.org"
            m_nav = re.search(r'^(?:go\s+to|open|navigate\s+to)\s+([a-zA-Z0-9./:_-]+)$', c, re.IGNORECASE)
            if m_nav:
                url = m_nav.group(1).strip()
                if not url.startswith("http"):
                    url = f"https://{url}"
                tasks.append({"type": "NAVIGATE", "url": url, "desc": f"Navigate to {url}"})
                continue

            # Search intent: "search for X" / "search X"
            m_search = re.search(r'^(?:search\s+for|search|look\s*up|find)\s+["\']?([^"\']+)["\']?$', c, re.IGNORECASE)
            if m_search:
                q = m_search.group(1).strip()
                tasks.append({"type": "TYPE", "hint": "search", "value": q, "desc": f"Search '{q}'"})
                tasks.append({"type": "CLICK", "hint": "search button", "value": None, "desc": "Execute search"})
                continue

            # Explicit Typing: "enter X as Y" / "fill X with Y" / "type Y into X"
            m_type_as = re.search(r'^(?:enter|type|input|fill|put|set|write)\s+(?:the\s+)?(.+?)\s+(?:as|a|with|to|=|:)\s+["\']?([^"\'\n]+?)["\']?$', c, re.IGNORECASE)
            if m_type_as:
                fld = m_type_as.group(1).strip()
                val = m_type_as.group(2).strip().rstrip('.,;')
                tasks.append({"type": "TYPE", "hint": fld, "value": val, "desc": f"Type '{val}' into {fld}"})
                continue

            m_type_into = re.search(r'^(?:enter|type|input|fill|put|write)\s+["\']?([^"\']+?)["\']?\s+(?:in|into|in the|into the|on)\s+(.+)$', c, re.IGNORECASE)
            if m_type_into:
                val = m_type_into.group(1).strip()
                fld = m_type_into.group(2).strip().rstrip('.,;')
                tasks.append({"type": "TYPE", "hint": fld, "value": val, "desc": f"Type '{val}' into {fld}"})
                continue

            # Scrolling: "scroll down" / "scroll up 400px"
            m_scroll = re.search(r'^(?:scroll|move)\s+(down|up|bottom|top)?(?:\s+by)?(?:\s+(\d+)\s*(?:px)?)?', c, re.IGNORECASE)
            if m_scroll:
                direction = (m_scroll.group(1) or "down").lower()
                dist = int(m_scroll.group(2)) if m_scroll.group(2) else 400
                if direction in ("up", "top"):
                    dist = -dist
                tasks.append({"type": "SCROLL", "distance": dist, "desc": f"Scroll {direction} by {abs(dist)}px"})
                continue

            # Clicking / Selecting: "click on X" / "press X" / "check X" / "select X"
            m_click = re.search(r'^(?:click|press|tap|hit|check|tick|select|choose|open)\s+(?:on\s+)?(?:the\s+)?["\']?(.+?)["\']?$', c, re.IGNORECASE)
            if m_click:
                target = m_click.group(1).strip().rstrip('.,;')
                tasks.append({"type": "CLICK", "hint": target, "value": None, "desc": f"Click on '{target}'"})
                continue

            # Action verbs: "submit", "login", "next"
            if c_lower in ("submit", "login", "log in", "signin", "sign in", "register", "signup", "sign up", "continue", "next", "search", "send", "save", "apply", "ok", "confirm"):
                tasks.append({"type": "CLICK", "hint": c, "value": None, "desc": f"Click {c}"})
                continue

            tasks.append({"type": "CLICK", "hint": c, "value": None, "desc": f"Interact with '{c}'"})

        # Auto-append submit if explicitly requested in overall prompt
        if not any(t["type"] == "CLICK" for t in tasks):
            if re.search(r'(?:submit|login|sign\s*in|log\s*in|finalize|apply)', goal, re.IGNORECASE):
                tasks.append({"type": "CLICK", "hint": "submit", "value": None, "desc": "Click submit button"})

        # 2. Strict Stop Condition: Stop immediately with DONE when assigned tasks finish
        if tasks and step_index >= len(tasks):
            return ActionResponse(
                type="DONE",
                targetId=None,
                distance=None,
                text=None,
                url=None,
                explanation=f"[100% Local Agent] Finished all {len(tasks)} assigned steps for: \"{goal}\"."
            )

        # 3. Ground current step to DOM node
        curr_task = tasks[step_index] if (tasks and step_index < len(tasks)) else None
        total_steps = len(tasks) if tasks else 1

        if curr_task:
            if curr_task["type"] == "NAVIGATE":
                return ActionResponse(
                    type="NAVIGATE",
                    targetId=None,
                    url=curr_task.get("url"),
                    text=None,
                    distance=None,
                    explanation=f"[Step {step_index + 1}/{total_steps}] {curr_task['desc']}"
                )

            if curr_task["type"] == "SCROLL":
                return ActionResponse(
                    type="SCROLL",
                    targetId=None,
                    distance=curr_task.get("distance", 400),
                    text=None,
                    url=None,
                    explanation=f"[Step {step_index + 1}/{total_steps}] {curr_task['desc']}"
                )

            hint = curr_task.get("hint", "")
            action_type = curr_task["type"]
            prefer_tag = "input" if action_type == "TYPE" else "button"

            target_node = self._match_best_dom_node(hint, nodes, prefer_tag=prefer_tag)
            if target_node:
                return ActionResponse(
                    type=action_type,  # type: ignore
                    targetId=target_node.id,
                    text=curr_task.get("value"),
                    distance=None,
                    url=None,
                    explanation=f"[Step {step_index + 1}/{total_steps}] {curr_task['desc']} on [{target_node.id}] <{target_node.tag}> '{target_node.text}'"
                )

        # Fallback keyword match
        best_node = self._match_best_dom_node(goal, nodes)
        if best_node:
            return ActionResponse(
                type="CLICK",
                targetId=best_node.id,
                text=None,
                distance=None,
                url=None,
                explanation=f"Grounded to [{best_node.id}] <{best_node.tag}> '{best_node.text}'."
            )

        first_node = nodes[0]
        return ActionResponse(
            type="CLICK",
            targetId=first_node.id,
            text=None,
            distance=None,
            url=None,
            explanation=f"Interacting with [{first_node.id}] <{first_node.tag}> '{first_node.text}'."
        )

    def _match_best_dom_node(self, query: str, nodes: list, prefer_tag: str = None) -> Optional[Any]:
        """Multi-attribute semantic scorer with synonym expansion."""
        if not nodes or not query:
            return nodes[0] if nodes else None

        query_clean = query.lower().strip()
        query_words = [w for w in re.split(r'\W+', query_clean) if len(w) > 1]

        best_score = -1
        best_match = None

        synonyms = {
            "search": ["query", "find", "search", "q", "lookup", "filter"],
            "username": ["user", "login", "email", "identifier", "name", "account"],
            "password": ["pass", "pwd", "secret", "pin", "auth", "secure-password"],
            "submit": ["login", "signin", "send", "continue", "next", "confirm", "apply", "ok", "go"],
            "email": ["mail", "email", "e-mail", "user"],
        }

        expanded_words = set(query_words)
        for key, syn_list in synonyms.items():
            if key in query_clean or any(w in key for w in query_words):
                expanded_words.update(syn_list)

        for node in nodes:
            text = (node.text or "").lower()
            tag = (node.tag or "").lower()

            score = 0

            # Tag preference bonus
            if prefer_tag == "input" and tag in ("input", "textarea"):
                score += 20
            elif prefer_tag == "button" and (tag in ("button", "a") or "submit" in text):
                score += 15

            # Exact phrase match
            if query_clean in text:
                score += 50

            # Keyword matching
            for w in expanded_words:
                if w in text:
                    score += 15

            # Search specific weighting
            if "search" in query_clean:
                if "search" in text or "query" in text or "q" in text:
                    score += 30

            # Password specific weighting
            if "pass" in query_clean and ("pass" in text or "pwd" in text or "secure" in text):
                score += 40

            # Username specific weighting
            if ("user" in query_clean or "name" in query_clean) and ("user" in text or "name" in text or "login" in text):
                score += 35

            if score > best_score and score > 0:
                best_score = score
                best_match = node

        if not best_match and prefer_tag:
            for node in nodes:
                if prefer_tag == "input" and node.tag in ("input", "textarea"):
                    return node
                if prefer_tag == "button" and node.tag in ("button", "a"):
                    return node

        return best_match or (nodes[0] if nodes else None)

    def predict_action(self, payload: ScreenPayload, step_index: int = 0) -> ActionResponse:
        """
        Unified Decision Pipeline with Strict Validation & Safe Fallbacks:
        1. Local Ollama VLM (if running on http://127.0.0.1:11434)
        2. Local PyTorch Qwen2-VL (if weights cached on disk)
        3. Strict Deterministic Semantic Grounding (0-latency offline planner)
        """
        # 1. Try local Ollama if active
        ollama_resp = self._query_local_ollama(payload, step_index)
        if ollama_resp:
            return ollama_resp

        # 2. Try local HuggingFace Qwen2-VL if loaded
        if self.is_loaded and self.model is not None and self.processor is not None:
            try:
                image = self.decode_base64_image(payload.image)
                nodes_legend = "\n".join([
                    f"- Node [{node.id}]: <{node.tag}> \"{node.text}\""
                    for node in payload.domElements[:15]
                ])

                prompt_text = (
                    f"USER GOAL: \"{payload.userGoal}\"\n"
                    f"STEP: {step_index + 1}\n\n"
                    f"INTERACTIVE DOM NODES:\n{nodes_legend}\n\n"
                    f"Return ONLY valid JSON action command:\n"
                    f'{{"type": "TYPE" | "CLICK" | "SCROLL" | "DONE", "targetId": <int>, "text": "<str>", "explanation": "<reason>"}}'
                )

                messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "image": image},
                            {"type": "text", "text": prompt_text},
                        ],
                    }
                ]

                from qwen_vl_utils import process_vision_info
                text_prompt = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                image_inputs, video_inputs = process_vision_info(messages)

                inputs = self.processor(
                    text=[text_prompt],
                    images=image_inputs,
                    videos=video_inputs,
                    padding=True,
                    return_tensors="pt",
                ).to(self.device)

                with torch.no_grad():
                    generated_ids = self.model.generate(**inputs, max_new_tokens=128, temperature=0.1, do_sample=False)

                out_ids = generated_ids[0][len(inputs.input_ids[0]):]
                response_text = self.processor.decode(out_ids, skip_special_tokens=True).strip()

                parsed = repair_and_parse_json(response_text)
                if parsed and "type" in parsed:
                    action_type = str(parsed.get("type", "CLICK")).upper()
                    if action_type in ("CLICK", "TYPE", "SCROLL", "NAVIGATE", "SELECT", "DONE", "NOOP"):
                        return ActionResponse(
                            type=action_type,  # type: ignore
                            targetId=parsed.get("targetId"),
                            text=parsed.get("text"),
                            distance=parsed.get("distance", 350 if action_type == "SCROLL" else None),
                            url=parsed.get("url"),
                            explanation=f"[Local Qwen2-VL] {parsed.get('explanation', 'Visual grounded decision')}"
                        )
            except Exception as e:
                if DEBUG:
                    logger.debug(f"HF inference exception: {e}")

        # 3. Deterministic Grounding Fallback
        return self._strict_semantic_grounding(payload, step_index)
