# End-to-End Sales & Compliance Operations Guide

Complete playbook for running a 3-workflow lead-generation, outreach, and invoicing system. Handles organic leads, auto-generated prospects from legislation, and compliance service sales.

---

## System Architecture

```
                    ┌─────────────────────────────────────┐
                    │  THREE LEAD SOURCES                 │
                    └──────────┬──────────────────────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
        ┌───────▼─────┐ ┌──────▼──────┐ ┌────▼──────────┐
        │  Organic     │ │   Lead      │ │ Legislative   │
        │  Intake Form │ │  Scraping   │ │  Auto-Hunter  │
        │  (WF1)       │ │  (WF2)      │ │  (WF3)        │
        └───────┬─────┘ └──────┬──────┘ └────┬──────────┘
                │              │              │
                └──────────────┼──────────────┘
                               │
                    ┌──────────▼───────────┐
                    │  LEADS PIPELINE      │
                    │  (Unified Data       │
                    │   Table)             │
                    └──────────┬───────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
        ┌───────▼──────┐ ┌─────▼──────┐ ┌───▼────────┐
        │ Auto-Call    │ │  Manual    │ │  Nurture   │
        │ + OTP →      │ │  Review    │ │  Sequence  │
        │ Prescr →     │ │  Approval  │ │  (Email)   │
        │ Agreement →  │ │ + Outreach │ │            │
        │ Invoice      │ │            │ │            │
        └───────┬──────┘ └─────┬──────┘ └───┬────────┘
                │              │              │
                └──────────────┼──────────────┘
                               │
                    ┌──────────▼───────────┐
                    │  STRIPE INVOICING    │
                    │  (Auto-send after    │
                    │   consent)           │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  PAYMENT COLLECTION  │
                    └──────────────────────┘
```

---

## Workflow Details

### **Workflow 1: Lead-to-Invoice** (Inbound + Form-Driven)

**When it runs:** Triggered by lead submitting the public form or calling intake number

**What happens:**
1. Lead fills form: name, email, phone, company, request details, consent
2. Phone normalized to E.164 format (handles any input format)
3. Twilio call placed + SMS OTP sent simultaneously
4. Lead enters 6-digit code within 15 minutes
5. If verified, leads to 2-question prescreening (timeline, budget, decision-maker)
6. Auto-scored: 0-3 points; auto-disqualified if budget="No"
7. If qualified (score ≥2), lead sees 24-hour service agreement form
8. Lead types name as electronic signature + accepts terms
9. Stripe invoice auto-created: amount, due date, payment link
10. Success page displays invoice; lead can pay immediately
11. All records persisted in Leads Pipeline table

**Output:**
- Verified, qualified leads ready for service delivery
- Complete audit trail (consent, verification, agreement, invoice)
- Stripe invoice sent; payment tracked

**Customization needed:**
- Stripe API key
- Twilio Account SID, Auth Token, verified phone number, Verify Service SID
- Service name, price, agreement terms (editable in serviceConfig node)

**Time to implementation:** 2-3 hours (mostly credential setup)

---

### **Workflow 2: Lead Scraping & Targeting** (Legislation-Triggered)

**When it runs:** Manually triggered (via webhook or scheduled), usually triggered by Workflow 3

**What happens:**
1. Accept legislation upload (text or PDF content)
2. Parse document; extract keywords, identify target industries
3. Search Crunchbase for businesses in those industries
4. Enrich each prospect: web presence, employee count, company details
5. Score alignment (0-10): +2 per compliance keyword match, +engagement score
6. Filter: score ≥6 AND 50+ employees = auto-qualified
7. Look up phone/address via Clearbit + web search
8. Find executive titles (CEO, COO, compliance officer)
9. Create lead records pre-populated with company info
10. Save qualified leads to Leads Pipeline (auto_qualified status)
11. Save borderline (4-5.9 score) to Scrape Queue for human review
12. Notify: "X qualified prospects ready for outreach"

**Output:**
- Pre-qualified leads, ready for auto-call sequence from Workflow 1
- Borderline leads held in review queue
- Audit trail of source, score, keywords matched

**Customization needed:**
- Crunchbase API key
- Clearbit API token
- Target industries (currently: federal contractors, construction, trucking, healthcare, manufacturing, staffing, professional services)

