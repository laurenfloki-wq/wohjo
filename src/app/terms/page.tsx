export default function TermsPage() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <a href="/" style={styles.backButton}>← Back</a>
        <div style={styles.updatedText}>Last updated: 15 April 2026</div>
      </div>

      <div style={styles.content}>
        <h1 style={styles.mainTitle}>TERMS OF SERVICE</h1>

        <div style={styles.subtitle}>
          <p><strong>FLOSMOSIS PTY LTD</strong></p>
          <p><strong>ACN [To be inserted]</strong></p>
        </div>

        <p><strong>Effective Date:</strong> [Date]<br />
        <strong>Version:</strong> 1.0</p>

        <div style={styles.importantBox}>
          <p><strong>IMPORTANT — SCOPE STATEMENT</strong></p>
          <p>FLOSMOSIS is a workforce time verification platform. It records and verifies hours worked by employees and contractors. <strong>It does not calculate wages, award entitlements, overtime, penalty rates, superannuation, tax, or any other employment entitlement.</strong> All such calculations are the sole responsibility of the Customer and their payroll provider.</p>
        </div>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>1. DEFINITIONS</h2>

        <p>In these Terms, unless the context otherwise requires:</p>

        <ul style={styles.definitionList}>
          <li><strong>"Account"</strong> means the Customer's account on the Platform.</li>
          <li><strong>"Authorised Users"</strong> means the Customer's employees, contractors, and agents who are authorised by the Customer to access and use the Platform, including Supervisors and Workers.</li>
          <li><strong>"Australian Consumer Law"</strong> or <strong>"ACL"</strong> means Schedule 2 to the Competition and Consumer Act 2010 (Cth).</li>
          <li><strong>"Business Day"</strong> means a day that is not a Saturday, Sunday, or public holiday in New South Wales.</li>
          <li><strong>"Commencement Date"</strong> means the date on which the Customer first accesses the Platform or the date of this Agreement, whichever is earlier.</li>
          <li><strong>"Confidential Information"</strong> means all information disclosed by one Party to the other in connection with this Agreement that is not publicly available, including business information, technical information, and Customer Data.</li>
          <li><strong>"Customer"</strong> means the entity identified in the Subscription Agreement as the subscriber to the Platform.</li>
          <li><strong>"Customer Data"</strong> means all data inputted into the Platform by or on behalf of the Customer, including Worker Data and Shift Data.</li>
          <li><strong>"FLOSMOSIS"</strong>, <strong>"we"</strong>, <strong>"us"</strong>, or <strong>"our"</strong> means FLOSMOSIS PTY LTD ACN [insert].</li>
          <li><strong>"GST"</strong> has the meaning given in the A New Tax System (Goods and Services Tax) Act 1999 (Cth).</li>
          <li><strong>"Intellectual Property"</strong> means all intellectual property rights of whatever nature, whether registered or unregistered, including patents, trade marks, copyright, designs, trade secrets, and know-how.</li>
          <li><strong>"Pilot Period"</strong> means any free trial or pilot period offered to the Customer, as described in clause 7.</li>
          <li><strong>"Platform"</strong> means the FLOSMOSIS workforce time verification software application, accessible via web and mobile interfaces, including all updates and modifications.</li>
          <li><strong>"Privacy Policy"</strong> means FLOSMOSIS's privacy policy as published on our website and updated from time to time.</li>
          <li><strong>"Shift Data"</strong> means data relating to shifts worked by Workers, including clock-in and clock-out times, GPS coordinates at clock-in and clock-out, shift duration, site location, supervisor confirmations, and verification status.</li>
          <li><strong>"Subscription Agreement"</strong> means the order form or written agreement between FLOSMOSIS and the Customer setting out the subscription terms, including the Subscription Fee.</li>
          <li><strong>"Subscription Fee"</strong> means the fee payable by the Customer for use of the Platform, as set out in the Subscription Agreement.</li>
          <li><strong>"Supervisor"</strong> means a person nominated by the Customer to supervise Workers at a worksite and confirm shift data through the Platform.</li>
          <li><strong>"Terms"</strong> means these Terms of Service, as amended from time to time.</li>
          <li><strong>"WLES"</strong> means the Workforce Labour Event Standard, the technical specification used by the Platform to record and verify labour events.</li>
          <li><strong>"Worker"</strong> means an individual whose time is recorded and verified through the Platform, typically an employee or contractor of the Customer.</li>
          <li><strong>"Worker Data"</strong> means personal information relating to Workers that is inputted into or collected by the Platform, including names, phone numbers, and GPS location data.</li>
        </ul>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>2. SERVICES</h2>

        <h3 style={styles.subheading}>2.1 Description</h3>

        <p>FLOSMOSIS provides a workforce time verification platform. The Platform:</p>

        <ul style={styles.list}>
          <li>(a) records clock-in and clock-out events for Workers via SMS-based OTP verification;</li>
          <li>(b) captures GPS coordinates at the time of clock-in and clock-out;</li>
          <li>(c) creates a verifiable, tamper-evident record of each shift event using the WLES hash chain methodology;</li>
          <li>(d) enables Supervisors to confirm and approve shift records;</li>
          <li>(e) provides the Customer with a dashboard to view, manage, and export shift records; and</li>
          <li>(f) generates reports summarising verified hours worked.</li>
        </ul>

        <h3 style={styles.subheading}>2.2 Time Verification Only</h3>

        <div style={styles.criticalBox}>
          <p><strong>CRITICAL — REPEATED SCOPE LIMITATION</strong></p>
          <p>The Platform is a <strong>time verification system only</strong>. It records and verifies hours worked. It does <strong>NOT</strong>:</p>
          <ul style={styles.list}>
            <li>(a) calculate wages, salaries, or any form of remuneration;</li>
            <li>(b) calculate or determine award entitlements, including overtime, penalty rates, shift loadings, or allowances;</li>
            <li>(c) calculate or determine superannuation contributions;</li>
            <li>(d) calculate or determine tax, PAYG withholding, or any tax obligation;</li>
            <li>(e) determine classification of Workers under any modern award or enterprise agreement;</li>
            <li>(f) provide payroll services or integrate with payroll systems;</li>
            <li>(g) guarantee compliance with the Fair Work Act 2009 (Cth), any modern award, enterprise agreement, or other industrial instrument; or</li>
            <li>(h) provide legal, tax, accounting, or employment law advice.</li>
          </ul>
          <p><strong>All such calculations, determinations, and compliance obligations are the sole responsibility of the Customer and their payroll provider.</strong> FLOSMOSIS accepts no liability for any error, omission, or failure in payroll, award compliance, superannuation, or tax arising from the Customer's use of data generated by the Platform.</p>
        </div>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>3. CUSTOMER OBLIGATIONS</h2>

        <h3 style={styles.subheading}>3.1 Accurate Data</h3>

        <p>The Customer must ensure that all Worker Data and other information provided to FLOSMOSIS is accurate, complete, and current.</p>

        <h3 style={styles.subheading}>3.2 Supervisor Training</h3>

        <p>The Customer is responsible for training its Supervisors in the proper use of the Platform, including the process for confirming shift records.</p>

        <h3 style={styles.subheading}>3.3 Payroll Responsibility</h3>

        <p>The Customer acknowledges and agrees that:</p>

        <ul style={styles.list}>
          <li>(a) the Customer is solely responsible for all payroll calculations, including wages, award entitlements, overtime, penalty rates, superannuation, and tax;</li>
          <li>(b) the Customer must not rely on the Platform as a payroll system or as a substitute for proper payroll processes;</li>
          <li>(c) any use of Shift Data from the Platform as an input to the Customer's payroll system is at the Customer's own risk; and</li>
          <li>(d) the Customer must independently verify all Shift Data before using it for any purpose, including payroll.</li>
        </ul>

        <h3 style={styles.subheading}>3.4 Award Compliance</h3>

        <p>The Customer is solely responsible for:</p>

        <ul style={styles.list}>
          <li>(a) determining the correct modern award, enterprise agreement, or other industrial instrument applicable to each Worker;</li>
          <li>(b) classifying Workers under the applicable award;</li>
          <li>(c) calculating and paying all entitlements arising under the applicable award;</li>
          <li>(d) maintaining all employment records required under section 535 of the Fair Work Act 2009 (Cth) and the Fair Work Regulations 2009 (Cth); and</li>
          <li>(e) complying with all applicable employment, workplace health and safety, and anti-discrimination legislation.</li>
        </ul>

        <p style={styles.note}><strong>Note regarding Fair Work Act record-keeping:</strong> Section 535 of the Fair Work Act 2009 requires employers to make and keep employee records for 7 years. The records required include hours of work, overtime hours, leave balances, and wages paid. FLOSMOSIS records may assist the Customer in meeting time and attendance record-keeping obligations, but <strong>the Customer remains solely responsible for maintaining all required records.</strong> FLOSMOSIS records do not, on their own, satisfy the full record-keeping obligations under the Fair Work Act.</p>

        <h3 style={styles.subheading}>3.5 Worker Consent</h3>

        <p>The Customer warrants that it has obtained (or will obtain before using the Platform) all necessary consents from Workers for:</p>

        <ul style={styles.list}>
          <li>(a) the collection and use of Worker Data by FLOSMOSIS, including personal information and GPS location data;</li>
          <li>(b) the sending of SMS messages to Workers' mobile phones for OTP verification; and</li>
          <li>(c) the storage and processing of Shift Data by FLOSMOSIS in accordance with the Privacy Policy.</li>
        </ul>

        <h3 style={styles.subheading}>3.6 Acceptable Use</h3>

        <p>The Customer must not:</p>

        <ul style={styles.list}>
          <li>(a) use the Platform for any unlawful purpose;</li>
          <li>(b) attempt to reverse engineer, decompile, or disassemble the Platform;</li>
          <li>(c) share Account credentials with unauthorised persons;</li>
          <li>(d) use the Platform in a manner that could damage, disable, or impair the Platform; or</li>
          <li>(e) attempt to access any systems or data not intended for the Customer.</li>
        </ul>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>4. SUBSCRIPTION AND PAYMENT</h2>

        <h3 style={styles.subheading}>4.1 Subscription Fee</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> The standard Subscription Fee is <strong>$499 per month</strong> (excluding GST), or as otherwise agreed in the Subscription Agreement.</li>
          <li><strong>(b)</strong> The Subscription Fee is payable monthly in advance.</li>
          <li><strong>(c)</strong> All fees are in Australian dollars and are exclusive of GST unless otherwise stated.</li>
        </ul>

        <h3 style={styles.subheading}>4.2 GST</h3>

        <p>If GST is payable on a supply made under this Agreement, the recipient must pay an additional amount equal to the GST on that supply.</p>

        <h3 style={styles.subheading}>4.3 Invoicing and Payment</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> FLOSMOSIS will issue a tax invoice to the Customer on or about the first day of each billing period.</li>
          <li><strong>(b)</strong> Payment is due within 14 days of the date of the invoice.</li>
          <li><strong>(c)</strong> If the Customer fails to pay an invoice by the due date, FLOSMOSIS may:
            <ul style={styles.nestedList}>
              <li>(i) charge interest on the outstanding amount at the rate of 2% per annum above the Reserve Bank of Australia cash rate; and</li>
              <li>(ii) suspend access to the Platform until all outstanding amounts are paid.</li>
            </ul>
          </li>
        </ul>

        <h3 style={styles.subheading}>4.4 Fee Adjustments</h3>

        <p>FLOSMOSIS may adjust the Subscription Fee by giving the Customer at least 30 days' written notice before the start of any new billing period. The Customer may terminate this Agreement if the fee increase is not acceptable.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>5. FREE TRIAL / PILOT</h2>

        <h3 style={styles.subheading}>5.1 Pilot Period</h3>

        <p>FLOSMOSIS may offer the Customer a free trial or pilot period on terms set out in a separate Pilot Agreement or as agreed in writing.</p>

        <h3 style={styles.subheading}>5.2 Pilot Terms</h3>

        <p>During any Pilot Period:</p>

        <ul style={styles.list}>
          <li>(a) the Customer may use the Platform at no cost;</li>
          <li>(b) all other provisions of these Terms apply; and</li>
          <li>(c) either Party may terminate the pilot at any time by giving 7 days' written notice.</li>
        </ul>

        <h3 style={styles.subheading}>5.3 Conversion</h3>

        <p>At the end of the Pilot Period, the Customer may elect to continue using the Platform on a paid subscription basis. If the Customer does not elect to continue, access to the Platform will be terminated and Customer Data will be available for export for 30 days.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>6. DATA</h2>

        <h3 style={styles.subheading}>6.1 Ownership of Customer Data</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> The Customer owns all Customer Data. FLOSMOSIS does not claim ownership of Customer Data.</li>
          <li><strong>(b)</strong> The Customer grants FLOSMOSIS a non-exclusive, royalty-free licence to use, store, process, and transmit Customer Data solely for the purpose of providing the Platform and the services under this Agreement.</li>
        </ul>

        <h3 style={styles.subheading}>6.2 Data Processing</h3>

        <p>FLOSMOSIS processes Customer Data in accordance with the Privacy Policy and the Australian Privacy Principles under the Privacy Act 1988 (Cth).</p>

        <h3 style={styles.subheading}>6.3 Data Security</h3>

        <p>FLOSMOSIS implements reasonable security measures to protect Customer Data, including:</p>

        <ul style={styles.list}>
          <li>(a) encryption of data in transit (TLS/SSL);</li>
          <li>(b) encryption of data at rest;</li>
          <li>(c) access controls and authentication;</li>
          <li>(d) the WLES hash chain verification methodology, which creates tamper-evident records; and</li>
          <li>(e) regular security reviews.</li>
        </ul>

        <p style={styles.note}><strong>Note:</strong> While the WLES hash chain provides a mechanism for detecting tampering with shift records, FLOSMOSIS does not warrant that the hash chain constitutes legally admissible evidence in any court or tribunal, or that it satisfies any specific evidentiary standard. The probative value of WLES records in legal proceedings is a matter for the relevant court or tribunal.</p>

        <h3 style={styles.subheading}>6.4 Data Retention</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> FLOSMOSIS retains Customer Data for the term of this Agreement and for a period of 90 days after termination, during which the Customer may export the data.</li>
          <li><strong>(b)</strong> After the 90-day post-termination period, FLOSMOSIS will delete Customer Data in accordance with the Privacy Policy, unless retention is required by law.</li>
        </ul>

        <h3 style={styles.subheading}>6.5 Data Export</h3>

        <p>The Customer may export Customer Data at any time during the term of this Agreement and for 90 days after termination, in a standard machine-readable format (CSV or JSON).</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>7. PRIVACY</h2>

        <h3 style={styles.subheading}>7.1 Privacy Policy</h3>

        <p>FLOSMOSIS collects, uses, and discloses personal information in accordance with its Privacy Policy, which is available on the FLOSMOSIS website and forms part of these Terms.</p>

        <h3 style={styles.subheading}>7.2 Worker Personal Information</h3>

        <p>The Customer acknowledges that the Platform collects Worker personal information, including:</p>

        <ul style={styles.list}>
          <li>(a) names and phone numbers (for OTP verification);</li>
          <li>(b) GPS location data (captured at clock-in and clock-out); and</li>
          <li>(c) shift records.</li>
        </ul>

        <h3 style={styles.subheading}>7.3 GPS Data</h3>

        <p>GPS location data is collected for the sole purpose of verifying that a Worker is at the designated worksite at the time of clock-in or clock-out. FLOSMOSIS does not track Workers' locations between clock-in and clock-out events.</p>

        <h3 style={styles.subheading}>7.4 Third Party Processors</h3>

        <p>FLOSMOSIS uses the following third-party service providers to process Customer Data:</p>

        <ul style={styles.list}>
          <li><strong>(a) Supabase</strong> — data storage and database hosting;</li>
          <li><strong>(b) Twilio</strong> — SMS delivery for OTP verification;</li>
          <li><strong>(c) Resend</strong> — email delivery;</li>
          <li><strong>(d) Vercel</strong> — application hosting.</li>
        </ul>

        <p>These providers are subject to their own privacy and security policies. FLOSMOSIS has selected these providers based on their security posture and compliance capabilities.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>8. INTELLECTUAL PROPERTY</h2>

        <h3 style={styles.subheading}>8.1 FLOSMOSIS IP</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> FLOSMOSIS owns all Intellectual Property in and relating to the Platform, including the WLES specification, the software, the user interface, all documentation, and all modifications and improvements.</li>
          <li><strong>(b)</strong> Nothing in this Agreement transfers any Intellectual Property in the Platform or WLES to the Customer.</li>
        </ul>

        <h3 style={styles.subheading}>8.2 Customer Data</h3>

        <p>As stated in clause 6.1, the Customer owns all Customer Data.</p>

        <h3 style={styles.subheading}>8.3 Feedback</h3>

        <p>If the Customer provides suggestions, ideas, or feedback regarding the Platform (<strong>Feedback</strong>), FLOSMOSIS may use the Feedback for any purpose without obligation to the Customer.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>9. LIMITATION OF LIABILITY</h2>

        <h3 style={styles.subheading}>9.1 Cap on Liability</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> To the maximum extent permitted by law, the total aggregate liability of FLOSMOSIS under or in connection with this Agreement (whether in contract, tort (including negligence), statute, or otherwise) is limited to the total Subscription Fees paid by the Customer to FLOSMOSIS in the 3-month period immediately preceding the event giving rise to the liability.</li>
          <li><strong>(b)</strong> During any Pilot Period where no Subscription Fees have been paid, FLOSMOSIS's liability is limited to $100.</li>
        </ul>

        <h3 style={styles.subheading}>9.2 Exclusion of Consequential Loss</h3>

        <p>To the maximum extent permitted by law, FLOSMOSIS excludes all liability for:</p>

        <ul style={styles.list}>
          <li>(a) indirect, consequential, special, or incidental loss or damage;</li>
          <li>(b) loss of profit, revenue, or anticipated savings;</li>
          <li>(c) loss of data (other than Customer Data held by FLOSMOSIS, subject to clause 9.1);</li>
          <li>(d) loss of goodwill or reputation;</li>
          <li>(e) loss arising from business interruption; and</li>
          <li>(f) any claim by a third party against the Customer.</li>
        </ul>

        <h3 style={styles.subheading}>9.3 Specific Exclusions — Payroll and Compliance</h3>

        <div style={styles.criticalBox}>
          <p><strong>CRITICAL — SPECIFIC EXCLUSIONS</strong></p>
          <p>Without limiting clauses 9.1 and 9.2, FLOSMOSIS <strong>specifically excludes all liability</strong> for:</p>
          <ul style={styles.list}>
            <li>(a) any error, omission, or miscalculation in the Customer's payroll, wages, or remuneration calculations;</li>
            <li>(b) any failure by the Customer to comply with any modern award, enterprise agreement, or industrial instrument;</li>
            <li>(c) any error or omission in the calculation or payment of superannuation contributions;</li>
            <li>(d) any error or omission in the calculation or payment of tax, PAYG withholding, or any other tax obligation;</li>
            <li>(e) any claim, penalty, or liability arising under the Fair Work Act 2009 (Cth) or any other employment legislation as a result of the Customer's payroll or compliance failures;</li>
            <li>(f) any claim by a Worker against the Customer in respect of underpayment, non-payment, or incorrect payment of wages or entitlements; and</li>
            <li>(g) any loss arising from the Customer's reliance on Shift Data for any purpose other than as a record of verified hours worked.</li>
          </ul>
        </div>

        <h3 style={styles.subheading}>9.4 Australian Consumer Law</h3>

        <ul style={styles.list}>
          <li><strong>(a)</strong> Nothing in this Agreement excludes, restricts, or modifies any right or remedy, or any guarantee, condition, or warranty implied or imposed by the Australian Consumer Law or any other applicable law that cannot lawfully be excluded.</li>
          <li><strong>(b)</strong> To the extent permitted by law (including section 64A of the ACL), where FLOSMOSIS's liability cannot be excluded, it is limited (at FLOSMOSIS's option) to:
            <ul style={styles.nestedList}>
              <li>(i) the supply of the services again; or</li>
              <li>(ii) the payment of the cost of having the services supplied again.</li>
            </ul>
          </li>
          <li><strong>(c)</strong> <strong>⚠️ Compliance note:</strong> The unfair contract terms provisions of the ACL (Part 2-3) apply to standard form contracts with small businesses (annual turnover less than $10 million or fewer than 100 employees as of the 2023 amendments). FLOSMOSIS's Terms of Service may be a standard form contract. Terms that create a significant imbalance in the parties' rights, are not reasonably necessary to protect FLOSMOSIS's legitimate interests, and would cause detriment to the Customer may be declared void. Maximum penalties for proposing, applying, or relying on unfair terms are up to $50 million per contravention. These Terms have been drafted with this requirement in mind.</li>
        </ul>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>10. INDEMNITY</h2>

        <h3 style={styles.subheading}>10.1 Customer Indemnity</h3>

        <p>The Customer indemnifies and holds harmless FLOSMOSIS, its directors, officers, employees, and agents from and against all claims, demands, actions, liabilities, losses, damages, costs, and expenses (including reasonable legal costs) arising from or in connection with:</p>

        <ul style={styles.list}>
          <li>(a) the Customer's breach of any obligation under these Terms;</li>
          <li>(b) the Customer's failure to comply with any applicable law, modern award, enterprise agreement, or industrial instrument in relation to the payment of wages, superannuation, or other entitlements to Workers;</li>
          <li>(c) any claim by a Worker or former Worker relating to underpayment, non-payment, or incorrect payment of wages or entitlements;</li>
          <li>(d) the Customer's failure to obtain Worker consent as required under clause 3.5;</li>
          <li>(e) any inaccuracy in Customer Data or Worker Data provided by the Customer; and</li>
          <li>(f) any third party claim arising from the Customer's use of the Platform.</li>
        </ul>

        <h3 style={styles.subheading}>10.2 Fairness of Indemnity</h3>

        <p><strong>⚠️ ACL compliance note:</strong> This indemnity is limited to claims arising from the Customer's own acts, omissions, or breaches. It does not extend to claims caused by FLOSMOSIS's negligence, breach, or default. This limitation is intended to ensure the indemnity is not unfair within the meaning of Part 2-3 of the ACL.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>11. TERMINATION</h2>

        <h3 style={styles.subheading}>11.1 Termination by Customer</h3>

        <p>The Customer may terminate this Agreement:</p>

        <ul style={styles.list}>
          <li>(a) at any time by giving FLOSMOSIS at least 30 days' written notice; or</li>
          <li>(b) immediately, if FLOSMOSIS materially breaches this Agreement and fails to remedy the breach within 14 days of receiving written notice of the breach.</li>
        </ul>

        <h3 style={styles.subheading}>11.2 Termination by FLOSMOSIS</h3>

        <p>FLOSMOSIS may terminate this Agreement:</p>

        <ul style={styles.list}>
          <li>(a) immediately, if the Customer materially breaches this Agreement and fails to remedy the breach within 14 days of receiving written notice of the breach;</li>
          <li>(b) immediately, if the Customer fails to pay any invoice within 30 days of the due date;</li>
          <li>(c) immediately, if the Customer becomes insolvent, enters administration, receivership, or liquidation, or is otherwise unable to pay its debts as they fall due; or</li>
          <li>(d) by giving the Customer at least 90 days' written notice (without cause).</li>
        </ul>

        <h3 style={styles.subheading}>11.3 Effect of Termination</h3>

        <p>On termination:</p>

        <ul style={styles.list}>
          <li>(a) the Customer's access to the Platform will be suspended or terminated;</li>
          <li>(b) FLOSMOSIS will make Customer Data available for export for 90 days (see clause 6.4);</li>
          <li>(c) any outstanding Subscription Fees remain payable;</li>
          <li>(d) clauses 6.1 (data ownership), 8 (IP), 9 (liability), 10 (indemnity), 12 (confidentiality), and 14 (governing law) survive termination; and</li>
          <li>(e) prepaid but unused Subscription Fees for the period after the effective date of termination will be refunded on a pro rata basis.</li>
        </ul>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>12. CONFIDENTIALITY</h2>

        <h3 style={styles.subheading}>12.1 Obligations</h3>

        <p>Each Party must keep confidential the other Party's Confidential Information and must not disclose it to any third party without prior written consent, except:</p>

        <ul style={styles.list}>
          <li>(a) to the extent required by law;</li>
          <li>(b) to its professional advisers in confidence;</li>
          <li>(c) to its employees, contractors, or agents who need to know for the purposes of this Agreement; or</li>
          <li>(d) information that is or becomes publicly available other than through a breach of this clause.</li>
        </ul>

        <h3 style={styles.subheading}>12.2 Survival</h3>

        <p>This clause 12 survives termination of this Agreement for a period of 3 years.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>13. DISPUTE RESOLUTION</h2>

        <h3 style={styles.subheading}>13.1 Negotiation</h3>

        <p>Any dispute arising under or in connection with these Terms must first be the subject of good faith negotiation for a period of not less than 20 Business Days.</p>

        <h3 style={styles.subheading}>13.2 Mediation</h3>

        <p>If a dispute is not resolved by negotiation, either Party may refer the dispute to mediation administered by the Australian Disputes Centre (ADC).</p>

        <h3 style={styles.subheading}>13.3 Court Proceedings</h3>

        <p>If a dispute is not resolved by mediation within 40 Business Days of referral, either Party may commence court proceedings.</p>

        <h3 style={styles.subheading}>13.4 Continued Performance</h3>

        <p>Despite the existence of a dispute, each Party must continue to perform its obligations under this Agreement.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>14. GOVERNING LAW</h2>

        <h3 style={styles.subheading}>14.1 Governing Law</h3>

        <p>These Terms are governed by the laws of New South Wales.</p>

        <h3 style={styles.subheading}>14.2 Jurisdiction</h3>

        <p>Each Party submits to the non-exclusive jurisdiction of the courts of New South Wales and courts hearing appeals from those courts.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>15. GENERAL</h2>

        <h3 style={styles.subheading}>15.1 Amendment</h3>

        <p>FLOSMOSIS may amend these Terms by giving the Customer at least 30 days' written notice. If the Customer does not agree to the amended Terms, the Customer may terminate this Agreement.</p>

        <h3 style={styles.subheading}>15.2 Assignment</h3>

        <p>The Customer may not assign its rights under this Agreement without FLOSMOSIS's prior written consent. FLOSMOSIS may assign its rights and obligations under this Agreement to a related body corporate or in connection with a sale of its business.</p>

        <h3 style={styles.subheading}>15.3 Waiver</h3>

        <p>A waiver of any right under this Agreement is only effective if it is in writing.</p>

        <h3 style={styles.subheading}>15.4 Severability</h3>

        <p>If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions continue in full force and effect.</p>

        <h3 style={styles.subheading}>15.5 Entire Agreement</h3>

        <p>These Terms, together with the Subscription Agreement, Privacy Policy, and any Pilot Agreement, constitute the entire agreement between the Parties in relation to the services provided by FLOSMOSIS.</p>

        <h3 style={styles.subheading}>15.6 Notices</h3>

        <p>All notices under these Terms must be in writing and may be sent by email to the email addresses provided by each Party.</p>

        <h3 style={styles.subheading}>15.7 Force Majeure</h3>

        <p>Neither Party is liable for any failure to perform its obligations under this Agreement to the extent that the failure is caused by circumstances beyond its reasonable control (including natural disasters, government actions, and internet or telecommunications failures), provided that the affected Party notifies the other Party promptly and uses reasonable efforts to mitigate the effect.</p>

        <hr style={styles.divider} />

        <h2 style={styles.heading}>16. UNFAIR CONTRACT TERMS COMPLIANCE STATEMENT</h2>

        <p>These Terms of Service have been drafted with regard to the unfair contract terms provisions of the Australian Consumer Law (ACL), Part 2-3. In particular:</p>

        <ul style={styles.list}>
          <li>(a) Limitation of liability and exclusion clauses (clauses 9 and 10) are drafted to be proportionate and to protect FLOSMOSIS's legitimate commercial interests without creating a significant imbalance in the Parties' rights.</li>
          <li>(b) Termination provisions (clause 11) provide balanced rights to both Parties.</li>
          <li>(c) Fee adjustment provisions (clause 4.4) provide the Customer with the right to terminate if a fee increase is not acceptable.</li>
          <li>(d) Amendment provisions (clause 15.1) provide the Customer with notice and the right to terminate if amendments are not acceptable.</li>
          <li>(e) The indemnity (clause 10) is limited to the Customer's own acts and omissions.</li>
        </ul>

        <p>If any provision of these Terms is found to be an unfair term under the ACL, that provision will be void and severed from these Terms, and the remaining provisions will continue to apply.</p>

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
  importantBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    padding: '20px',
    borderRadius: '4px',
    marginBottom: '20px',
  },
  criticalBox: {
    backgroundColor: 'rgba(255, 100, 100, 0.08)',
    border: '1px solid rgba(255, 100, 100, 0.25)',
    padding: '20px',
    borderRadius: '4px',
    marginBottom: '20px',
  },
  list: {
    marginLeft: '20px',
    marginBottom: '15px',
  },
  nestedList: {
    marginLeft: '20px',
    marginTop: '10px',
  },
  definitionList: {
    marginLeft: '20px',
    marginBottom: '15px',
    listStyleType: 'none',
  },
  note: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '20px',
    fontSize: '14px',
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
