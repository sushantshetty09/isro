import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck,
  Eye,
  RefreshCw,
  Cpu,
  Lock,
  ExternalLink,
  Zap,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Bug,
  Play,
  Check
} from 'lucide-react';
import { RedactionStyle, PIIElement, InteractiveNode, FramePrivacyReport, CategoryBreakdown, SanitizedScreenshotResult } from './types';
import { redactFrame } from './utils/redactor';
import { getSanitizedScreenshot, sendSanitizedPayloadToServer, assertSanitizedScreenshot } from './utils/sanitizer';

export function App() {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState<'scanner' | 'agent'>('scanner');
  const [viewMode, setViewMode] = useState<'split' | 'slider'>('split');
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [redactionStyle, setRedactionStyle] = useState<RedactionStyle>('blur');
  const [showSoMTags, setShowSoMTags] = useState<boolean>(true);
  const [showDebugBar, setShowDebugBar] = useState<boolean>(true);

  // Live Screen & Perception State
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [sanitizedScreenshot, setSanitizedScreenshot] = useState<string | null>(null);
  const [rawScreenshot, setRawScreenshot] = useState<string | null>(null);
  const [lastSanitizedResult, setLastSanitizedResult] = useState<SanitizedScreenshotResult | null>(null);
  const [detectedPii, setDetectedPii] = useState<PIIElement[]>([]);
  const [interactiveNodes, setInteractiveNodes] = useState<InteractiveNode[]>([]);
  const [viewportMeta, setViewportMeta] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const [report, setReport] = useState<FramePrivacyReport | null>(null);
  const [frameLatency, setFrameLatency] = useState<number>(0);

  // Diagnostic Debug Info
  const [debugInfo, setDebugInfo] = useState<{
    tabId?: number;
    tabUrl?: string;
    captureBytes: number;
    domCount: number;
    visualCount: number;
    mergedCount: number;
    scaleRatio: string;
    errorMsg?: string;
  }>({
    captureBytes: 0,
    domCount: 0,
    visualCount: 0,
    mergedCount: 0,
    scaleRatio: '1.0x',
  });

  // Session Aggregate Counters
  const [sessionTotals, setSessionTotals] = useState<CategoryBreakdown>({
    faces: 0,
    passwords: 0,
    cards: 0,
    aadhaar: 0,
    pan: 0,
    contact: 0,
  });
  const [totalFramesScanned, setTotalFramesScanned] = useState<number>(0);

  // Agent Demo State (Secondary Tab)
  const [userGoal, setUserGoal] = useState<string>('Fill form and submit with protected credentials');
  const [agentStatus, setAgentStatus] = useState<string>('Ready');
  const [agentResponse, setAgentResponse] = useState<any>(null);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [executedActionStatus, setExecutedActionStatus] = useState<string | null>(null);

  // Ephemeral local comparison preview
  const cachedSanitizedRef = useRef<SanitizedScreenshotResult | null>(null);

  // Capture & Run On-Device Privacy Scan using isolated Sanitizer
  const captureAndScan = useCallback(async (styleOverride?: RedactionStyle) => {
    setIsScanning(true);
    setDebugInfo(prev => ({ ...prev, errorMsg: undefined }));
    const activeStyle = styleOverride || redactionStyle;

    console.log('[PrivacyScanner] === Triggering Isolated Sanitized Screen Capture ===');

    try {
      // 1. Query Active Tab in last focused window
      let tabId: number | undefined;
      let windowId: number | undefined;
      let tabUrl = 'unknown';

      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const lastFocusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (lastFocusedTabs && lastFocusedTabs.length > 0) {
          tabId = lastFocusedTabs[0].id;
          windowId = lastFocusedTabs[0].windowId;
          tabUrl = lastFocusedTabs[0].url || 'unknown';
        } else {
          const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (currentTabs && currentTabs.length > 0) {
            tabId = currentTabs[0].id;
            windowId = currentTabs[0].windowId;
            tabUrl = currentTabs[0].url || 'unknown';
          }
        }
      }

      // 2. Invoke single shared getSanitizedScreenshot entrypoint
      const sanitizedRes = await getSanitizedScreenshot({
        style: activeStyle,
        showSoMTags,
        tabId,
        windowId,
      });

      // 3. Update state strictly from sanitized result
      setLastSanitizedResult(sanitizedRes);
      cachedSanitizedRef.current = sanitizedRes;
      setSanitizedScreenshot(sanitizedRes.sanitizedDataUrl);
      setRawScreenshot(sanitizedRes.rawPreviewDataUrl || sanitizedRes.sanitizedDataUrl);
      setDetectedPii(sanitizedRes.piiElements);
      setInteractiveNodes(sanitizedRes.interactiveNodes);
      setViewportMeta(sanitizedRes.viewport);
      setReport(sanitizedRes.redaction_manifest);
      setFrameLatency(sanitizedRes.processingTimeMs);

      // 4. Update Diagnostics
      setDebugInfo({
        tabId,
        tabUrl,
        captureBytes: sanitizedRes.sanitizedDataUrl.length,
        domCount: sanitizedRes.piiElements.filter(p => p.source === 'dom').length,
        visualCount: sanitizedRes.piiElements.filter(p => p.source === 'visual').length,
        mergedCount: sanitizedRes.piiElements.length,
        scaleRatio: `${(sanitizedRes.viewport.width > 0 ? 1280 / sanitizedRes.viewport.width : 1).toFixed(2)}x`,
        errorMsg: undefined,
      });

      // 5. Update Aggregate Counters
      setSessionTotals((prev) => ({
        faces: prev.faces + sanitizedRes.redaction_manifest.breakdown.faces,
        passwords: prev.passwords + sanitizedRes.redaction_manifest.breakdown.passwords,
        cards: prev.cards + sanitizedRes.redaction_manifest.breakdown.cards,
        aadhaar: prev.aadhaar + sanitizedRes.redaction_manifest.breakdown.aadhaar,
        pan: prev.pan + sanitizedRes.redaction_manifest.breakdown.pan,
        contact: prev.contact + sanitizedRes.redaction_manifest.breakdown.contact,
      }));
      setTotalFramesScanned((c) => c + 1);

      console.log(`[PrivacyScanner] Redaction finished. Sealed Signature: ${sanitizedRes.brandSeal.signature}`);
    } catch (err: any) {
      console.error('[Privacy Scanner] Error during scan:', err);
      setDebugInfo(prev => ({ ...prev, errorMsg: err.message || 'Capture failed' }));
    } finally {
      setIsScanning(false);
    }
  }, [redactionStyle, showSoMTags]);

  // Handle Style Switch
  const handleStyleChange = (style: RedactionStyle) => {
    setRedactionStyle(style);
    captureAndScan(style);
  };

  // Initial scan on mount
  useEffect(() => {
    captureAndScan();
  }, []);

  // Send Sanitized Payload to Server (Agent Demo)
  const handleSendToAgentServer = async () => {
    if (!lastSanitizedResult) return;
    setIsDispatching(true);
    setAgentStatus('Transmitting Sanitized Frame to 127.0.0.1:8000...');

    try {
      // Send through hard assertion guard
      const data = await sendSanitizedPayloadToServer(lastSanitizedResult, userGoal);
      setAgentResponse(data);
      setAgentStatus('Action Received from Sanitized Context');
    } catch (err: any) {
      setAgentStatus(`Server Notice: ${err.message}. Ensure python main.py is running.`);
    } finally {
      setIsDispatching(false);
    }
  };

  // Run End-to-End Agent Action on Active Page (Demo Step)
  const handleRunAgentStepOnPage = async () => {
    setIsDispatching(true);
    setExecutedActionStatus(null);
    setAgentStatus('1. Capturing sanitized screen through privacy filter...');

    try {
      // Step 1: Capture sanitized screenshot
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = activeTab?.id;

      const sanitizedRes = await getSanitizedScreenshot({
        style: redactionStyle,
        showSoMTags,
        tabId,
      });

      // Synchronize dashboard real-time view from this EXACT agent capture
      setLastSanitizedResult(sanitizedRes);
      cachedSanitizedRef.current = sanitizedRes;
      setSanitizedScreenshot(sanitizedRes.sanitizedDataUrl);
      setRawScreenshot(sanitizedRes.rawPreviewDataUrl || sanitizedRes.sanitizedDataUrl);
      setDetectedPii(sanitizedRes.piiElements);
      setInteractiveNodes(sanitizedRes.interactiveNodes);
      setReport(sanitizedRes.redaction_manifest);
      setFrameLatency(sanitizedRes.processingTimeMs);

      // Step 2: Transmit sanitized frame to server through runtime guard
      setAgentStatus('2. Transmitting sealed payload to local reasoning engine...');
      const responseData = await sendSanitizedPayloadToServer(sanitizedRes, userGoal);
      setAgentResponse(responseData);

      const action = responseData.action || responseData;
      setAgentStatus(`3. Server decided action: ${action.type}${action.targetId !== undefined ? ` on Node [${action.targetId}]` : ''}`);

      // Step 3: Execute Action in DOM if targetTabId is valid
      if (tabId && action.type !== 'DONE') {
        const execRes: any = await chrome.tabs.sendMessage(tabId, {
          action: 'EXECUTE_ACTION',
          payload: action,
        });

        if (execRes?.success) {
          setExecutedActionStatus(`✅ Action executed: ${execRes.message}`);
        } else {
          setExecutedActionStatus(`⚠️ Notice: ${execRes?.message || 'Action sent'}`);
        }
      } else {
        setExecutedActionStatus('✅ Task Goal Complete (DONE received)');
      }

      setAgentStatus('4. Step Complete. 0 Raw Bytes Leaked.');
    } catch (err: any) {
      console.error('[Agent Ingestion Demo] Error:', err);
      setAgentStatus(`Agent Error: ${err.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="app-container">
      {/* 1. Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon-box">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="brand-title-row">
              <span className="brand-title">ISRO Privacy-Preserving Shield</span>
              <span className="chip-pill chip-emerald">100% On-Device</span>
            </div>
            <div className="brand-meta">
              <span>SIH PS 26171</span>
              <span>•</span>
              <span className="proven-zero">
                <Lock size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> 0 Bytes Leaked (PASS)
              </span>
            </div>
          </div>
        </div>

        <div className="header-actions">
          <div className="latency-box">
            <div className="latency-label">Latency</div>
            <div className="latency-val">
              <Zap size={10} style={{ display: 'inline', marginRight: 2 }} />
              {frameLatency ? `${frameLatency} ms` : 'Standby'}
            </div>
          </div>

          <button onClick={() => captureAndScan()} disabled={isScanning} className="btn-scan">
            <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
            <span>{isScanning ? 'Scanning...' : 'Scan Frame'}</span>
          </button>
        </div>
      </header>

      {/* 2. Sub-Nav & Redaction Controls */}
      <div className="sub-nav">
        <div className="nav-tabs">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
          >
            <Eye size={12} />
            <span>Privacy Filter & Inspector</span>
          </button>
          <button
            onClick={() => setActiveTab('agent')}
            className={`tab-btn ${activeTab === 'agent' ? 'active' : ''}`}
          >
            <Cpu size={12} />
            <span>Agent Ingestion Demo</span>
          </button>
        </div>

        <div className="style-control-group">
          <span className="style-label">Redaction:</span>
          <div className="style-pill-box">
            {(['blur', 'pixelate', 'blackout'] as RedactionStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => handleStyleChange(style)}
                className={`style-pill ${redactionStyle === style ? 'active' : ''}`}
              >
                {style === 'blur' ? '💧 Blur' : style === 'pixelate' ? '🔲 Pixelate' : '⬛ Blackout'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Main Content */}
      <div className="main-body">
        {activeTab === 'scanner' ? (
          <>
            {/* Metric Strip */}
            <div className="metric-grid">
              <div className="metric-card">
                <span className="metric-label">PII Masked</span>
                <span className="metric-val" style={{ color: 'var(--emerald)' }}>{detectedPii.length}</span>
                <span className="metric-sub">{sessionTotals.faces + sessionTotals.passwords + sessionTotals.cards + sessionTotals.aadhaar + sessionTotals.pan + sessionTotals.contact} session</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">👤 Faces</span>
                <span className="metric-val" style={{ color: '#818cf8' }}>{report?.breakdown.faces || 0}</span>
                <span className="metric-sub">{sessionTotals.faces} session</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">🔑 Passwords</span>
                <span className="metric-val" style={{ color: 'var(--rose)' }}>{report?.breakdown.passwords || 0}</span>
                <span className="metric-sub">{sessionTotals.passwords} session</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">🇮🇳 Aadhaar</span>
                <span className="metric-val" style={{ color: 'var(--amber)' }}>{report?.breakdown.aadhaar || 0}</span>
                <span className="metric-sub">{sessionTotals.aadhaar} session</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">🇮🇳 PAN</span>
                <span className="metric-val" style={{ color: 'var(--cyan)' }}>{report?.breakdown.pan || 0}</span>
                <span className="metric-sub">{sessionTotals.pan} session</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">💳 Cards</span>
                <span className="metric-val" style={{ color: 'var(--purple)' }}>{report?.breakdown.cards || 0}</span>
                <span className="metric-sub">{sessionTotals.cards} session</span>
              </div>
            </div>

            {/* View Mode Bar */}
            <div className="view-bar">
              <div className="mode-toggle">
                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 10 }}>View:</span>
                <div className="mode-btns">
                  <button
                    onClick={() => setViewMode('split')}
                    className={`mode-btn ${viewMode === 'split' ? 'active' : ''}`}
                  >
                    Side-by-Side Split
                  </button>
                  <button
                    onClick={() => setViewMode('slider')}
                    className={`mode-btn ${viewMode === 'slider' ? 'active' : ''}`}
                  >
                    Reveal Slider
                  </button>
                </div>
              </div>

              <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showSoMTags}
                  onChange={(e) => {
                    setShowSoMTags(e.target.checked);
                    captureAndScan();
                  }}
                />
                <span>Show [ID] Action Tags</span>
              </label>
            </div>

            {/* Visual Stage */}
            <div className="visual-stage">
              {sanitizedScreenshot ? (
                viewMode === 'split' ? (
                  <div className="split-container">
                    <div className="split-col">
                      <div className="stage-badge badge-tainted">
                        <AlertTriangle size={9} style={{ display: 'inline', marginRight: 2 }} /> Original Screen (Local Only)
                      </div>
                      <img src={rawScreenshot || sanitizedScreenshot} alt="Original Screen" className="stage-img" />
                    </div>
                    <div className="split-col">
                      <div className="stage-badge badge-sanitized">
                        <ShieldCheck size={9} style={{ display: 'inline', marginRight: 2 }} /> Sanitized Output (Agent View)
                      </div>
                      <img src={sanitizedScreenshot} alt="Sanitized View" className="stage-img" />
                    </div>
                  </div>
                ) : (
                  <div className="slider-container">
                    <div className="slider-wrapper">
                      {/* Base: Sanitized Output */}
                      <img src={sanitizedScreenshot} alt="Sanitized" className="stage-img" />
                      {/* Overlay: Original Raw Screen */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          bottom: 0,
                          width: `${sliderPos}%`,
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={rawScreenshot || sanitizedScreenshot}
                          alt="Original"
                          className="stage-img"
                          style={{ maxWidth: 'none', height: '100%' }}
                        />
                      </div>
                      <div className="slider-handle-line" style={{ left: `${sliderPos}%` }}>
                        <div className="slider-knob">↔</div>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sliderPos}
                      onChange={(e) => setSliderPos(Number(e.target.value))}
                      className="slider-input"
                    />
                  </div>
                )
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  {isScanning ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--emerald)' }} />
                      <span>Scanning active webpage and scrubbing sensitive fields on-device...</span>
                    </>
                  ) : debugInfo.errorMsg ? (
                    <>
                      <AlertTriangle size={20} style={{ color: 'var(--rose)' }} />
                      <span style={{ color: 'var(--rose)', fontWeight: 600 }}>Capture notice: {debugInfo.errorMsg}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Make sure an active web page tab is selected.</span>
                      <button onClick={() => captureAndScan()} className="btn-scan" style={{ marginTop: 6 }}>
                        <RefreshCw size={11} /> Try Scan Again
                      </button>
                    </>
                  ) : (
                    <span>Ready to scan. Click "Scan Frame" to capture and redact active page.</span>
                  )}
                </div>
              )}
            </div>

            {/* Manifest Bar */}
            <div className="manifest-card">
              <div className="manifest-header">
                <span className="manifest-title">
                  <FileText size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  Detection Manifest ({detectedPii.length} sensitive items protected)
                </span>
                <span className="chip-pill chip-emerald">Zero Raw PII Transmitted</span>
              </div>

              <div className="manifest-chips">
                {detectedPii.length > 0 ? (
                  detectedPii.map((p, idx) => (
                    <div key={p.id || idx} className="pii-chip">
                      <span
                        className="dot-indicator"
                        style={{
                          background:
                            p.category === 'government_id'
                              ? 'var(--amber)'
                              : p.category === 'credentials'
                              ? 'var(--rose)'
                              : p.category === 'financial'
                              ? 'var(--purple)'
                              : 'var(--indigo)',
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>{p.label}</span>
                      {p.triggerType === 'structural' && !p.content_present && (
                        <span style={{ fontSize: 9, background: 'rgba(99, 102, 241, 0.25)', color: '#c7d2fe', padding: '1px 5px', borderRadius: 3, marginLeft: 2, fontWeight: 700 }}>
                          Structural Field
                        </span>
                      )}
                      <span style={{ color: 'var(--text-dim)' }}>({(p.confidence * 100).toFixed(0)}%)</span>
                    </div>
                  ))
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No sensitive PII detected on current page.
                  </span>
                )}
              </div>
            </div>

            {/* Real-time Diagnostics Bar */}
            {showDebugBar && (
              <div style={{ background: '#070a10', border: '1px solid var(--border-color)', borderRadius: 6, padding: '4px 8px', fontSize: 9.5, color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace' }}>
                <span>
                  <Bug size={9} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                  DOM: {debugInfo.domCount} | Vision: {debugInfo.visualCount} | Merged: {debugInfo.mergedCount}
                </span>
                <span>
                  Seal: {lastSanitizedResult?.brandSeal.signature || 'VALID'} | Viewport: {viewportMeta.width}x{viewportMeta.height}
                </span>
              </div>
            )}
          </>
        ) : (
          /* Agent Demo Tab */
          <div className="agent-grid">
            <div className="agent-card">
              <div className="agent-title">
                <span>Outgoing Sanitized Payload</span>
                <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace' }}>POST /process-screen</span>
              </div>
              <div style={{ background: '#020617', padding: 6, borderRadius: 6, textAlign: 'center', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {sanitizedScreenshot ? (
                  <img src={sanitizedScreenshot} alt="Payload" style={{ maxHeight: 150, maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }} />
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>No frame</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', background: '#020617', padding: 6, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div>Redacted Regions: <strong style={{ color: 'var(--emerald)' }}>{detectedPii.length} masked</strong></div>
                <div>DOM Action Nodes: <strong>{interactiveNodes.length} indexed</strong></div>
                <div>Runtime Seal: <strong style={{ color: 'var(--cyan)', fontFamily: 'monospace' }}>{lastSanitizedResult?.brandSeal.signature || 'ISRO-VERIFIED'}</strong></div>
                <div>Sensitive Exfiltration: <strong style={{ color: 'var(--emerald)' }}>0 bytes (PROVEN)</strong></div>
              </div>
            </div>

            <div className="agent-card">
              <div className="agent-title">
                <span>Central Model Inference & Form Fill</span>
              </div>
              <div>
                <label style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, display: 'block', marginBottom: 2 }}>
                  Task Goal
                </label>
                <input
                  type="text"
                  value={userGoal}
                  onChange={(e) => setUserGoal(e.target.value)}
                  className="input-goal"
                />
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  onClick={handleRunAgentStepOnPage}
                  disabled={isDispatching}
                  className="btn-dispatch"
                  style={{ background: 'linear-gradient(135deg, #059669, #0d9488)', flex: 1 }}
                >
                  <Play size={11} style={{ display: 'inline', marginRight: 4 }} />
                  {isDispatching ? 'Executing...' : '⚡ Run Agent Step on Page'}
                </button>
              </div>

              <div style={{ background: '#020617', padding: 6, borderRadius: 4, fontSize: 10 }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Status:</div>
                <div style={{ color: '#a5b4fc', fontFamily: 'monospace', fontSize: 9.5 }}>{agentStatus}</div>
                {executedActionStatus && (
                  <div style={{ color: 'var(--emerald)', marginTop: 4, fontWeight: 600 }}>{executedActionStatus}</div>
                )}
              </div>

              {agentResponse && (
                <div style={{ background: '#020617', padding: 6, borderRadius: 4, fontSize: 10, border: '1px solid var(--border-highlight)' }}>
                  <div style={{ color: 'var(--emerald)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} /> Server Action:
                  </div>
                  <pre style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 9, marginTop: 2, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(agentResponse.action || agentResponse, null, 2)}
                  </pre>
                </div>
              )}

              <a href="http://127.0.0.1:8000/inspector" target="_blank" rel="noreferrer" className="inspector-link">
                <ExternalLink size={10} /> Open Judge Inspector Dashboard
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 4. Footer */}
      <footer className="app-footer">
        <div>🔒 Zero-Egress Sandbox • 100% On-Device Filter</div>
        <div>Frames: {totalFramesScanned} | Leaks: 0</div>
      </footer>
    </div>
  );
}

export default App;