**Time to implementation:** 2-3 hours (API setup)

---

### **Workflow 3: Legislative Impact Generator** (Weekly Automated Hunter)

**When it runs:** Every Monday 7am (automatic); manual invoice sending (form-based)

**Automatic part (Monday):**
1. Fetch upcoming federal rules from Federal Register API
2. Search news for recent legislation affecting SMBs
3. AI identifies top 5 costliest changes + compliance service opportunities
4. For each change, AI extracts business categories (e.g., "trucking company", "dental practice")
5. Search Google: "[category] in [location]"
6. AI extracts real business names (skips duplicates from prior weeks, caps at 10 new)
7. For each business:
   - Lookup BBB profile (rating, years in business)
   - Search for phone, website, address
   - Generate full JSON compliance report with priorities, deadlines, financial exposure
   - Save report to Legislative Reports table
   - Post lead alert to Discord (business name, phone, legislation change, estimated impact)
   - Save to Google Sheets

**Manual part (your sales team calls):**
8. Sales rep reviews lead in Discord or Google Sheets
9. Rep calls business using AI-generated call script (never sounds like government)
10. Rep explains what changed in law, why it affects them, and your compliance service
11. Rep pitches "Compliance Navigator" package ($2,500-$7,500 based on complexity)
12. If business agrees:
    - Rep fills "Send Invoice" form with business name, email, service, agreed price
    - **Rep must check "customer explicitly agreed to this service and price"**
13. Submit form → Workflow auto-creates Stripe invoice, emails to business, posts confirmation to Discord

**Output:**
- Weekly list of 10-50 new qualified business prospects by legislation
- Full compliance reports ready for sales calls
- Auto-invoicing after consent; payment tracked

**Customization needed:**
- NewsAPI key
- BBB API key
- Stripe API key
- Discord webhooks for 3 channels: law summary, new leads, administrative
- Google Sheets connection + designated spreadsheet
- Location (currently: Alamance County, NC ZIP 27244; edit in Settings node)

**Time to implementation:** 3-4 hours (API + Discord + Sheets setup)

---

## Lead Lifecycle

### **Organic Lead (Form → Workflow 1)**
```
Form Submission
    ↓
Phone Verified (OTP)
    ↓
Prescreened + Scored (auto-pass/fail)
    ↓
[IF QUALIFIED]
    ├→ Service Agreement Signed
    │   ↓
    │   Invoice Created + Emailed
    │   ↓
    │   Payment Link Sent
    │   ↓
    │   Payment Received → Service Delivery
    │
[IF NOT QUALIFIED]
    └→ Nurture Queue (follow-up email)
```

### **Auto-Generated Lead (Legislation → Workflow 3)**
```
Law Change Detected (Monday)
    ↓
Prospect Research (10 businesses found)
    ↓
Report Generated + Call Script
    ↓
Sales Rep Calls (Monday-Friday)
    ↓
[IF AGREES]
    ├→ Invoice Form Submitted (consent checked)
    │   ↓
    │   Stripe Invoice Created
    │   ↓
    │   Email Sent to Business
    │   ↓
    │   Payment Link Active
    │   ↓
    │   Payment Received → Service Delivery
    │
[IF DECLINES]
    └→ Nurture Sequence (periodic emails about changes)
```

### **Scraped Lead (Legislation → Workflow 2)**
```
Legislation Uploaded
    ↓
Businesses Identified (50+ found)
    ↓
Scored + Filtered
    ↓
[IF SCORE ≥6 & 50+ EMP]
    ├→ Auto-Qualified Lead Created
    │   ↓
    │   Added to Leads Pipeline
    │   ↓
    │   Awaiting Outreach Call
    │   ↓
    │   [Routes to Workflow 1 for auto-call sequence]
    │
[IF SCORE 4-5.9]
    └→ Scrape Queue (awaiting manual review + approval)
```

---

## Daily/Weekly Operations Checklist

### **Daily (Sales Team)**
- [ ] Review new leads in Leads Pipeline (status=auto_qualified or =verified)
- [ ] Call top 5 leads per Workflow 1 or Workflow 3 call scripts
- [ ] Record call outcomes in CRM notes
- [ ] For any who agreed, fill Invoice Form and submit
- [ ] Monitor Stripe dashboard for payments received

