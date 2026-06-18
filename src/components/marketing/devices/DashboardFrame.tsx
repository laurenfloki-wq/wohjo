// Layer 03 · Seal & export — the live operator page (/today) in a browser
// frame. Editorial layout mirroring app.flosmosis.com/today: the serif
// greeting + the pay-run card (thread, Payday-Super timeline, "safe to run").
// The orchestrator mutates kver / kseal / ksite / rec as the scene plays.
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
      <div className="d2">
        <div className="d2rail">
          <FMarkBars className="fmk fmk-side" />
          <span className="d2ico cur" />
          <span className="d2ico" />
          <span className="d2ico" />
          <span className="d2ico" />
          <span className="d2ico" />
        </div>
        <div className="d2main">
          <div className="d2head">
            <span className="d2logo">FLOSTRUCTION</span>
            <span className="d2chain">chain verified · 96/96</span>
          </div>
          <div className="d2eyebrow">Today · Thu 18 June</div>
          <h4 className="d2greet">
            Everything ran properly overnight. This week&rsquo;s pay run is{' '}
            <span className="safe">safe to run</span>.
          </h4>
          <p className="d2sub">
            <b data-scene="kver">412.5</b> hours stand verified this week. Nothing is waiting on you.
          </p>
          <div className="d2pr">
            <div className="d2prtop">
              <span className="d2prt">Pay run · this week</span>
              <span className="d2prw">Payday Super · 7 business days</span>
            </div>
            <div className="d2thread">
              <span className="a" style={{ width: '92%' }} />
              <span className="b" style={{ width: '5%' }} />
            </div>
            <div className="d2marks">
              <span>today · Thu 18 Jun</span>
              <span>payday · in 5 days</span>
              <span>super lands · Thu 25 Jun</span>
            </div>
            <div className="d2read">
              <b data-scene="kseal">96</b> records sealed and verified ·{' '}
              <span data-scene="ksite">3</span> still in motion on site · 0 waiting on you.
            </div>
            <div className="d2cta">
              <div className="d2state">
                <b>Safe to run</b> — sealed and ready to export clean to payroll.
              </div>
              <span className="d2btn">Run pay run &rarr;</span>
            </div>
          </div>
          <div className="d2foot">
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
