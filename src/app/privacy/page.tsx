export default function PrivacyPage() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <a href="/" style={styles.backButton}>← Back</a>
        <div style={styles.updatedText}>Last updated: 15 April 2026</div>
      </div>

      <div style={styles.content}>
        <h1 style={styles.mainTitle}>PRIVACY POLICY</h1>

        <div style={styles.subtitle}>
          <p><strong>FLOSMOSIS PTY LTD</strong></p>
          <p><strong>ACN [To be inserted]</strong></p>
        </div>

        <p><strong>Effective Date:</strong> [Date]<br />
        <strong>Version:</strong> 1.0</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>1. WHO WE ARE</h2>

        <p><strong>FLOSMOSIS PTY LTD</strong> (ACN [insert]) (<strong>FLOSMOSIS</strong>, <strong>we</strong>, <strong>us</strong>, <strong>our</strong>) operates a workforce time verification platform for the Australian construction labour hire industry.</p>

        <p>Our registered office is at [address].</p>

        <p>We are committed to protecting the privacy of the personal information we collect and hold. This Privacy Policy explains how we collect, use, disclose, and protect personal information in accordance with the <strong>Privacy Act 1988 (Cth)</strong> and the <strong>Australian Privacy Principles (APPs)</strong>.</p>

        <h3 style={styles.subheading}>1.1 Application of the Privacy Act</h3>

        <div style={styles.regulatoryNote}>
          <p><strong>⚠️ Regulatory note:</strong> The Privacy Act 1988 (Cth) applies to FLOSMOSIS. The previous small business exemption (for businesses with annual turnover of $3 million or less) has been progressively removed through 2024–2025 reforms, bringing approximately 95% of Australian businesses under the Act's scope. Additionally, FLOSMOSIS handles personal information of third-party workers (not its own employees), which would have triggered obligations even under the previous regime. FLOSMOSIS is therefore subject to the full requirements of the Australian Privacy Principles (APPs 1–13).</p>
        </div>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>2. WHAT INFORMATION WE COLLECT</h2>

        <h3 style={styles.subheading}>2.1 Worker Information</h3>

        <p>We collect the following personal information about Workers whose time is recorded and verified through the Platform:</p>

        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.tableHeader}>Category</th>
              <th style={styles.tableHeader}>Information Collected</th>
              <th style={styles.tableHeader}>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Identity</strong></td>
              <td style={styles.tableCell}>Full name</td>
              <td style={styles.tableCell}>Identifying the Worker for shift records</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Contact</strong></td>
              <td style={styles.tableCell}>Mobile phone number</td>
              <td style={styles.tableCell}>OTP verification via SMS for clock-in/clock-out</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Location</strong></td>
              <td style={styles.tableCell}>GPS coordinates at clock-in and clock-out</td>
              <td style={styles.tableCell}>Verifying the Worker's presence at the designated worksite</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Shift Data</strong></td>
              <td style={styles.tableCell}>Clock-in time, clock-out time, shift duration, worksite, verification status</td>
              <td style={styles.tableCell}>Recording and verifying hours worked</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Verification</strong></td>
              <td style={styles.tableCell}>OTP verification records, hash chain verification records</td>
              <td style={styles.tableCell}>Maintaining the integrity of shift records</td>
            </tr>
          </tbody>
        </table>

        <h3 style={styles.subheading}>2.2 Supervisor Information</h3>

        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.tableHeader}>Category</th>
              <th style={styles.tableHeader}>Information Collected</th>
              <th style={styles.tableHeader}>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Identity</strong></td>
              <td style={styles.tableCell}>Full name</td>
              <td style={styles.tableCell}>Identifying the Supervisor</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Contact</strong></td>
              <td style={styles.tableCell}>Email address, phone number</td>
              <td style={styles.tableCell}>Communicating shift confirmations and notifications</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Actions</strong></td>
              <td style={styles.tableCell}>Shift confirmation records, approval timestamps</td>
              <td style={styles.tableCell}>Recording Supervisor confirmations</td>
            </tr>
          </tbody>
        </table>

        <h3 style={styles.subheading}>2.3 Customer (Employer) Information</h3>

        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.tableHeader}>Category</th>
              <th style={styles.tableHeader}>Information Collected</th>
              <th style={styles.tableHeader}>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Business</strong></td>
              <td style={styles.tableCell}>Company name, ABN, business address</td>
              <td style={styles.tableCell}>Identifying and administering the Customer account</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Contact</strong></td>
              <td style={styles.tableCell}>Contact person name, email, phone</td>
              <td style={styles.tableCell}>Account management and support</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Billing</strong></td>
              <td style={styles.tableCell}>Payment information (processed via third-party payment provider)</td>
              <td style={styles.tableCell}>Subscription billing</td>
            </tr>
          </tbody>
        </table>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>3. HOW WE COLLECT INFORMATION</h2>

        <h3 style={styles.subheading}>3.1 Collection Methods</h3>

        <p>We collect personal information:</p>

        <ul style={styles.list}>
          <li><strong>(a) Directly from the Customer</strong> — when the Customer sets up an account and registers Workers and Supervisors;</li>
          <li><strong>(b) From Workers</strong> — when Workers interact with the Platform via SMS OTP verification and clock-in/clock-out events;</li>
          <li><strong>(c) Automatically</strong> — GPS coordinates are collected automatically from Workers' mobile devices at the time of clock-in and clock-out; and</li>
          <li><strong>(d) From Supervisors</strong> — when Supervisors confirm shift records through the Platform.</li>
        </ul>

        <h3 style={styles.subheading}>3.2 Consent</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> Worker personal information is provided to FLOSMOSIS by the Customer (the Worker's employer or labour hire company). The Customer warrants that it has obtained all necessary consents from Workers for the collection, use, and disclosure of their personal information by FLOSMOSIS.</li>
          <li><strong>(b)</strong> Workers are informed of the collection of their personal information (including GPS data) through:
            <ul style={styles.nestedList}>
              <li>(i) the initial SMS message sent when the Platform is first used;</li>
              <li>(ii) information provided by the Customer; and</li>
              <li>(iii) this Privacy Policy (available on the FLOSMOSIS website).</li>
            </ul>
          </li>
          <li><strong>(c)</strong> If we collect personal information from a third party (i.e., from the Customer rather than directly from the Worker), we take reasonable steps to ensure that the individual has been made aware of the matters covered by APP 5 (notification of the collection of personal information).</li>
        </ul>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>4. WHY WE COLLECT INFORMATION</h2>

        <p>We collect personal information for the following purposes:</p>

        <ul style={styles.list}>
          <li>(a) to provide the FLOSMOSIS workforce time verification service to our Customers;</li>
          <li>(b) to record and verify hours worked by Workers;</li>
          <li>(c) to send OTP verification messages to Workers via SMS;</li>
          <li>(d) to capture and record GPS coordinates for worksite verification;</li>
          <li>(e) to create tamper-evident shift records using the WLES hash chain methodology;</li>
          <li>(f) to enable Supervisors to confirm and manage shift records;</li>
          <li>(g) to administer Customer accounts and billing;</li>
          <li>(h) to improve and develop the Platform;</li>
          <li>(i) to communicate with Customers and their Authorised Users;</li>
          <li>(j) to comply with legal and regulatory obligations; and</li>
          <li>(k) to protect our rights and the rights of our Customers and Workers.</li>
        </ul>

        <p style={styles.importantNote}><strong>Strictly for time verification:</strong> We collect and use personal information strictly for the purpose of workforce time verification. We do <strong>NOT</strong> use personal information to calculate wages, award entitlements, superannuation, or tax, and we do <strong>NOT</strong> provide payroll services.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>5. HOW WE USE INFORMATION</h2>

        <p>We use personal information in accordance with APP 6 — only for the primary purpose for which it was collected, or for a directly related secondary purpose that would reasonably be expected by the individual.</p>

        <p>Specifically:</p>

        <ul style={styles.list}>
          <li>(a) Worker Data is used to provide the time verification service and to generate shift records;</li>
          <li>(b) GPS data is used solely to verify Worker presence at the worksite at clock-in and clock-out — it is NOT used for continuous tracking;</li>
          <li>(c) Supervisor information is used to manage shift confirmations;</li>
          <li>(d) Customer information is used for account administration and billing; and</li>
          <li>(e) Aggregated, de-identified data may be used for analytics and service improvement purposes.</li>
        </ul>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>6. WHO WE SHARE INFORMATION WITH</h2>

        <h3 style={styles.subheading}>6.1 Customer Access</h3>

        <p>Each Customer can only access the personal information of their own Workers and Supervisors. Customers cannot access the data of other Customers' Workers.</p>

        <h3 style={styles.subheading}>6.2 Third-Party Service Providers</h3>

        <p>We share personal information with the following third-party service providers, who process data on our behalf:</p>

        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.tableHeader}>Provider</th>
              <th style={styles.tableHeader}>Service</th>
              <th style={styles.tableHeader}>Data Shared</th>
              <th style={styles.tableHeader}>Location</th>
            </tr>
          </thead>
          <tbody>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Twilio</strong></td>
              <td style={styles.tableCell}>SMS delivery (OTP verification)</td>
              <td style={styles.tableCell}>Worker mobile phone numbers, OTP messages</td>
              <td style={styles.tableCell}>USA (with data processing agreements in place)</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Supabase</strong></td>
              <td style={styles.tableCell}>Database hosting and data storage</td>
              <td style={styles.tableCell}>All Customer Data, Worker Data, Shift Data</td>
              <td style={styles.tableCell}>Australia / USA (depending on instance configuration)</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Resend</strong></td>
              <td style={styles.tableCell}>Email delivery</td>
              <td style={styles.tableCell}>Email addresses, notification content</td>
              <td style={styles.tableCell}>USA</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}><strong>Vercel</strong></td>
              <td style={styles.tableCell}>Application hosting</td>
              <td style={styles.tableCell}>Application data processed during server-side rendering</td>
              <td style={styles.tableCell}>USA / Australia (edge network)</td>
            </tr>
          </tbody>
        </table>

        <h3 style={styles.subheading}>6.3 Overseas Disclosure — APP 8</h3>

        <p>Where personal information is disclosed to overseas recipients (as listed above), FLOSMOSIS takes reasonable steps to ensure that the overseas recipients:</p>

        <ul style={styles.list}>
          <li>(a) comply with the Australian Privacy Principles (or substantially similar privacy protections); and</li>
          <li>(b) are bound by contractual obligations to protect personal information.</li>
        </ul>

        <h3 style={styles.subheading}>6.4 Other Disclosures</h3>

        <p>We may also disclose personal information:</p>

        <ul style={styles.list}>
          <li>(a) where required or authorised by law (including by court order or subpoena);</li>
          <li>(b) to law enforcement agencies in connection with an investigation;</li>
          <li>(c) to our professional advisers (lawyers, accountants) in confidence;</li>
          <li>(d) in connection with a sale, merger, or acquisition of FLOSMOSIS's business (subject to confidentiality obligations on the acquirer); or</li>
          <li>(e) where necessary to lessen or prevent a serious threat to the life, health, or safety of any individual.</li>
        </ul>

        <h3 style={styles.subheading}>6.5 No Sale of Personal Information</h3>

        <p>FLOSMOSIS does not sell personal information to third parties for marketing or any other purpose.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>7. GPS AND LOCATION DATA</h2>

        <h3 style={styles.subheading}>7.1 GPS Data Collection</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> The Platform collects GPS coordinates from Workers' mobile devices at two specific points:
            <ul style={styles.nestedList}>
              <li>(i) <strong>Clock-in:</strong> GPS coordinates are captured at the time the Worker clocks in; and</li>
              <li>(ii) <strong>Clock-out:</strong> GPS coordinates are captured at the time the Worker clocks out.</li>
            </ul>
          </li>
          <li><strong>(b) No continuous tracking:</strong> FLOSMOSIS does NOT continuously track Workers' locations. GPS data is captured only at the discrete clock-in and clock-out moments.</li>
        </ul>

        <h3 style={styles.subheading}>7.2 Purpose</h3>

        <p>GPS data is collected for the sole purpose of verifying that the Worker was at or near the designated worksite at the time of clock-in and clock-out. It is used to:</p>

        <ul style={styles.list}>
          <li>(a) provide evidence of worksite presence to the Customer;</li>
          <li>(b) detect potential discrepancies between the Worker's location and the designated worksite; and</li>
          <li>(c) form part of the tamper-evident shift record under WLES.</li>
        </ul>

        <h3 style={styles.subheading}>7.3 Sensitivity of GPS Data</h3>

        <div style={styles.regulatoryNote}>
          <p><strong>⚠️ Regulatory analysis:</strong> Under the Privacy Act 1988 (Cth), "sensitive information" is defined in s 6(1) and includes information about health, genetics, biometrics, criminal record, and sexual orientation — but does NOT explicitly include location data. GPS coordinates are therefore classified as <strong>personal information</strong> (not sensitive information) under the current Act. However:</p>
          <ul style={styles.list}>
            <li>(a) The Office of the Australian Information Commissioner (OAIC) has recognised that location data can reveal sensitive details about individuals and should be treated with a high degree of care.</li>
            <li>(b) Privacy reform proposals have considered whether location data should be classified as sensitive information.</li>
            <li>(c) As a matter of best practice, FLOSMOSIS treats GPS data with the same level of care as sensitive information, including limiting collection to what is strictly necessary and not using GPS data for any purpose other than worksite verification.</li>
          </ul>
        </div>

        <h3 style={styles.subheading}>7.4 Worker Awareness</h3>

        <p>Workers are informed of GPS data collection through:</p>

        <ul style={styles.list}>
          <li>(a) the Customer's obligation to inform Workers before they use the Platform;</li>
          <li>(b) the initial SMS interaction when a Worker first uses the Platform; and</li>
          <li>(c) this Privacy Policy.</li>
        </ul>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>8. DATA SECURITY</h2>

        <h3 style={styles.subheading}>8.1 Security Measures</h3>

        <p>FLOSMOSIS implements the following security measures to protect personal information:</p>

        <ul style={styles.list}>
          <li><strong>(a) Encryption:</strong> Data is encrypted in transit using TLS/SSL and at rest using AES-256 encryption (or equivalent);</li>
          <li><strong>(b) Access controls:</strong> Role-based access controls ensure that only authorised personnel can access personal information;</li>
          <li><strong>(c) Authentication:</strong> Multi-factor authentication for FLOSMOSIS administrative access;</li>
          <li><strong>(d) WLES Hash Chain:</strong> Shift records are secured using SHA-256 hash chain verification, which creates a tamper-evident record of each shift event. If any record is altered after creation, the hash chain will be broken, indicating tampering;</li>
          <li><strong>(e) Supabase security:</strong> Customer Data is stored in Supabase's managed PostgreSQL database infrastructure, which includes Row Level Security (RLS) policies to enforce data isolation between Customers;</li>
          <li><strong>(f) Regular review:</strong> FLOSMOSIS conducts regular reviews of its security practices and updates them as necessary.</li>
        </ul>

        <p style={styles.importantNote}><strong>Note:</strong> FLOSMOSIS does not warrant that the SHA-256 hash chain creates legally admissible evidence or constitutes a legally recognised digital signature. The hash chain provides a technical mechanism for detecting unauthorised modifications to shift records. Its legal status and evidentiary weight are matters for the relevant court or tribunal.</p>

        <h3 style={styles.subheading}>8.2 Notifiable Data Breaches</h3>

        <p>FLOSMOSIS complies with the Notifiable Data Breaches (NDB) scheme under Part IIIC of the Privacy Act 1988 (Cth). If FLOSMOSIS becomes aware of an eligible data breach (or suspects an eligible data breach has occurred), it will:</p>

        <ul style={styles.list}>
          <li>(a) conduct an assessment within 30 days to determine whether the breach is likely to result in serious harm to any individual;</li>
          <li>(b) if the breach is an eligible data breach, notify the Office of the Australian Information Commissioner (OAIC) and all affected individuals as soon as practicable; and</li>
          <li>(c) take reasonable steps to contain the breach and mitigate its impact.</li>
        </ul>

        <h3 style={styles.subheading}>8.3 Customer Notification</h3>

        <p>In the event of a data breach affecting Customer Data, FLOSMOSIS will notify the Customer as soon as practicable after becoming aware of the breach.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>9. DATA RETENTION</h2>

        <h3 style={styles.subheading}>9.1 Retention Period</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> FLOSMOSIS retains Customer Data for the duration of the Customer's subscription and for 90 days after termination, during which the Customer may export the data.</li>
          <li><strong>(b)</strong> After the 90-day post-termination period, FLOSMOSIS will take reasonable steps to destroy or de-identify the personal information, unless retention is required or authorised by law.</li>
        </ul>

        <h3 style={styles.subheading}>9.2 Legal Requirements</h3>

        <p>FLOSMOSIS may retain personal information for longer periods where required by law, including:</p>

        <ul style={styles.list}>
          <li>(a) records required for tax or accounting purposes (7 years under tax legislation);</li>
          <li>(b) records required by any court order, subpoena, or regulatory directive; and</li>
          <li>(c) records required for FLOSMOSIS's legitimate legal interests (e.g., in connection with a dispute).</li>
        </ul>

        <h3 style={styles.subheading}>9.3 De-identification</h3>

        <p>Where FLOSMOSIS de-identifies personal information for analytical or research purposes, the de-identified data will not be re-identified.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>10. ACCESS AND CORRECTION</h2>

        <h3 style={styles.subheading}>10.1 Access</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> Under APP 12, individuals have the right to request access to the personal information FLOSMOSIS holds about them.</li>
          <li><strong>(b)</strong> To request access, contact FLOSMOSIS at the contact details in clause 12. FLOSMOSIS will respond to access requests within 30 days.</li>
          <li><strong>(c)</strong> FLOSMOSIS may charge a reasonable fee for providing access to information, reflecting the cost of retrieval and provision.</li>
          <li><strong>(d)</strong> FLOSMOSIS may refuse access in the circumstances permitted by APP 12.3, including where access would unreasonably impact the privacy of other individuals.</li>
        </ul>

        <h3 style={styles.subheading}>10.2 Correction</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> Under APP 13, individuals have the right to request correction of personal information that is inaccurate, out of date, incomplete, irrelevant, or misleading.</li>
          <li><strong>(b)</strong> To request correction, contact FLOSMOSIS at the contact details in clause 12. FLOSMOSIS will respond to correction requests within 30 days.</li>
          <li><strong>(c)</strong> If FLOSMOSIS refuses to correct personal information, FLOSMOSIS will provide reasons in writing and advise the individual of their right to make a complaint.</li>
        </ul>

        <h3 style={styles.subheading}>10.3 Worker Access</h3>

        <p>Workers who wish to access or correct their personal information should, in the first instance, contact their employer (the Customer). If the Customer is unable to assist, the Worker may contact FLOSMOSIS directly.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>11. COMPLAINTS</h2>

        <h3 style={styles.subheading}>11.1 Internal Complaints</h3>

        <p>If you have a complaint about how FLOSMOSIS handles personal information, you may contact us at the details in clause 12. We will:</p>

        <ul style={styles.list}>
          <li>(a) acknowledge receipt of the complaint within 5 Business Days;</li>
          <li>(b) investigate the complaint; and</li>
          <li>(c) provide a written response within 30 days.</li>
        </ul>

        <h3 style={styles.subheading}>11.2 External Complaints</h3>

        <p>If you are not satisfied with our response, you may lodge a complaint with the <strong>Office of the Australian Information Commissioner (OAIC)</strong>:</p>

        <ul style={styles.list}>
          <li><strong>Website:</strong> <a href="https://www.oaic.gov.au" style={styles.link}>www.oaic.gov.au</a></li>
          <li><strong>Phone:</strong> 1300 363 992</li>
          <li><strong>Email:</strong> enquiries@oaic.gov.au</li>
          <li><strong>Post:</strong> GPO Box 5218, Sydney NSW 2001</li>
        </ul>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>12. CONTACT DETAILS</h2>

        <p>
          <strong>Privacy Officer</strong><br />
          FLOSMOSIS PTY LTD<br />
          [Registered office address]
        </p>

        <p>
          <strong>Email:</strong> privacy@flosmosis.com<br />
          <strong>Phone:</strong> [phone number]<br />
          <strong>Website:</strong> www.flosmosis.com
        </p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>13. CHANGES TO THIS POLICY</h2>

        <p>FLOSMOSIS may update this Privacy Policy from time to time. We will notify Customers of material changes by email and will update the "Effective Date" at the top of this Policy. The current version of this Privacy Policy is always available on the FLOSMOSIS website.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>14. AUSTRALIAN PRIVACY PRINCIPLES — COMPLIANCE SUMMARY</h2>

        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.tableHeader}>APP</th>
              <th style={styles.tableHeader}>Subject</th>
              <th style={styles.tableHeader}>FLOSMOSIS Compliance</th>
            </tr>
          </thead>
          <tbody>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 1</td>
              <td style={styles.tableCell}>Open and transparent management of personal information</td>
              <td style={styles.tableCell}>This Privacy Policy; internal privacy procedures</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 2</td>
              <td style={styles.tableCell}>Anonymity and pseudonymity</td>
              <td style={styles.tableCell}>Workers must be identified for time verification; anonymity is not practicable for this service</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 3</td>
              <td style={styles.tableCell}>Collection of solicited personal information</td>
              <td style={styles.tableCell}>Only personal information reasonably necessary for time verification is collected</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 4</td>
              <td style={styles.tableCell}>Dealing with unsolicited personal information</td>
              <td style={styles.tableCell}>Any unsolicited personal information not required is destroyed or de-identified</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 5</td>
              <td style={styles.tableCell}>Notification of the collection of personal information</td>
              <td style={styles.tableCell}>Workers are notified via Customer, initial SMS, and this Policy</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 6</td>
              <td style={styles.tableCell}>Use or disclosure of personal information</td>
              <td style={styles.tableCell}>Used only for primary purpose (time verification) or directly related secondary purposes</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 7</td>
              <td style={styles.tableCell}>Direct marketing</td>
              <td style={styles.tableCell}>FLOSMOSIS does not use Worker personal information for direct marketing</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 8</td>
              <td style={styles.tableCell}>Cross-border disclosure of personal information</td>
              <td style={styles.tableCell}>Overseas disclosures to Twilio, Supabase, Resend, Vercel — contractual protections in place</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 9</td>
              <td style={styles.tableCell}>Adoption, use or disclosure of government related identifiers</td>
              <td style={styles.tableCell}>FLOSMOSIS does not collect government identifiers (TFN, Medicare, etc.)</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 10</td>
              <td style={styles.tableCell}>Quality of personal information</td>
              <td style={styles.tableCell}>Reasonable steps to ensure accuracy and currency</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 11</td>
              <td style={styles.tableCell}>Security of personal information</td>
              <td style={styles.tableCell}>Encryption, access controls, hash chain verification, NDB compliance</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 12</td>
              <td style={styles.tableCell}>Access to personal information</td>
              <td style={styles.tableCell}>Individuals may request access (clause 10.1)</td>
            </tr>
            <tr style={styles.tableRow}>
              <td style={styles.tableCell}>APP 13</td>
              <td style={styles.tableCell}>Correction of personal information</td>
              <td style={styles.tableCell}>Individuals may request correction (clause 10.2)</td>
            </tr>
          </tbody>
        </table>

        <hr style={styles.divider} />

        <p style={styles.footer}>
          <em>End of Document</em>
        </p>

        <p style={styles.copyright}>
          © 2026 FLOSMOSIS PTY LTD. Flostruction is a product of FLOSMOSIS PTY LTD.
        </p>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: '#0a0a1a',
    color: 'rgba(255, 255, 255, 0.85)',
    minHeight: '100vh',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    lineHeight: '1.6',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
    maxWidth: '800px',
    margin: '0 auto 40px',
  },
  backButton: {
    color: '#888',
    textDecoration: 'none',
    fontSize: '16px',
    transition: 'color 0.2s',
  },
  updatedText: {
    fontSize: '12px',
    color: '#666',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  mainTitle: {
    fontSize: '32px',
    color: 'white',
    marginBottom: '20px',
    marginTop: '0',
  },
  subtitle: {
    marginBottom: '20px',
  },
  heading: {
    fontSize: '18px',
    color: 'white',
    marginTop: '30px',
    marginBottom: '15px',
    fontWeight: 'bold',
  },
  subheading: {
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: '20px',
    marginBottom: '10px',
    fontWeight: '600',
  },
  divider: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    margin: '30px 0',
  },
  list: {
    marginLeft: '20px',
    marginBottom: '15px',
  },
  nestedList: {
    marginLeft: '20px',
    marginTop: '10px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '20px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  tableHeaderRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  tableHeader: {
    padding: '12px',
    textAlign: 'left',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    color: 'white',
    fontWeight: '600',
  },
  tableRow: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  tableCell: {
    padding: '12px',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '14px',
  },
  regulatoryNote: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '15px',
    borderRadius: '4px',
    marginBottom: '20px',
  },
  importantNote: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '20px',
  },
  link: {
    color: '#88ccff',
    textDecoration: 'none',
  },
  footer: {
    textAlign: 'center',
    marginTop: '40px',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  copyright: {
    textAlign: 'center',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: '20px',
    marginBottom: '40px',
  },
};