### **Monday Morning (7am+)**
- [ ] Workflow 3 runs automatically
- [ ] Review Discord #law-summary for new legislation summary
- [ ] Review Discord #leads for new prospect alerts (10 businesses)
- [ ] Read full reports in Google Sheets
- [ ] Assess leads: high-priority calls vs. nurture
- [ ] Add to sales team call list

### **Weekly (Management)**
- [ ] Review conversion rate: organic vs auto-generated vs scraped leads
- [ ] Track average deal size ($2,500-$7,500)
- [ ] Monitor invoice send rate vs payment rate
- [ ] Adjust scoring thresholds in Workflow 2/3 based on close rate
- [ ] Update Workflow 3 target industries if new legislation emerges

---

## Configuration & Credentials

### **All Workflows**
- [ ] Stripe API key (secret key, production or test mode)
- [ ] Discord webhook URLs (3: law summary, leads, administrative)

### **Workflow 1 Only**
- [ ] Twilio Account SID + Auth Token
- [ ] Twilio verified phone number (e.g., +1 555 000 0000)
- [ ] Twilio Verify Service SID (format: VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
- [ ] Stripe customer creation + invoice generation (included in API key)

### **Workflow 2 Only**
- [ ] Crunchbase API key + basic search endpoint
- [ ] Clearbit API token (for company enrichment)

### **Workflow 3 Only**
- [ ] NewsAPI key (newsapi.org)
- [ ] BBB API key or web scraper endpoint
- [ ] Google Sheets connection + designated spreadsheet
- [ ] Discord user account (for channel selection)

---

## Tuning & Optimization

### **Scoring Adjustments (Workflow 2 & 3)**
Current scoring in Workflow 2 (compliance alignment):
```javascript
// Per keyword match: +2 points (edit in scoreProspects node)
// Employee size bonus: +1 for 50-100, +2 for 100-250, +3 for 250+
// Max score: 10
// Qualification threshold: ≥6
```

**To increase deal quality (fewer prospects, higher close rate):**
- Raise threshold from 6 → 7 (or 8)
- Increase keyword weight: +2 → +3
- Add employee size minimum: 100+ (not 50+)
- Filter out industries: exclude "not-applicable" keywords

**To increase volume (more prospects, likely lower close rate):**
- Lower threshold from 6 → 5 (or 4)
- Decrease keyword weight: +2 → +1
- Lower employee minimum: 25+
- Expand industries: add adjacent categories

### **Legislation Parsing (Workflow 3)**
Current: AI identifies top 5 changes weekly, searches top 5 business categories

**To focus on highest-revenue opportunities:**
- Edit Settings node: reorder key_legislation by financial impact
- Edit AI prompts: weight tier 1 changes 3x vs tier 3
- Limit to top 3 changes/week instead of 5

**To expand coverage:**
- Increase search from 10 businesses → 20 per category
- Run Workflow 3 twice per week (e.g., Mon + Thu)
- Add state/local legislation (not just federal)

### **Call Script Customization (Workflow 3)**
Current: Generated by AI; generic "compliance service" messaging

**To improve open rate:**
- Customize with specific regulation name (e.g., "OBBBA changes...")
- Mention specific financial impact (e.g., "$15K tax savings available")
- Add time-bound offer (e.g., "30-day assessment window closes Oct 15")

---

## Troubleshooting

| Issue | Workflow | Cause | Fix |
|-------|----------|-------|-----|
| OTP never arrives | WF1 | Twilio Verify SID invalid or account not funded | Verify SID format, check account balance |
| No Crunchbase results | WF2 | API key invalid or rate limited | Check API key, add 60s delay between searches |
| Stripe invoice not emailed | WF1/WF3 | API key missing billing permissions | Re-auth Stripe key, verify webhook configured |
| Discord posts not appearing | WF3 | Webhook URL invalid or channel deleted | Regenerate webhook URL in Discord |
| Borderline leads not appearing | WF2 | Scrape Queue table not created | Create table in n8n with 4 columns: prospect_ref, business_name, domain, alignment_score, status |
| Prospect names are duplicates | WF3 | AI extraction not deduplicated | Add manual check: compare to prior week's Google Sheets before calling |
| Phone numbers invalid | WF3 | Web search returned wrong number | Always verify by calling business website directly |

---

## Compliance & Ethical Boundaries

✅ **SAFE:**
- Calling real businesses affected by real law changes
- Pitching legitimate compliance services
- Pricing reflects real consulting effort ($2,500-$7,500)
- Obtaining explicit consent before invoicing (checkbox requirement)
- Maintaining audit trail of all leads and outcomes

❌ **NOT SAFE:**
- Impersonating government agencies
- Sending unsolicited invoices without consent
- Charging for services you don't deliver
- Sharing prospect data with third parties
- Ignoring robots.txt or scraping restrictions
- Automated calling without consent

**Recommended:** Have legal review your call script and service terms before launch.

---

## Revenue & Unit Economics

**Assumptions:**
- Average service fee: $4,000 (range $2,500-$7,500)
- Close rate: 20% (of contacted prospects; 1 in 5 says yes)
- Call-to-contact time: 10 minutes per business
- Workflow 3 generates 10 leads/week = 2 closes/week

**Weekly revenue (steady state):**
- 2 closes × $4,000 = $8,000/week
- 52 weeks × $8,000 = $416,000/year

**Labor cost:**
- Sales rep @ $50k/year = ~$25/hour = ~$1,000/week
- Calls: 50 leads/week × 10 min = ~8.3 hours labor
- Cost per contact: $1,000 / 50 = $20
- Cost per close: $1,000 / 2 = $500

**Gross margin per close:**
- Revenue: $4,000
- Sales labor: $500
- Stripe fees (2.2% + $0.30): $88
- **Gross profit: $3,412**
- **Gross margin: 85%**

(Does not include: your time to deliver service, CRM platform, n8n seat, API costs)

---

## Next Steps

### Week 1: Setup & Test
- [ ] Configure Workflow 1 with Twilio + Stripe
- [ ] Test: Submit form, verify OTP, complete agreement, check invoice
- [ ] Activate Workflow 1 for production

### Week 2: Data Pipeline
- [ ] Configure Workflow 2 with Crunchbase + Clearbit
- [ ] Upload sample legislation; test prospect research
- [ ] Review Scrape Queue; manually approve 3-5 leads
- [ ] Activate Workflow 2

### Week 3: Automation Launch
- [ ] Configure Workflow 3 with NewsAPI, BBB, Discord, Google Sheets
- [ ] Test first Monday run; review Discord notifications
- [ ] Activate Workflow 3 for production (first live run Monday 7am)

### Week 4+: Optimization
- [ ] Monitor conversion rates by lead source
- [ ] A/B test call scripts (use Discord to vary messaging)
- [ ] Adjust scoring thresholds based on close rate
- [ ] Plan Workflow 2 for other legislation (state/local laws)

---

## Success Metrics

**Workflow 1 (Organic):**
- Form submissions/week
- Verification rate (% complete OTP)
- Prescreen completion rate
- Close rate (form → invoice)
- Average deal value

**Workflow 2 (Scraping):**
- Prospect research runs/week
- Qualified leads generated/week
- Close rate (auto-generated → agreement)
- Borderline lead review rate (manual approval)

**Workflow 3 (Legislative Hunter):**
- Legislation alerts/week
- Prospects found/week
- Call attempts/week
- Close rate (called → agreement)
- Average close time (days from call to invoice)

**System Overall:**
- Total revenue/month
- Gross margin %
- Customer acquisition cost (CAC)
- Lifetime value (LTV) = customer keeps using services
- LTV:CAC ratio (target ≥3:1)

---

## Support & Resources

**n8n Docs:** https://docs.n8n.io
**Twilio Verify API:** https://www.twilio.com/docs/verify/api
**Stripe API:** https://stripe.com/docs/api
**Crunchbase API:** https://crunchbase.com/api
**Federal Register API:** https://www.federalregister.gov/developers
**NewsAPI:** https://newsapi.org

For questions or issues, refer to troubleshooting section above or check workflow sticky notes for setup instructions.
