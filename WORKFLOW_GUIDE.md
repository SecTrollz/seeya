# Sales Pipeline Workflows

Complete end-to-end solution: from automated lead generation via legislation parsing, through prescreening and verification, to invoice generation and payment collection.

## Architecture Overview

Two complementary n8n workflows orchestrate the sales process:

### **Workflow 1: Lead-to-Invoice Pipeline** (`wf1.ts`)
Handles inbound lead conversion: captures interest, verifies phone, qualifies prospects, documents agreements, generates invoices.

**Trigger:** Public form submission (lead intake)

**Flow:**
1. **Intake Form** → Collect name, email, phone, company, request details, consent
2. **Service Config** → Normalize phone to E.164, load business/service settings
3. **Save Raw Lead** → Persist to Leads Pipeline data table
4. **Twilio Call + OTP** → Simultaneous outbound call and SMS verification code
5. **Verify Phone** → Lead enters code; timeout 15 minutes
6. **Conditional Branch** → If verified, proceed; else nurture queue
7. **Prescreening Form** → Timeline, budget, decision-maker status (2-hour timeout)
8. **Score & Qualify** → Calculate 0-3 score; auto-disqualify if budget="No"
9. **Conditional Branch** → If qualified (score ≥2), continue; else nurture
10. **Service Agreement Form** → Accept terms, electronic signature, 24-hour timeout
11. **Stripe Workflow** → Create customer, draft invoice, add line item, finalize + email
12. **Success Page** → Display invoice link, payment link, terms
13. **Persist Results** → All records saved to data table at each stage

**Data Table:** Leads Pipeline (29 columns)
- Core fields: lead_ref, full_name, email, phone, company, request_details
- Consent tracking: consent_text, consent_at
- Call/OTP state: call_sid, otp_status, otp_verified_at
- Prescreen: pq_timeline, pq_budget, pq_decision_maker, prescreen_score, qualified
- Agreement: agreement_version, agreement_signature, agreement_accepted_at
- Invoice: stripe_customer_id, stripe_invoice_id, invoice_url, invoice_status
- Operational: status, followup_count, last_followup_at

**Key Features:**
- Phone normalization: accepts (555) 123-4567, 5551234567, +1 555 123 4567 → E.164
- Twilio Verify integration: OTP via SMS with 15-minute timeout
- Conditional logic: auto-qualification/disqualification based on answers
- Stripe integration: multi-step invoice creation with audit trail
- Resumable timeouts: forms re-open if lead doesn't complete
- Audit trail: every step persisted

---

### **Workflow 2: Lead Scraping & Targeting** (`wf2_lead_scraping.ts`)
Automates prospect discovery: parses legislation, identifies target businesses, enriches data, scores alignment, filters qualified prospects.

**Trigger:** Legislation upload (PDF/text) or API webhook

**Flow:**
1. **Legislation Input** → Accept regulation text, title, URL
2. **Parse Content** → Extract industries, keywords, scope summary
3. **Crunchbase Search** → Query for businesses in target industries
4. **Enrich Prospects** → Loop: fetch company details, web presence, employee count
5. **Score Alignment** → Compare business profile to compliance keywords (0-10 scale)
6. **Filter Qualified** → Condition: score ≥6 AND 50+ employees → qualified
7. **Fetch Contacts** → Clearbit API for phone, founding date, location
8. **Find Decision-Makers** → LinkedIn/web search for executive titles/names
9. **Prepare Lead** → Format prospect as pre-qualified lead record
10. **Save Qualified** → Insert to Leads Pipeline with status=auto_qualified
11. **Save Borderline** → Score 4-5.9 sent to Scrape Queue for manual review
12. **Summarize** → Report # qualified, # review, regulation processed

**Data Tables:**
- **Leads Pipeline** → Same table as Workflow 1; auto-generated leads tagged source=legislation_scrape
- **Scrape Queue** → Separate table for borderline prospects (4-5.9 score) awaiting manual review

