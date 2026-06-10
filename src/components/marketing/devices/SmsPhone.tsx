// Layer 02 · Verify — supervisor approval by SMS (flostruction-v5.html:544-576).
// iMessage thread; messages enter via .msg.in pops driven by the
// orchestrator. YES ALL approves the batch (non-flagged shifts only —
// product invariant 12). Sealed-hours tags stagger in at the end.
import { type FC } from 'react';
import { DeviceFrame, IosStatusBar } from './DeviceFrame';
import { FMarkBars } from './FMarkBars';

export const SmsPhone: FC = () => (
  <div className="unit" data-depth="2">
    <DeviceFrame screenClassName="smsscreen">
      <IosStatusBar />
      <div className="sms">
        <div className="chathead">
          <span className="back" />
          <div className="avatar fl"><FMarkBars className="fmk fmk-av" /></div>
          <div className="who">Flostruction <span>&#8250;</span></div>
        </div>
        <div className="thread" data-scene="thread">
          <div className="day msg" data-step="0">Today 15:41</div>
          <div className="typing msg" data-scene="typing" aria-hidden="true"><i /><i /><i /></div>
          <div className="bub them msg" data-step="1" data-snd="rx">
            2 timesheets from your crew.<br />João Silva — 8 h 02 m, Westgate Tower XYZ123<br />Demo Worker — 7.5 hrs, Westgate Tower ABC456<br />Reply YES ALL to approve.
          </div>
          <div className="bub me msg" data-step="2" data-snd="tx">YES ALL</div>
          <div className="dlv msg" data-step="3">Delivered</div>
          <div className="bub them msg" data-step="4" data-snd="rx">2 timesheets approved. Records sealed. Sent to payroll. Workers notified.</div>
        </div>
        <div className="inputbar"><div className="field"><span>Text Message · SMS</span><span className="mic" /></div></div>
      </div>
    </DeviceFrame>
    <div className="tagsrow" data-scene="tags">
      <span className="tag">8 HRS SEALED</span>
      <span className="tag">7.5 HRS SEALED</span>
      <span className="tag pay">$441.29 TO PAYROLL</span>
    </div>
    <div className="caption">
      <div className="ltag">Layer 02 · Verify</div>
      <h3>Supervisor approval by SMS</h3>
      <p>Site managers approve shifts in seconds. No new app to learn. The structure of the SMS is the structure of the substrate.</p>
    </div>
  </div>
);
