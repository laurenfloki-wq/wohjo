// Layer 01 · Capture — the worker app phone (flostruction-v5.html:493-542).
// Brand Suite v3 navy product surface inside the marketing shell.
// Renders the scene's INITIAL state; useSceneOrchestrator owns every
// transition (timer tick, hold, ENDED pill, receipt swap, seal stamp).
// All demo data is synthetic and verbatim from the prototype.
import { type FC } from 'react';
import { DeviceFrame, IosStatusBar } from './DeviceFrame';
import { FMarkBars } from './FMarkBars';

export const WorkerPhone: FC = () => (
  <div className="unit" data-depth="1">
    <DeviceFrame>
      <div className="wk">
        <FMarkBars className="fmk ghost" />
        <IosStatusBar />
        <div className="apphead">
          <FMarkBars className="fmk fmk-app" />
          <span className="appname">Flostruction</span>
          <span className="who">JS</span>
        </div>
        <div className="livecard">
          <span className="lpill" data-scene="pill"><i /><span data-scene="pilltxt">LIVE</span></span>
          <div className="site">Westgate Tower · L9</div>
          <div className="timer" data-scene="timer">8:01:48</div>
          <div className="ci" data-scene="ci">clocked on 07:00 · gps locked</div>
        </div>
        <div className="hold" data-scene="hold">
          <span data-scene="holdtxt">Hold to end shift</span>
          <span className="ring"><i /></span>
          <small>press and hold · 1.5 s</small>
          <div className="touch" data-scene="touch" aria-hidden="true"><span className="ringo" /><span className="tip" /></div>
        </div>
        <div className="rlab" data-scene="rlab">Last shift · sealed</div>
        <div className="rcptcard">
          <div className="rid" data-scene="rid">FSTR-7P2K9Q</div>
          <div className="rrow">
            <span className="rsite" data-scene="rsite">Wed 22 Apr · Westgate Tower L9</span>
            <span className="rhrs" data-scene="rhrs">7 h 58 m</span>
          </div>
          <span className="schip" data-scene="chip"><i /><span data-scene="chiptxt">WLES SEALED</span></span>
          <div className="rhash">SHA-256 · WLES V1.0 · <span data-scene="rhash">a3b5c7d2f819e4b0c1d23a43e3c1e530</span>…</div>
          <svg className="sealstamp" data-scene="sealstamp" viewBox="0 0 96 96" aria-hidden="true">
            <circle cx="48" cy="48" r="42" fill="none" stroke="#1F4A2E" strokeWidth="2.4" />
            <circle cx="48" cy="48" r="35" fill="none" stroke="#1F4A2E" strokeWidth="1" />
            <text x="48" y="45" fontFamily="Saira Condensed, sans-serif" fontWeight="800" fontSize="15" fill="#1F4A2E" textAnchor="middle" letterSpacing="2">SEALED</text>
            <line x1="31" y1="51" x2="65" y2="51" stroke="#1F4A2E" strokeWidth="0.9" />
            <text x="48" y="61" fontFamily="JetBrains Mono, monospace" fontWeight="600" fontSize="6.4" fill="#1F4A2E" textAnchor="middle">23 APR 2026</text>
            <text x="48" y="73" fontFamily="Saira Condensed, sans-serif" fontWeight="700" fontSize="6.5" fill="#1F4A2E" textAnchor="middle" letterSpacing="1.5">WLES V1.0</text>
          </svg>
        </div>
      </div>
    </DeviceFrame>
    <div className="caption">
      <div className="ltag">Layer 01 · Capture</div>
      <h3>The worker app</h3>
      <p>Hours captured at the point of work. Every approved shift produces a permanent, tamper-evident WLES record in the worker&apos;s pocket.</p>
    </div>
  </div>
);