**Key Features:**
- Industry-keyword matching: auto-detects businesses likely needing compliance services
- Multi-source enrichment: Crunchbase (company data) + Clearbit (contacts) + web (executives)
- Conditional qualification: score + employee size gates
- Audit trail: all prospects tracked in queue or leads table
- Manual review layer: borderline prospects don't auto-qualify; require human validation

---

## Integration: How They Work Together

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEAD SOURCES                                  │
├─────────────────────────────────────────────────────────────────┤
│  (1) Organic: Public intake form → Workflow 1 (lead-to-invoice)  │
│  (2) Automated: Legislation upload → Workflow 2 (scrape)         │
└─────────────────────────────────────────────────────────────────┘
                           ↓
                    [LEADS PIPELINE]
                   (unified data table)
                           ↓
        ┌───────────────────┬───────────────────┐
        ↓                   ↓                   ↓
   [Qualified]       [Borderline]         [Nurture]
   (score ≥6,        (4-5.9 score,     (unqualified,
    verified)        awaiting review)    for followup)
        ↓                   ↓                   ↓
   Auto-call +         Manual review      Nurture email
   OTP → Prescr        + approve/deny     sequences
   → Agreement
   → Invoice
```

### Lead Status Lifecycle

**Organic Leads (Workflow 1):**
```
new → verified → prescreened → qualified/nurture → agreement_signed → invoice_sent → paid
```

**Auto-Generated Leads (Workflow 2):**
```
auto_qualified → (call + OTP) → prescreened → agreement → invoice
(awaiting_call)

