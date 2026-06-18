// Layer 03 · Seal & export — the labour hire dashboard in a browser
// frame (flostruction-v5.html:578-625). Brand Suite v3 navy. The KPI
// counters, João Silva row status and footer record count are mutated
// by the orchestrator. All rows are synthetic demo data, verbatim.
import { type FC } from 'react';
import { FMarkBars } from './FMarkBars';

export const DashboardFrame: FC = () => (
  <div className="unit dashunit" data-depth="3">
    <div className="browser">
      <div className="bchrome">
        <div className="bdots"><i /><i /><i /></div>
        <div className="url"><b>https://</b>app.flosmosis.com/today</div>
        <div style={{ width: 46 }} />
      </div>
      <div className="app">
        <div className="side">
          <div className="lock">
            <FMarkBars className="fmk fmk-side" />
            <span className="slogo">FLOSTRUCTION</span>
          </div>
          <a className="cur" href="#" tabIndex={-1} aria-disabled="true" onClick={(e) => e.preventDefault()}><span className="d8" />Today</a>
          <a href="#" tabIndex={-1} aria-disabled="true" onClick={(e) => e.preventDefault()}><span className="d8" />Pay runs</a>
          <a href="#" tabIndex={-1} aria-disabled="true" onClick={(e) => e.preventDefault()}><span className="d8" />People</a>
          <a href="#" tabIndex={-1} aria-disabled="true" onClick={(e) => e.preventDefault()}><span className="d8" />Sites</a>
          <a href="#" tabIndex={-1} aria-disabled="true" onClick={(e) => e.preventDefault()}><span className="d8" />Records</a>
          <div className="org">Demo Labour Hire Pty Ltd<br />Demo workspace</div>
        </div>
        <div className="main">
          <div className="mtop">
            <div>
              <h4>The next pay run is ready.</h4>
              <div className="when">This week · Thu 23 Apr 2026 · 10:43 AEST</div>
            </div>
            <button className="exp" tabIndex={-1} type="button">Run pay run</button>
          </div>
          <div className="kpis">
            <div className="kpi"><div className="k">Verified hours</div><div className="v" data-scene="kver">412.5</div></div>
            <div className="kpi a"><div className="k">On site</div><div className="v" data-scene="ksite">23</div></div>
            <div className="kpi g"><div className="k">Sealed records</div><div className="v" data-scene="kseal">96</div></div>
            <div className="kpi"><div className="k">Disputes</div><div className="v">0</div></div>
          </div>
          <div className="dcard">
            <div className="dthread"><span className="a" style={{ width: '90%' }} /><span className="b" style={{ width: '6%' }} /></div>
            <div className="dread">
              <b>Safe to run</b> — this week&rsquo;s verified hours, sealed and ready to export clean to
              payroll. <span className="dgo">Run pay run &rarr;</span>
            </div>
          </div>
          <div className="tbl">
            <div className="tr"><span>Worker</span><span>Site</span><span>Hours</span><span>Status</span></div>
            <div className="tr">
              <span className="w">João Silva</span>
              <span className="s">Westgate Tower · L9</span>
              <span className="s" data-scene="dashtimer">8:01</span>
              <span data-scene="dstat"><span className="chip live"><i />LIVE</span></span>
            </div>
            <div className="tr"><span className="w">Demo Worker</span><span className="s">Westgate Tower · L9</span><span className="s">7:30</span><span><span className="chip sealed"><i />WLES SEALED</span></span></div>
            <div className="tr"><span className="w">A. Carpenter</span><span className="s">Riverside · Stage 2</span><span className="s">7:45</span><span><span className="chip wait">AWAITING SMS</span></span></div>
            <div className="tr"><span className="w">P. Rigger</span><span className="s">Marsden Yard · Gate 2</span><span className="s">8:00</span><span><span className="chip sealed"><i />WLES SEALED</span></span></div>
          </div>
          <div className="mfoot">
            <span><span data-scene="rec">96</span> records · <b>all hashes verified</b></span>
            <span>WLES V1.0</span>
          </div>
        </div>
      </div>
    </div>
    <div className="caption">
      <div className="ltag">Layer 03 · Seal &amp; export</div>
      <h3>The labour hire dashboard</h3>
      <p>Every crew, every site, every sealed record in one place — verified hours exported clean to payroll, with nothing to argue about.</p>
    </div>
  </div>
);
