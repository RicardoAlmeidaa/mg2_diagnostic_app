import React, { useRef, useState, useEffect } from 'react';
import Webcam from "react-webcam";
import { autoDetectROI, rgbToLab } from './autoROI';
import './App.css';

const HISTORY_KEY = 'mg2_diagnostic_history';

function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [roiPos, setRoiPos] = useState({ x: 110, y: 80 });
  const [roiSize, setRoiSize] = useState(80);
  const [roiImg, setRoiImg] = useState(null);
  const [labValues, setLabValues] = useState(null);
  const [blankLab, setBlankLab] = useState(null);
  const [sourceImg, setSourceImg] = useState(null);
  const [facingMode, setFacingMode] = useState("environment");
  const [autoDetectMsg, setAutoDetectMsg] = useState(null);
  const [showManualControls, setShowManualControls] = useState(false);

  const [view, setView] = useState('diagnostico'); // 'diagnostico' | 'historico'
  const [history, setHistory] = useState([]);

  const colors = {
    bg: '#13181e',
    border: '#202a34',
    teal: '#0d9488',
    tealBright: '#00f5d4',
    pink: '#e05a8f',
    textMuted: '#8f9ca6',
    white: '#ffffff',
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    cardTextMuted: '#475569',
    cardTextDark: '#0f172a',
    metricBg: '#f8fafc',
    pillBg: '#f0fdfa',
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) {
      console.error('Erro ao carregar histórico:', e);
    }
  }, []);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === "user" ? "environment" : "user"));
  };

  const capturePhoto = () => {
    const screenshot = webcamRef.current && webcamRef.current.getScreenshot();
    if (screenshot) setSourceImg(screenshot);
  };

  // Extrai a cor média dentro de um círculo (centro cx,cy raio r) numa imagem já carregada
  const extractCircleLab = (image, cx, cy, radius) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const diameter = radius * 2;

    canvas.width = diameter;
    canvas.height = diameter;
    ctx.drawImage(image, cx - radius, cy - radius, diameter, diameter, 0, 0, diameter, diameter);

    const imageData = ctx.getImageData(0, 0, diameter, diameter).data;
    let r = 0, g = 0, b = 0, count = 0;
    const rcx = radius, rcy = radius;

    for (let py = 0; py < diameter; py++) {
      for (let px = 0; px < diameter; px++) {
        if ((px - rcx) ** 2 + (py - rcy) ** 2 <= radius * radius) {
          const i = (py * diameter + px) * 4;
          r += imageData[i]; g += imageData[i + 1]; b += imageData[i + 2];
          count++;
        }
      }
    }
    if (count === 0) return null;

    const lab = rgbToLab(r / count, g / count, b / count);
    return { lab, dataUrl: canvas.toDataURL('image/jpeg') };
  };

  // ---- AUTO: só tenta deteção automática (Otsu + K-means + blob circular) ----
  const autoCapture = (isBlank = false) => {
    const imageSrc = sourceImg || (webcamRef.current && webcamRef.current.getScreenshot());
    if (!imageSrc) return;

    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const detectWidth = 240;
      const detectHeight = Math.round(image.height * (detectWidth / image.width));
      canvas.width = detectWidth;
      canvas.height = detectHeight;
      ctx.drawImage(image, 0, 0, detectWidth, detectHeight);

      const circle = autoDetectROI(ctx, detectWidth, detectHeight);

      if (!circle) {
        setAutoDetectMsg('Não foi possível detetar o chip automaticamente. Usa os controlos manuais abaixo.');
        setShowManualControls(true);
        return;
      }

      setAutoDetectMsg(null);
      const scale = image.width / detectWidth;
      const realX = circle.centerX * scale;
      const realY = circle.centerY * scale;
      const realRadius = circle.radius * scale;

      setRoiPos({ x: realX - realRadius, y: realY - realRadius });
      setRoiSize(realRadius * 2);

      const result = extractCircleLab(image, realX, realY, realRadius);
      if (!result) return;

      if (isBlank) setBlankLab(result.lab);
      else setLabValues(result.lab);
      setRoiImg(result.dataUrl);
    };
  };

  // ---- MANUAL: usa sempre o roiPos/roiSize atual (círculo posicionado à mão) ----
  const manualCapture = (isBlank = false) => {
    const imageSrc = sourceImg || (webcamRef.current && webcamRef.current.getScreenshot());
    if (!imageSrc) return;

    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const video = webcamRef.current?.video;
      const sX = image.width / (sourceImg ? image.width : (video?.clientWidth || image.width));
      const sY = image.height / (sourceImg ? image.height : (video?.clientHeight || image.height));

      const realX = (roiPos.x + roiSize / 2) * sX;
      const realY = (roiPos.y + roiSize / 2) * sY;
      const realRadius = (roiSize / 2) * sX;

      const result = extractCircleLab(image, realX, realY, realRadius);
      if (!result) return;

      if (isBlank) setBlankLab(result.lab);
      else setLabValues(result.lab);
      setRoiImg(result.dataUrl);
    };
  };

  const deltaE = blankLab && labValues
    ? Math.sqrt(
        Math.pow(labValues.L - blankLab.L, 2) +
        Math.pow(labValues.a - blankLab.a, 2) +
        Math.pow(labValues.b - blankLab.b, 2)
      )
    : null;

  const saveToHistory = () => {
    if (!labValues || deltaE === null) return;

    const now = new Date();
    const entry = {
      id: now.getTime(),
      date: now.toLocaleDateString('pt-PT'),
      time: now.toLocaleTimeString('pt-PT'),
      L: labValues.L,
      a: labValues.a,
      b: labValues.b,
      deltaE: deltaE,
      concentration: null,
    };

    const updated = [entry, ...history];
    setHistory(updated);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Erro ao guardar histórico:', e);
    }
  };

  const deleteHistoryEntry = (id) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Erro ao atualizar histórico:', e);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (e) {
      console.error('Erro ao limpar histórico:', e);
    }
  };

  const exportCSV = () => {
    if (history.length === 0) return;
    const header = 'Data,Hora,L,a,b,DeltaE,Concentracao_mM\n';
    const rows = history.map(h =>
      `${h.date},${h.time},${h.L.toFixed(2)},${h.a.toFixed(2)},${h.b.toFixed(2)},${h.deltaE.toFixed(2)},${h.concentration ?? ''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico_mg2_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const RoundIconButton = ({ onClick, children, style }) => (
    <button
      onClick={onClick}
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '18px',
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.white,
        fontSize: '14px',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );

  const ActionButton = ({ onClick, children, primary, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? colors.teal : colors.bg,
        border: primary ? 'none' : `1px solid ${colors.border}`,
        borderRadius: '8px',
        height: '42px',
        minWidth: '100px',
        padding: '0 12px',
        color: colors.white,
        fontWeight: primary ? 700 : 600,
        fontSize: '13px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        flex: '1 1 auto',
      }}
    >
      {children}
    </button>
  );

  const MetricCard = ({ label, value }) => (
    <div style={{
      background: colors.metricBg,
      border: `1px solid ${colors.cardBorder}`,
      borderRadius: '6px',
      padding: '5px 8px',
      flex: 1,
      minWidth: 0,
    }}>
      <p style={{ margin: 0, fontSize: '11px', color: colors.cardTextMuted, fontWeight: 500 }}>{label}</p>
      <p style={{ margin: 0, fontSize: '14px', color: colors.cardTextDark, fontWeight: 600, fontFamily: 'monospace' }}>{value}</p>
    </div>
  );

  const NavTabs = () => (
    <div style={{
      display: 'flex', gap: '4px', background: colors.bg,
      border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '4px', marginBottom: '4px',
    }}>
      {[
        { key: 'diagnostico', label: 'Diagnóstico' },
        { key: 'historico', label: `Histórico (${history.length})` },
      ].map(tab => (
        <button
          key={tab.key}
          onClick={() => setView(tab.key)}
          style={{
            flex: 1,
            background: view === tab.key ? colors.teal : 'transparent',
            color: colors.white,
            border: 'none',
            borderRadius: '7px',
            padding: '8px 0',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{
      background: colors.bg,
      minHeight: '100vh',
      borderRadius: '24px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Geist', system-ui, sans-serif",
      color: colors.white,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px 8px' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '18px', color: colors.teal }}>
          Mg²⁺ Diagnostic Platform
        </p>
      </div>

      <div style={{ padding: '0 24px' }}>
        <NavTabs />
      </div>

      {view === 'diagnostico' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 24px 24px' }}>

          <div style={{ position: 'relative', width: '100%', height: '204px', borderRadius: '20px', overflow: 'hidden', background: '#000' }}>
            {sourceImg ? (
              <img src={sourceImg} alt="Source" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}

            <div style={{
              position: 'absolute',
              top: `${roiPos.y}px`,
              left: `${roiPos.x}px`,
              width: `${roiSize}px`,
              height: `${roiSize}px`,
              border: `2px solid ${colors.tealBright}`,
              borderRadius: '50%',
              pointerEvents: 'none',
              boxShadow: '0 0 12px rgba(0,245,212,0.3)',
            }} />

            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors.tealBright }} />
                <span style={{ fontSize: '11px', fontWeight: 600, color: colors.tealBright, fontFamily: 'monospace' }}>
                  {sourceImg ? 'FROZEN FRAME' : 'LIVE SCAN'}
                </span>
              </div>
            </div>
          </div>

          {autoDetectMsg && (
            <div style={{
              background: 'rgba(224,90,143,0.12)', border: `1px solid ${colors.pink}`,
              borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: colors.pink,
            }}>
              {autoDetectMsg}
            </div>
          )}

          {/* Botões automáticos — sempre visíveis */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            <ActionButton onClick={() => autoCapture(true)}>Auto Set Blank</ActionButton>
            <ActionButton onClick={() => autoCapture(false)} primary>Auto Measure</ActionButton>
          </div>

          {/* Controlos manuais — só aparecem depois de uma falha na deteção automática */}
          {showManualControls && (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase' }}>
                Controlos Manuais
              </p>
              <div style={{
                background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '8px',
                height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px',
              }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <RoundIconButton onClick={() => setRoiPos(p => ({ ...p, x: p.x - 5 }))}>←</RoundIconButton>
                  <RoundIconButton onClick={() => setRoiPos(p => ({ ...p, y: p.y - 5 }))}>↑</RoundIconButton>
                  <RoundIconButton onClick={() => setRoiPos(p => ({ ...p, y: p.y + 5 }))}>↓</RoundIconButton>
                  <RoundIconButton onClick={() => setRoiPos(p => ({ ...p, x: p.x + 5 }))}>→</RoundIconButton>
                </div>
                <div style={{ width: '1px', height: '24px', background: colors.border }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <RoundIconButton onClick={() => setRoiSize(s => s - 5)}>−</RoundIconButton>
                  <span style={{ fontSize: '13px', color: colors.textMuted, fontFamily: 'monospace' }}>SCALE</span>
                  <RoundIconButton onClick={() => setRoiSize(s => s + 5)}>+</RoundIconButton>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
                <ActionButton onClick={() => manualCapture(true)}>Manual Set Blank</ActionButton>
                <ActionButton onClick={() => manualCapture(false)} primary>Manual Measure</ActionButton>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            <ActionButton onClick={() => setSourceImg(null)}>Camera</ActionButton>
            <ActionButton onClick={() => fileInputRef.current.click()}>Gallery</ActionButton>
            <ActionButton onClick={capturePhoto}>Capture Photo</ActionButton>
            <ActionButton onClick={toggleCamera}>
              Trocar ({facingMode === 'user' ? 'Frontal' : 'Traseira'})
            </ActionButton>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const r = new FileReader();
                  r.onload = (ev) => setSourceImg(ev.target.result);
                  r.readAsDataURL(file);
                }
              }}
              accept="image/*"
              style={{ display: 'none' }}
            />
          </div>

          {(labValues || blankLab) && (
            <div style={{
              background: colors.cardBg,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: '20px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              {blankLab && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: colors.cardTextMuted, fontWeight: 600 }}>REFERENCE (BLANK):</span>
                  <span style={{ fontSize: '12px', color: colors.cardTextDark, fontFamily: 'monospace' }}>
                    L*: {blankLab.L.toFixed(2)} | a*: {blankLab.a.toFixed(2)} | b*: {blankLab.b.toFixed(2)}
                  </span>
                </div>
              )}

              {labValues && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {roiImg && <img src={roiImg} alt="ROI" style={{ width: '32px', borderRadius: '50%', border: `1px solid ${colors.teal}` }} />}
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: colors.cardTextDark }}>
                        Colorimetric Analysis
                      </p>
                    </div>
                    {deltaE !== null && (
                      <div style={{
                        background: colors.pillBg, borderRadius: '100px', padding: '6px 12px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: colors.teal }} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: colors.teal, fontFamily: 'monospace' }}>
                          ΔE {deltaE.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <MetricCard label="L* (Luminance)" value={labValues.L.toFixed(1)} />
                    <MetricCard label={labValues.a >= 0 ? 'a* (Redness)' : 'a* (Greenness)'} value={labValues.a.toFixed(1)} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <MetricCard label={labValues.b >= 0 ? 'b* (Yellowness)' : 'b* (Blueness)'} value={labValues.b.toFixed(1)} />
                    {deltaE !== null && <MetricCard label="ΔEab (Total Delta)" value={deltaE.toFixed(2)} />}
                  </div>

                  <ActionButton onClick={saveToHistory} primary disabled={deltaE === null}>
                    💾 Guardar no Histórico
                  </ActionButton>
                </>
              )}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: colors.textMuted }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th align="left" style={{ padding: '4px 0' }}>Eixo</th>
                <th align="left" style={{ padding: '4px 0' }}>Significado Colorimétrico</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>L*</strong></td><td>Luminosidade (0: Preto ↔ 100: Branco)</td></tr>
              <tr><td><strong>a*</strong></td><td>Verde (-) ↔ Vermelho (+)</td></tr>
              <tr><td><strong>b*</strong></td><td>Azul (-) ↔ Amarelo (+)</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {view === 'historico' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 24px 24px' }}>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <ActionButton onClick={exportCSV} disabled={history.length === 0}>Exportar CSV</ActionButton>
            <ActionButton onClick={clearHistory} disabled={history.length === 0}>Limpar Tudo</ActionButton>
          </div>

          {history.length === 0 ? (
            <div style={{
              border: `1px dashed ${colors.border}`, borderRadius: '16px', padding: '32px 16px',
              textAlign: 'center', color: colors.textMuted, fontSize: '13px',
            }}>
              Ainda não há medições guardadas.<br />
              Faz uma medição no Diagnóstico e clica em "Guardar no Histórico".
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {history.map(entry => (
                <div key={entry.id} style={{
                  background: colors.cardBg, border: `1px solid ${colors.cardBorder}`,
                  borderRadius: '14px', padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '12px', color: colors.cardTextMuted, fontWeight: 600 }}>
                        {entry.date} · {entry.time}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '16px', color: colors.cardTextDark, fontWeight: 700 }}>
                        {entry.concentration !== null ? `${entry.concentration} mM` : 'Concentração: —'}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteHistoryEntry(entry.id)}
                      style={{ background: 'none', border: 'none', color: colors.pink, fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
                    >
                      Apagar
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <MetricCard label="L*" value={entry.L.toFixed(1)} />
                    <MetricCard label="a*" value={entry.a.toFixed(1)} />
                    <MetricCard label="b*" value={entry.b.toFixed(1)} />
                    <MetricCard label="ΔEab" value={entry.deltaE.toFixed(2)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default App;