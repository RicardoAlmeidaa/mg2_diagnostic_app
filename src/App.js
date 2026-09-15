import React, { useRef, useState } from 'react';
import Webcam from "react-webcam";
import './App.css';

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

  // ---- Design tokens (Figma) ----
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

  const rgbToLab = (r, g, b) => {
    let [nr, ng, nb] = [r / 255, g / 255, b / 255].map(v =>
      v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92
    );
    let x = (nr * 0.4124 + ng * 0.3576 + nb * 0.1805) * 100;
    let y = (nr * 0.2126 + ng * 0.7152 + nb * 0.0722) * 100;
    let z = (nr * 0.0193 + ng * 0.1192 + nb * 0.9505) * 100;
    const f = (t) => t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + (16 / 116);
    return {
      L: parseFloat((116 * f(y / 100)) - 16),
      a: parseFloat(500 * (f(x / 95.047) - f(y / 100))),
      b: parseFloat(200 * (f(y / 100) - f(z / 108.883)))
    };
  };

  const toggleCamera = () => {
    setFacingMode(prev => (prev === "user" ? "environment" : "user"));
  };

  const capturePhoto = () => {
    const screenshot = webcamRef.current && webcamRef.current.getScreenshot();
    if (screenshot) setSourceImg(screenshot);
  };

  const captureAndMeasure = (isBlank = false) => {
    const video = webcamRef.current?.video;
    const imageSrc = sourceImg || (webcamRef.current && webcamRef.current.getScreenshot());
    if (!imageSrc) return;

    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let sX = image.width / (sourceImg ? image.width : video.clientWidth);
      let sY = image.height / (sourceImg ? image.height : video.clientHeight);

      const actualSize = roiSize * sX;
      canvas.width = actualSize; canvas.height = actualSize;
      ctx.drawImage(image, roiPos.x * sX, roiPos.y * sY, actualSize, actualSize, 0, 0, actualSize, actualSize);

      const imageData = ctx.getImageData(0, 0, actualSize, actualSize).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i]; g += imageData[i + 1]; b += imageData[i + 2];
      }
      const count = imageData.length / 4;
      const lab = rgbToLab(r / count, g / count, b / count);

      if (isBlank) setBlankLab(lab);
      else setLabValues(lab);
      setRoiImg(canvas.toDataURL('image/jpeg'));
    };
  };

  const deltaE = blankLab && labValues
    ? Math.sqrt(
        Math.pow(labValues.L - blankLab.L, 2) +
        Math.pow(labValues.a - blankLab.a, 2) +
        Math.pow(labValues.b - blankLab.b, 2)
      )
    : null;

  // ---- Small UI building blocks (estilo Figma) ----

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

  const ActionButton = ({ onClick, children, primary }) => (
    <button
      onClick={onClick}
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
        cursor: 'pointer',
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
      {/* Top app bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '18px', color: colors.teal }}>
          Mg²⁺ Diagnostic Platform
        </p>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', padding: '0 24px 24px' }}>

        {/* Camera viewport */}
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

          {/* ROI target frame */}
          <div style={{
            position: 'absolute',
            top: `${roiPos.y}px`,
            left: `${roiPos.x}px`,
            width: `${roiSize}px`,
            height: `${roiSize}px`,
            border: `2px solid ${colors.tealBright}`,
            borderRadius: '4px',
            pointerEvents: 'none',
            boxShadow: '0 0 12px rgba(0,245,212,0.3)',
          }} />

          {/* Feed scrim - live indicator */}
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

        {/* ROI controls */}
        <div>
          <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase' }}>
            ROI Controls
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
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
          <ActionButton onClick={() => captureAndMeasure(true)}>Set Blank</ActionButton>
          <ActionButton onClick={() => captureAndMeasure(false)} primary>Measure</ActionButton>
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

        {/* Results card */}
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
                    {roiImg && <img src={roiImg} alt="ROI" style={{ width: '32px', borderRadius: '4px', border: `1px solid ${colors.teal}` }} />}
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
              </>
            )}
          </div>
        )}

        {/* Legenda dos eixos - mantida do original */}
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

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default App;