OR (borderline):
review_needed → (manual approval) → (if approved, same as above)
```

---

## Setup Checklist

### Prerequisites
- [ ] n8n workspace with SDK enabled
- [ ] Twilio account with phone number + Verify Service
- [ ] Stripe account with API keys
- [ ] Crunchbase API key (for Workflow 2)
- [ ] Clearbit API token (for Workflow 2)
- [ ] n8n webhook URL (for Workflow 2 input)

### Workflow 1: Lead-to-Invoice
1. **Create Leads Pipeline data table** (29 columns per spec in wf1.ts comments)
2. **Configure credentials in n8n:**
   - Stripe API key → Add to stripeCred
   - Twilio Account SID + Auth Token → Add to twilioCred
3. **Edit serviceConfig node** (lines 50-57 in wf1.ts):
   - business_name: Your business name
   - twilio_from_number: Your verified Twilio number (+1 555 000 0000)
   - twilio_verify_sid: Your Verify Service SID (VA...)
   - service_name: Your service offering
   - price_usd: Your service price
   - days_until_due: Payment terms (e.g., 7)
   - agreement_terms_html: Your full service agreement terms
4. **Deploy workflow** and test with form Test URL
5. **Activate workflow** for production

### Workflow 2: Lead Scraping
1. **Create Scrape Queue data table** (4 columns: prospect_ref, business_name, domain, alignment_score, status)
2. **Configure credentials in n8n:**
   - Crunchbase API key → Add to searchCrunchbaseBusinesses
   - Clearbit API token → Add to findProspectContacts
3. **Set webhook URL** in legislationInput trigger
4. **Configure target industries** in parseRegulationContent (currently hardcoded; make dynamic)
5. **Test workflow** with sample legislation text
6. **Activate workflow** for scheduled or webhook-triggered processing

---

## Usage Examples

### Example 1: Organic Lead Conversion (Workflow 1)

**User Action:** Visits public form, submits inquiry for "Help with environmental compliance"

**System Flow:**
1. Form captures: Jane Doe, jane@company.com, 555-123-4567, "Acme Corp", "Need audit help"
2. Phone normalized to +15551234567
3. Lead saved to table with status='new'
4. Simultaneous: Twilio calls Jane (IVR says "You will receive a verification code"), SMS sends code
5. Jane enters code in form within 15 minutes
6. OTP validated; status updated to verified
7. Prescreening form: Timeline="Within 30 days", Budget="Yes", Decision-maker="Yes"
8. Score calculated: 3/3 = qualified
9. Agreement form: Jane accepts terms, signs name "Jane Doe"
10. Stripe invoice created: $500 due in 7 days, sent to jane@company.com
11. Success page displays payment link + terms
12. All records persisted; status="invoice_sent"

**CRM Outcome:** Jane's lead record shows full audit trail: consent, verification, qualification, agreement, invoice. Sales team monitors invoice status and follows up if overdue.

---

### Example 2: Auto-Generated Prospect (Workflow 2)

**User Action:** Uploads "Environmental Compliance Act 2026" legislation text

**System Flow:**
1. Legislation parsed; industries identified: environmental, construction, manufacturing
2. Crunchbase search for companies in those industries
3. Results: 50 companies found (ABC Env Corp, Greenfield LLC, EcoTech Inc, ...)
4. Each enriched: employee count, web presence, compliance keywords matched
5. Scoring:
   - ABC Env Corp (85 emp, high keyword match): score 8.5 ✓ qualified
   - Greenfield LLC (25 emp): score 5.2 ✗ borderline (too small)
   - EcoTech Inc (120 emp, moderate match): score 5.8 ✗ borderline
6. Qualified leads (score ≥6 + 50+ emp): 12 prospects
7. Each qualified prospect:
   - Fetched executive titles from Clearbit
   - Lead record created with company info + decision-maker title
   - Saved to Leads Pipeline with status='auto_qualified'
8. Borderline prospects: 18 saved to Scrape Queue for manual review
9. Summary: "12 qualified prospects from Act 2026 ready for outreach; 18 in review queue"

**CRM Outcome:** Sales team sees 12 new pre-qualified leads from legislation scrape. Can immediately schedule calls (triggering Workflow 1 outbound sequence). Borderline leads held for human review before approving.

---

## Advanced Tuning

### Scoring Weights (Workflow 2)
Currently: +2 per keyword match, +engagement_score, max 10

**Adjust in scoreProspects node:**
```javascript
// Increase weight for high-value signals
keywords.forEach(k => { if (text.includes(k)) score += 3; }); // was 2
// Boost large companies
if (employees > 250) score += 2;
// Penalize certain industries
if (industries.includes('unrelated')) score -= 2;
```

### Lead Status Routing
Add conditional nodes after qualification to:
- Auto-trigger cold email sequence for borderline leads
- Schedule automatic outbound calls for qualified leads at off-peak hours
- Queue VIP prospects (certain industries/sizes) for dedicated account manager

### Legislation Parsing Enhancement
Replace hardcoded keywords with:
- NLP-based extraction (e.g., OpenAI API to summarize regulation)
- Regulatory database lookup (map act names to industry codes)
- Keyword weight tuning based on historical conversion rates

---

## Data Privacy & Compliance

- **Consent:** Workflow 1 captures explicit consent before any outreach
- **Audit Trail:** All lead activity persisted in data tables
- **GDPR:** Auto-generated leads from Workflow 2 treated as prospects (not contacted until explicit opt-in)
- **CAN-SPAM:** All outbound emails via Stripe (invoice) and manual follow-up require unsubscribe link
- **Rate Limiting:** API calls throttled to avoid reputation damage or IP blocking

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| OTP not received | Twilio Verify SID invalid | Verify SID format: VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (32 chars) |
| Phone normalization fails | Unsupported format | Update regex in serviceConfig; test with +1-555-123-4567 |
| Stripe invoice not sent | API key missing scope | Check key has invoicing permissions; re-authenticate |
| Crunchbase returns 0 results | Industries not found | Update industry list in parseRegulationContent to common terms |
| Decision-maker LinkedIn lookup fails | Privacy/bot detection | Add delays between requests; consider paid LI API subscription |

---

## Next Steps

1. ✅ Create workflows in n8n (code ready)
2. ⬜ Deploy Workflow 1 and test with live Twilio + Stripe credentials
3. ⬜ Deploy Workflow 2 and calibrate scoring thresholds
4. ⬜ Monitor conversion rates: organic vs auto-generated leads
5. ⬜ Iterate scoring weights based on close rates
6. ⬜ Add analytics dashboard tracking lead source → conversion
