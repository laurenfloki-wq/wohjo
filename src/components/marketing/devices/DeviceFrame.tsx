// Six-layer iPhone device frame — flostruction-v5.html:126-161.
// Layers: bevel frame (gradient + inset highlights), side buttons
// (frame ::before/::after), screen, inset ring (.sring), glass shine
// (.shine), dynamic island with camera lens, iOS home indicator.
// All visual styling lives in marketing.css under .mkt.
import { type FC, type ReactNode } from 'react';

interface DeviceFrameProps {
  /** Extra class on .screen — e.g. 'smsscreen' for the iMessage phone. */
  screenClassName?: string;
  children: ReactNode;
}

export const DeviceFrame: FC<DeviceFrameProps> = ({ screenClassName, children }) => (
  <div className="device">
    <div className="frame">
      <div className={screenClassName ? `screen ${screenClassName}` : 'screen'}>
        <div className="island" />
        {children}
        <div className="homebar" />
        <div className="sring" />
        <div className="shine" />
      </div>
    </div>
  </div>
);

// iOS status bar — flostruction-v5.html:500-504 (signal, wifi, battery
// glyphs verbatim).
export const IosStatusBar: FC = () => (
  <div className="sbar">
    <span>9:41</span>
    <span className="glyphs">
      <svg width="15" height="10" viewBox="0 0 15 10" fill="currentColor" aria-hidden="true">
        <rect x="0" y="6" width="2.6" height="4" rx="0.6" />
        <rect x="3.9" y="4" width="2.6" height="6" rx="0.6" />
        <rect x="7.8" y="2" width="2.6" height="8" rx="0.6" />
        <rect x="11.7" y="0" width="2.6" height="10" rx="0.6" />
      </svg>
      <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" aria-hidden="true">
        <path d="M7 9.6 4.6 7.2a3.4 3.4 0 0 1 4.8 0L7 9.6ZM2.9 5.5a5.8 5.8 0 0 1 8.2 0l-1.4 1.4a3.8 3.8 0 0 0-5.4 0L2.9 5.5ZM1.2 3.8 0 2.6a9.9 9.9 0 0 1 14 0l-1.2 1.2a8.2 8.2 0 0 0-11.6 0Z" />
      </svg>
      <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
        <rect x="0.5" y="0.5" width="18" height="9" rx="2.5" fill="none" stroke="currentColor" strokeOpacity=".4" />
        <rect x="2" y="2" width="13" height="6" rx="1.4" fill="currentColor" />
        <rect x="19.7" y="3" width="1.8" height="4" rx="0.9" fill="currentColor" fillOpacity=".4" />
      </svg>
    </span>
  </div>
);
