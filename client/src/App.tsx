import React, { useState } from 'react';
import {
  ShieldCheck,
  Send,
  Lock,
  Terminal,
  Activity,
  EyeOff,
  Layers,
  RefreshCw,
  Sparkles,
  Search,
  LogIn,
  ArrowDown,
  Trash2,
} from 'lucide-react';

type AgentStatus = 'idle' | 'redacting' | 'sending' | 'executing' | 'done' | 'error';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NonSensitiveDOMNode {
  id: number;
  tag: string;
  text: string;
  bbox: BoundingBox;
}

interface ScanDOMResponse {
  status: string;
  sensitiveBoxes: BoundingBox[];
  interactiveNodes: NonSensitiveDOMNode[];
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    devicePixelRatio: number;
  };
}

const MAX_STEPS = 10;
const STEP_DELAY_MS = 1000;

export const App: React.FC = () => {
  const [userGoal, setUserGoal] = useState<string>('');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] System ready. ISRO Privacy Shield active (100% Local).`,
  ]);
  const [sanitizedPreview, setSanitizedPreview] = useState<string | null>(null);
  const [interactiveCount, setInteractiveCount] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [totalSteps, setTotalSteps] = useState<number>(0);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev].slice(0, 60));
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Quick preset commands for 1-click execution
  const presets = [
    { label: 'Login Demo', icon: <LogIn size={11} />, text: 'Enter username as tomsmith and enter password as SuperSecretPassword! and submit' },
    { label: 'Search Query', icon: <Search size={11} />, text: 'Search for ISRO Chandrayaan-3 missions' },
    { label: 'Scroll Page', icon: <ArrowDown size={11} />, text: 'Scroll down by 400px' },
  ];

  /**
   * Safe DOM Scanner with fallback to direct script execution
   */
  const scanDOMOnTab = async (tabId: number): Promise<ScanDOMResponse> => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'SCAN_DOM_NODES' });
      if (res && res.status === 'success' && res.interactiveNodes?.length > 0) return res;
    } catch {
      // Content script disconnected fallback
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const SENSITIVE = [
            'input[type="password"]',
            'input[name*="pass" i]',
            'input[name*="card" i]',
            'input[name*="ssn" i]',
            'input[name*="aadhar" i]',
            'input[name*="cvv" i]',
            'input[autocomplete*="cc-" i]',
          ];
          const INTERACTIVE = [
            'button',
            'a[href]',
            'input',
            'textarea',
            'select',
            'summary',
            '[role="button"]',
            '[role="link"]',
            '[role="checkbox"]',
            '[role="radio"]',
            '[role="tab"]',
            '[role="menuitem"]',
            '[contenteditable="true"]',
            '[tabindex]:not([tabindex="-1"])',
          ];

          const sensitiveBoxes: any[] = [];
          for (const sel of SENSITIVE) {
            document.querySelectorAll(sel).forEach((el) => {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                sensitiveBoxes.push({
                  x: Math.round(r.left + window.scrollX),
                  y: Math.round(r.top + window.scrollY),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                });
              }
            });
          }

          const interactiveNodes: any[] = [];
          const seen = new Set<Element>();
          let currentId = 0;

          document.querySelectorAll(INTERACTIVE.join(', ')).forEach((el) => {
            if (seen.has(el)) return;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              seen.add(el);
              const htmlEl = el as HTMLElement;
              const inputEl = el as HTMLInputElement;

              const inputType = inputEl.type || '';
              const placeholder = inputEl.placeholder || '';
              const ariaLabel = htmlEl.getAttribute('aria-label') || '';
              const name = inputEl.name || '';
              const id = inputEl.id || '';
              const innerText = (htmlEl.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);

              let labelText = '';
              if (id) {
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) labelText = (label as HTMLElement).innerText.trim();
              }

              const parts = [
                labelText,
                placeholder,
                ariaLabel,
                name,
                id,
                inputType === 'password' ? 'secure-password' : '',
                innerText,
              ].filter(Boolean);

              const text = parts.join(' | ').slice(0, 70) || `${el.tagName.toLowerCase()}[${inputType}]`;

              interactiveNodes.push({
                id: currentId++,
                tag: el.tagName.toLowerCase(),
                text,
                bbox: {
                  x: Math.round(r.left + window.scrollX),
                  y: Math.round(r.top + window.scrollY),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                },
              });
            }
          });

          return {
            status: 'success',
            sensitiveBoxes,
            interactiveNodes,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
              devicePixelRatio: window.devicePixelRatio || 1,
            },
          };
        },
      });

      if (results && results[0]?.result) {
        return results[0].result as ScanDOMResponse;
      }
    } catch (e: any) {
      console.warn('Scripting scan notice:', e);
    }

    return {
      status: 'success',
      sensitiveBoxes: [],
      interactiveNodes: [],
      viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
    };
  };

  /**
   * Safe Action Dispatcher with React/Vue prototype setter compatibility
   */
  const executeActionOnTab = async (
    tabId: number,
    action: any
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, {
        action: 'EXECUTE_ACTION',
        payload: action,
      });
      if (res) return res;
    } catch {
      // Direct scripting fallback
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (act) => {
          try {
            const targetId = act.targetId !== undefined ? act.targetId : act.targetNodeId;

            // 1. SCROLL
            if (act.type === 'SCROLL') {
              const dist = act.distance || act.y || 400;
              window.scrollBy({ top: dist, left: 0, behavior: 'smooth' });
              return { success: true, message: `Scrolled viewport by ${dist}px` };
            }

            // 2. NAVIGATE
            if (act.type === 'NAVIGATE' && act.url) {
              window.location.href = act.url;
              return { success: true, message: `Navigating to ${act.url}` };
            }

            const INTERACTIVE = [
              'button',
              'a[href]',
              'input',
              'textarea',
              'select',
              'summary',
              '[role="button"]',
              '[role="link"]',
              '[role="checkbox"]',
              '[role="radio"]',
            ];
            const allInteractive = Array.from(
              document.querySelectorAll(INTERACTIVE.join(', '))
            ).filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            }) as HTMLElement[];

            // 3. TYPE
            if (act.type === 'TYPE' && targetId !== undefined) {
              const el = allInteractive[targetId] as HTMLInputElement | HTMLTextAreaElement | undefined;
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus();

                const textToType = act.text || '';

                // React/Vue setter bypass
                const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (valueSetter) {
                  valueSetter.call(el, textToType);
                } else {
                  el.value = textToType;
                }

                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));

                for (const char of textToType) {
                  el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                  el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
                  el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                }

                if (el.type === 'search' || el.name.toLowerCase().includes('q') || el.name.toLowerCase().includes('search')) {
                  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                }

                return { success: true, message: `Typed "${textToType}" into [${targetId}] <${el.tagName.toLowerCase()}>` };
              }
              return { success: false, message: `Input [${targetId}] not found` };
            }

            // 4. CLICK
            if (act.type === 'CLICK') {
              let el = targetId !== undefined ? allInteractive[targetId] : null;
              if (!el) {
                const buttons = allInteractive.filter((e) => e.tagName === 'BUTTON' || (e as HTMLInputElement).type === 'submit');
                if (buttons.length > 0) el = buttons[0];
              }

              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus();

                if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
                  el.checked = !el.checked;
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }

                el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                el.click();

                return { success: true, message: `Clicked element [${targetId ?? 0}] <${el.tagName.toLowerCase()}>` };
              }
            }

            // 5. DONE
            if (act.type === 'DONE') {
              return { success: true, message: 'Goal completed.' };
            }

            return { success: true, message: `Dispatched ${act.type}` };
          } catch (err: any) {
            return { success: false, message: err.message };
          }
        },
        args: [action],
      });

      if (results && results[0]?.result) {
        return results[0].result;
      }
    } catch (err: any) {
      return { success: false, message: `Direct error: ${err.message}` };
    }

    return { success: true, message: 'Action executed.' };
  };

  /**
   * Render canvas with PII blackouts and yellow ID badges
   */
  const renderRedactedCanvas = async (
    rawScreenshotUrl: string,
    sensitiveBoxes: BoundingBox[],
    interactiveNodes: NonSensitiveDOMNode[],
    viewport: { width: number; height: number; scrollX: number; scrollY: number }
  ): Promise<string> => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load screenshot'));
      img.src = rawScreenshotUrl;
    });

    const canvas = document.createElement('canvas');
    const width = img.naturalWidth || viewport.width || 1280;
    const height = img.naturalHeight || viewport.height || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);

    const scaleX = width / (viewport.width || 1);
    const scaleY = height / (viewport.height || 1);
    const scrollX = viewport.scrollX || 0;
    const scrollY = viewport.scrollY || 0;

    // 1. Black out all sensitive PII areas
    for (const box of sensitiveBoxes) {
      const rx = (box.x - scrollX) * scaleX;
      const ry = (box.y - scrollY) * scaleY;
      const rw = box.width * scaleX;
      const rh = box.height * scaleY;
      if (rw <= 0 || rh <= 0) continue;

      ctx.fillStyle = '#000000';
      ctx.fillRect(rx, ry, rw, rh);
      const fontSize = Math.max(11, Math.min(18, Math.floor(rh * 0.45)));
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('[MASKED PII]', rx + rw / 2, ry + rh / 2);
    }

    // 2. Yellow outlines & [ID] badges on interactive elements
    for (const node of interactiveNodes.slice(0, 30)) {
      const nx = (node.bbox.x - scrollX) * scaleX;
      const ny = (node.bbox.y - scrollY) * scaleY;
      const nw = node.bbox.width * scaleX;
      const nh = node.bbox.height * scaleY;
      if (nw <= 0 || nh <= 0) continue;

      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2;
      ctx.strokeRect(nx, ny, nw, nh);

      const badgeText = `[${node.id}]`;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const metrics = ctx.measureText(badgeText);
      const bx = Math.max(0, nx);
      const by = Math.max(0, ny - 18);

      ctx.fillStyle = '#eab308';
      ctx.fillRect(bx, by, metrics.width + 8, 18);
      ctx.fillStyle = '#000000';
      ctx.fillText(badgeText, bx + 4, by + 3);
    }

    return canvas.toDataURL('image/png');
  };

  /**
   * Main multi-step autonomous execution loop
   */
  const handleRunAgent = async () => {
    if (!userGoal.trim()) {
      addLog('Error: Please enter a command in the input box.');
      return;
    }

    const startTime = performance.now();
    setStatus('redacting');
    setCurrentStep(0);
    setTotalSteps(0);
    addLog(`━━━ Command: "${userGoal.trim()}" ━━━`);

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error('No active browser tab detected.');

      const tabId = activeTab.id;
      let stepsExecuted = 0;

      for (let step = 0; step < MAX_STEPS; step++) {
        setCurrentStep(step + 1);

        // 1. Capture tab
        let rawScreenshotUrl = '';
        try {
          rawScreenshotUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
        } catch {
          const swRes = await chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB' });
          if (swRes?.status === 'success' && swRes.dataUrl) {
            rawScreenshotUrl = swRes.dataUrl;
          } else {
            throw new Error('Unable to capture tab.');
          }
        }

        // 2. Scan DOM
        const scanResult = await scanDOMOnTab(tabId);
        const sensitiveBoxes = scanResult.sensitiveBoxes || [];
        const interactiveNodes = scanResult.interactiveNodes || [];
        const viewport = scanResult.viewport || {
          width: 1280, height: 720, scrollX: 0, scrollY: 0, devicePixelRatio: 1,
        };

        setInteractiveCount(interactiveNodes.length);

        // 3. Render masked frame
        setStatus('redacting');
        const sanitizedImage = await renderRedactedCanvas(
          rawScreenshotUrl, sensitiveBoxes, interactiveNodes, viewport
        );
        setSanitizedPreview(sanitizedImage);

        // 4. Send to Local VLM Server
        setStatus('sending');
        addLog(`[Step ${step + 1}] Processing local decision (step=${step})...`);

        const serverResponse = await chrome.runtime.sendMessage({
          action: 'SEND_TO_SERVER',
          payload: {
            image: sanitizedImage,
            domElements: interactiveNodes,
            userGoal: userGoal.trim(),
            stepIndex: step,
          },
        });

        if (serverResponse?.status !== 'success' || !serverResponse.agentResponse) {
          throw new Error(serverResponse?.error || 'Local server connection failed. Ensure python main.py is running.');
        }

        const actionToExecute = serverResponse.agentResponse.action || serverResponse.agentResponse;
        const actionType = (actionToExecute.type || 'CLICK').toUpperCase();
        const actionText = actionToExecute.text || '';

        addLog(`[Step ${step + 1}] Decision: ${actionType}${actionText ? ` "${actionText}"` : ''} → ${actionToExecute.explanation || ''}`);

        // 5. Check if goal is completed
        if (actionType === 'DONE') {
          addLog(`[Step ${step + 1}] ✅ Task completed!`);
          break;
        }

        // 6. Execute action on webpage
        setStatus('executing');
        const execResult = await executeActionOnTab(tabId, actionToExecute);
        addLog(`[Step ${step + 1}] ${execResult.success ? '✓' : '✗'} ${execResult.message}`);

        stepsExecuted = step + 1;
        setTotalSteps(stepsExecuted);

        // Short pause for webpage to respond
        await delay(STEP_DELAY_MS);
      }

      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setStatus('done');
      addLog(`━━━ Completed in ${stepsExecuted} steps (${elapsed}ms) ━━━`);

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      addLog(`Workflow failed: ${err.message}`);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'redacting':
        return { text: 'Redacting PII', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
      case 'sending':
        return { text: 'Local Reasoning', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)' };
      case 'executing':
        return { text: 'Executing Action', color: '#a855f7', bg: 'rgba(168,85,247,0.15)' };
      case 'done':
        return { text: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
      case 'error':
        return { text: 'Error', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)' };
      default:
        return { text: '100% Local Ready', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
    }
  };

  const statusBadge = getStatusBadge();
  const isBusy = status === 'redacting' || status === 'sending' || status === 'executing';

  return (
    <div
      style={{
        width: 460,
        minHeight: 580,
        maxHeight: 620,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        backgroundColor: '#090a0f',
        color: '#f1f5f9',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1e293b',
          paddingBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(59,130,246,0.2))',
              border: '1px solid rgba(6,182,212,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22d3ee',
            }}
          >
            <ShieldCheck size={18} />
          </div>
          <div>
            <h1
              style={{
                fontSize: 13, fontWeight: 700, margin: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                letterSpacing: '-0.02em',
              }}
            >
              ISRO Privacy Shield
              <span style={{
                fontSize: 9, padding: '2px 5px', borderRadius: 4,
                background: 'rgba(6,182,212,0.2)', color: '#67e8f9',
                fontFamily: "'JetBrains Mono', monospace",
              }}>PS 26171</span>
            </h1>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
              100% Local On-Device Browser Autopilot
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px',
          borderRadius: 6, background: statusBadge.bg,
          border: `1px solid ${statusBadge.color}40`,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusBadge.color }} />
          <span style={{
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            color: statusBadge.color, fontWeight: 600,
          }}>{statusBadge.text}</span>
        </div>
      </header>

      {/* Goal Input with Clear Button */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 5,
        background: 'rgba(22,27,41,0.7)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{
            fontSize: 10, color: '#94a3b8', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Sparkles size={11} style={{ color: '#38bdf8' }} /> Command / Instruction
          </label>
          {userGoal && (
            <button
              onClick={() => setUserGoal('')}
              style={{
                background: 'none', border: 'none', color: '#64748b',
                cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center',
              }}
              title="Clear command"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
        <textarea
          value={userGoal}
          onChange={(e) => setUserGoal(e.target.value)}
          placeholder="e.g. Enter username as tomsmith and enter password as SuperSecretPassword! and submit"
          rows={2}
          style={{
            width: '100%', background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(51,65,85,0.6)', borderRadius: 5,
            padding: '7px 9px', fontSize: 11, color: '#f8fafc',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            resize: 'none', outline: 'none', boxSizing: 'border-box',
          }}
        />

        {/* Preset Chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => setUserGoal(preset.text)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', borderRadius: 4,
                background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(51,65,85,0.5)',
                color: '#94a3b8', fontSize: 9, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {preset.icon} {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={handleRunAgent}
        disabled={isBusy}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '10px 14px', borderRadius: 8,
          fontWeight: 700, fontSize: 12, border: 'none',
          cursor: isBusy ? 'not-allowed' : 'pointer',
          background: isBusy ? '#334155' : 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
          color: '#ffffff',
          boxShadow: isBusy ? 'none' : '0 4px 14px rgba(6,182,212,0.25)',
          transition: 'all 0.2s ease',
        }}
      >
        {isBusy ? (
          <>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Executing Step {currentStep}...
          </>
        ) : (
          <>
            <Send size={14} />
            Execute Command
          </>
        )}
      </button>

      {/* Metrics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <div style={{
          background: 'rgba(22,27,41,0.7)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, padding: '5px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#94a3b8' }}>
            <Layers size={11} style={{ color: '#eab308' }} /> Elements
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#eab308', fontSize: 11 }}>
            {interactiveCount}
          </span>
        </div>

        <div style={{
          background: 'rgba(22,27,41,0.7)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, padding: '5px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#94a3b8' }}>
            <Activity size={11} style={{ color: '#10b981' }} /> Latency
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#10b981', fontSize: 11 }}>
            {latencyMs ? `${latencyMs}ms` : '--'}
          </span>
        </div>

        <div style={{
          background: 'rgba(22,27,41,0.7)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, padding: '5px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#94a3b8' }}>
            <RefreshCw size={11} style={{ color: '#a855f7' }} /> Steps
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#a855f7', fontSize: 11 }}>
            {totalSteps || '--'}
          </span>
        </div>
      </div>

      {/* Redacted Frame Preview */}
      <div style={{
        background: 'rgba(22,27,41,0.7)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 10, color: '#94a3b8', fontWeight: 600,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Lock size={11} style={{ color: '#ef4444' }} /> Redacted Frame Preview
          </span>
          {sanitizedPreview && (
            <span style={{ fontSize: 9, color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
              [MASKED PII ACTIVE]
            </span>
          )}
        </div>

        {sanitizedPreview ? (
          <div style={{
            borderRadius: 5, overflow: 'hidden', background: '#000',
            border: '1px solid rgba(51,65,85,0.8)', display: 'flex',
            justifyContent: 'center', maxHeight: 110,
          }}>
            <img src={sanitizedPreview} alt="Redacted Frame" style={{ maxHeight: 110, width: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{
            height: 60, borderRadius: 5, background: 'rgba(15,23,42,0.5)',
            border: '1px dashed rgba(51,65,85,0.6)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, color: '#64748b', fontSize: 10,
          }}>
            <EyeOff size={16} style={{ color: '#475569' }} />
            <span>Click "Execute Command" to run</span>
          </div>
        )}
      </div>

      {/* Terminal Log Stream */}
      <div style={{
        flex: 1, minHeight: 110, maxHeight: 135,
        background: '#05060a', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: 7, display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 9,
          color: '#64748b', fontFamily: "'JetBrains Mono', monospace",
          borderBottom: '1px solid rgba(30,41,59,0.8)', paddingBottom: 3,
        }}>
          <Terminal size={10} style={{ color: '#38bdf8' }} />
          <span>Execution Log Stream</span>
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        }}>
          {logs.map((log, idx) => (
            <div
              key={idx}
              style={{
                color: log.includes('Error') || log.includes('failed') || log.includes('✗')
                  ? '#f43f5e'
                  : log.includes('✅') || log.includes('completed') || log.includes('━━━')
                  ? '#10b981'
                  : log.includes('Decision') || log.includes('Step')
                  ? '#38bdf8'
                  : '#94a3b8',
                wordBreak: 'break-word',
              }}
            >
              {log}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 9, color: '#64748b', borderTop: '1px solid rgba(30,41,59,0.8)',
        paddingTop: 4, fontFamily: "'JetBrains Mono', monospace",
      }}>
        <span>Host: 127.0.0.1:8000</span>
        <span>100% On-Device</span>
      </footer>
    </div>
  );
};
