# n8n Deployment & Setup Guide

Step-by-step instructions to deploy the three workflows to your n8n instance and test end-to-end.

---

## Pre-Deployment Checklist

Before starting, you'll need:

### **Credentials (Create Before Deployment)**

1. **Twilio** (for Workflow 1 only)
   - [ ] Twilio Account SID
   - [ ] Twilio Auth Token
   - [ ] Verify Service SID (format: `VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - [ ] Verified phone number to send from (e.g., `+1 555 000 0000`)
   - **Get it:** [Twilio Console](https://console.twilio.com)

2. **Stripe** (for Workflows 1 & 3)
   - [ ] Stripe API Secret Key (starts with `sk_test_` or `sk_live_`)
   - [ ] Account email for customer creation
   - **Get it:** [Stripe Dashboard](https://dashboard.stripe.com)

3. **Crunchbase** (for Workflow 2 only)
   - [ ] Crunchbase API Key
   - **Get it:** [Crunchbase Settings](https://crunchbase.com/profile/api)

4. **Clearbit** (for Workflow 2 & 3)
   - [ ] Clearbit API Token
   - **Get it:** [Clearbit Dashboard](https://dashboard.clearbit.com)

5. **NewsAPI** (for Workflow 3 only)
   - [ ] NewsAPI Key
   - **Get it:** [NewsAPI](https://newsapi.org)

6. **SendGrid** (for email delivery - optional but recommended)
   - [ ] SendGrid API Key
   - **Get it:** [SendGrid Settings](https://app.sendgrid.com/settings/api_keys)

7. **Discord** (for notifications - optional)
   - [ ] Discord Webhook URLs (3 separate webhooks for different channels)
   - **Get it:** [Discord Webhook Setup](#discord-setup)

8. **Google Sheets** (for Workflow 3 - optional)
   - [ ] Google Service Account JSON (or OAuth connection)
   - [ ] Spreadsheet ID from your reporting sheet
   - **Get it:** [Google Sheets Setup](#google-sheets-setup)

### **n8n Setup**

- [ ] You have access to an n8n instance (cloud or self-hosted)
- [ ] You have admin or workflow creation permissions
- [ ] You know your n8n base URL (e.g., `https://app.n8n.cloud`)

### **Data Tables**

- [ ] Create "Leads Pipeline" data table in n8n with 29 columns (see WORKFLOW_GUIDE.md)
- [ ] Create "Scrape Queue" data table (5 columns: prospect_ref, business_name, domain, alignment_score, status)
- [ ] Create "Legislative Reports" data table (8 columns: report_ref, business_name, phone, website, legislation_changes, full_report_json, status, created_at)

---

## Part 1: Workflow 1 Deployment (Lead-to-Invoice)

### Step 1: Create n8n Credentials

**Twilio Credential:**
1. Go to n8n: **Credentials** → **New**
2. Choose **Twilio**
3. Fill in:
   - Account SID: `AC...`
   - Auth Token: `your-token-here`
4. Save

**Stripe Credential:**
1. Go to n8n: **Credentials** → **New**
2. Choose **Stripe**
3. Fill in: Secret API Key (starts with `sk_`)
4. Save

### Step 2: Import Workflow 1 Code

**Option A: Via n8n CLI (if available)**
```bash
n8n workflow import --input wf1_lead_to_invoice_production.ts
```

**Option B: Via n8n Web UI**
1. In n8n: **Import** → **From Code**
2. Copy entire contents of `wf1_lead_to_invoice_production.ts`
3. Paste into import dialog
4. Click "Import"

**Option C: Create Manually** (if imports don't work)
1. In n8n: **Create New Workflow**
2. Add nodes manually based on workflow structure
3. (Tedious; recommend Option A or B)

### Step 3: Configure Workflow 1

1. **Edit the "Service Config" node:**
   - `business_name`: "Your Business Name"
   - `business_email`: "support@yourbusiness.com"
   - `twilio_from_number`: "+1 555 000 0000" (your verified Twilio number)
   - `twilio_verify_sid`: "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   - `service_name`: "Your Service Name" (e.g., "Environmental Compliance Audit")
   - `price_usd`: 500 (or your price)
   - `days_until_due`: 7

2. **Edit the "Lead Intake Form" node:**
   - Update `formDescription` with your intro text
   - Update `path` to your desired URL (e.g., `lead-intake`)
   - Update consent checkbox text if needed

3. **Edit the "Prescreening Questions" form:**
   - Customize questions to fit your service
   - Update descriptions and options

4. **Edit the "Service Agreement" form:**
   - Replace placeholder agreement text with content from LEGAL_AGREEMENTS.md
   - Copy the HTML collapsible version for best UX
   - Update `path` to your desired URL (e.g., `service-agreement`)

5. **Verify all credential connections:**
   - Each Twilio node should use your Twilio credential
   - Each Stripe node should use your Stripe credential
   - Look for yellow warning icons; resolve any missing credentials

### Step 4: Test Workflow 1

**Create Leads Pipeline table (if not exists):**
```
Columns (29 total):
lead_ref (string)
full_name (string)
email (string)
phone (string)
company (string)
request_details (string)
consent_text (string)
consent_at (string)
status (string)
call_sid (string)
otp_status (string)
otp_verified_at (string)
pq_timeline (string)
pq_budget (string)
pq_decision_maker (string)
pq_notes (string)
prescreen_score (number)
qualified (boolean)
service_name (string)
price_usd (number)
agreement_version (string)
agreement_signature (string)
agreement_accepted_at (string)
stripe_customer_id (string)
stripe_invoice_id (string)
invoice_url (string)
invoice_status (string)
followup_count (number)
last_followup_at (string)
```

**Test Flow:**
1. Go to workflow → **Test**
2. Click "Intake Form" trigger → **Test Node**
3. You'll get a form URL
4. Open in browser; submit test data:
   - Name: Jane Doe
   - Email: test@example.com
   - Phone: 555-123-4567
   - Company: Test Corp
   - Request: Test the workflow
   - Consent: Check
5. Click "Submit and verify"
6. Workflow runs; you should receive:
   - Twilio call on configured phone
   - SMS with OTP code
7. In OTP form: enter code (for testing, Twilio test credentials may auto-approve)
8. Complete prescreening
9. Sign agreement
10. Check Stripe dashboard for invoice creation
11. Check n8n data table for lead record

**Common Issues During Test:**
- "Twilio SID invalid" → Verify SID format and copy exactly
- "OTP not received" → Check Twilio Verify Service is created and SID matches
- "Stripe invoice failed" → Verify API key has billing permissions
- "Form won't load" → Check form trigger has correct path

### Step 5: Publish Workflow 1

Once testing passes:
1. Click **Publish** (top right)
2. Workflow is now active
3. Form URL is now production-ready

---

## Part 2: Workflow 2 Deployment (Lead Scraping)

### Step 1: Create Additional Credentials

**Crunchbase Credential:**
1. **Credentials** → **New** → **HTTP Request Header**
2. Name: "Crunchbase API"
3. Headers: `Authorization: Bearer YOUR_CRUNCHBASE_KEY`

**Clearbit Credential:**
1. **Credentials** → **New** → **HTTP Request Header**
2. Name: "Clearbit API"
3. Headers: `Authorization: Bearer YOUR_CLEARBIT_KEY`

### Step 2: Import Workflow 2

(Same as Workflow 1, but use `wf2_lead_scraping.ts`)

### Step 3: Configure Workflow 2

1. **Edit "Settings" node:**
   - `search_location`: "Your City, Your State"
   - `target_industries`: List of industries you want to target
   - `zip_code`: Your ZIP code

2. **Edit HTTP request nodes:**
   - Update API endpoints if needed
   - Verify credentials are linked

### Step 4: Test Workflow 2

1. **Create Scrape Queue table:**
```
Columns (5):
prospect_ref (string)
business_name (string)
domain (string)
alignment_score (number)
status (string)
```

2. **Test Flow:**
   - Click **Test**
   - Provide sample legislation text via webhook or form
   - Workflow searches for businesses
   - Check n8n tables for results

3. **Common Issues:**
   - "Crunchbase returns 0 results" → Update `target_industries` list
   - "API rate limit" → Add delays between requests
   - "No businesses found" → Check search location

### Step 5: Publish Workflow 2

1. Click **Publish**
2. Set up webhook trigger (if needed)

---

## Part 3: Workflow 3 Deployment (Legislative Impact Generator)

### Step 1: Create Additional Credentials

**NewsAPI Credential:**
1. **Credentials** → **New** → **HTTP Request Header**
2. Name: "NewsAPI"
3. Headers: `X-API-Key: YOUR_NEWSAPI_KEY`

**BBB API Credential:**
1. **Credentials** → **New** → **HTTP Request Header**
2. Name: "BBB API"
3. Headers: `Authorization: Bearer YOUR_BBB_KEY`

**Discord Webhooks:**
1. In Discord: Right-click channel → **Integrations** → **Webhooks** → **Create**
2. Copy webhook URL
3. Create 3 webhooks (law summary, new leads, administrative)
4. In n8n: Add as Credentials of type "Discord Webhook"

### Step 2: Import Workflow 3

(Same as Workflow 1, but use `wf3_legislative_impact_generator.ts`)

### Step 3: Configure Workflow 3

1. **Edit "Settings" node:**
   - Update all configuration as in Workflow 2
   - Verify legislation list is current

2. **Edit "Weekly Legislative Monitor" trigger:**
   - Set cron to your preferred time (default: Monday 7am UTC)
   - Change to your timezone if needed

3. **Edit Discord webhook nodes:**
   - Select correct Discord channel for each notification

4. **Edit Google Sheets node (if using):**
   - Select your spreadsheet
   - Set range (e.g., "Reports!A:K")

### Step 4: Create Invoice Form (for Workflow 3)

This is a separate form trigger for when sales calls convert:

1. **Create New Workflow** → **Add Trigger** → **Form Trigger**
2. Configure as `invoiceForm` in wf3 code
3. Fields:
   - business_name (text, required)
   - contact_name (text, required)
   - contact_email (email, required)
   - agreed_service (textarea, required)
   - agreed_price (number, required)
   - customer_consent (checkbox, required)
4. On submission:
   - Validate consent checkbox is checked
   - Validate price > 0
   - Create Stripe invoice
   - Email to customer
   - Post to Discord

### Step 5: Test Workflow 3

1. **Create Legislative Reports table:**
```
Columns (8):
report_ref (string)
business_name (string)
phone (string)
website (string)
legislation_changes (string)
full_report_json (string)
status (string)
created_at (string)
```

2. **Trigger manually (don't wait for Monday):**
   - In workflow: **Execute Workflow**
   - Check results in Discord and data tables
   - Verify business discovery works

3. **Test Invoice Form:**
   - Get form URL
   - Fill out with test business info
   - Verify Stripe invoice created
   - Check Discord notification

### Step 6: Publish Workflow 3

1. Click **Publish**
2. Workflow now runs automatically on schedule

---

## Discord Setup

### Create Three Discord Channels/Webhooks

**Channel 1: #law-summary** (Weekly updates)
```
Purpose: Weekly digest of new laws
Frequency: Monday 7am
Content: Top 5 law changes summary
```

**Channel 2: #new-leads** (Individual prospects)
```
Purpose: New prospect alerts as they're researched
Frequency: As businesses are found (daily during research)
Content: Business name, phone, predicted impact
```

**Channel 3: #administrative-notices** (System alerts)
```
Purpose: Invoice sent confirmations, errors
Frequency: As they occur
Content: Invoice confirmations, system alerts
```

### Create Webhooks in Discord

1. Server → **Server Settings** → **Integrations** → **Webhooks**
2. Click **New Webhook**
3. Name: "n8n-law-updates"
4. Copy webhook URL
5. In n8n Credentials: Add as Discord Webhook type
6. Repeat for other 2 channels

---

## Google Sheets Setup

### Create Spreadsheet

1. [Google Sheets](https://sheets.google.com) → **New**
2. Name: "Legislative Reports" (or your preference)
3. Create headers:
   - A: Timestamp
   - B: Business Name
   - C: Phone
   - D: Website
   - E: Industry
   - F: Legislation Changes
   - G: Estimated Impact
   - H: Report Status
   - I: Full Report (JSON)

### Create Google Service Account

1. [Google Cloud Console](https://console.cloud.google.com)
2. **Create Project**
3. **APIs & Services** → **Create Credentials** → **Service Account**
4. Download JSON key
5. In n8n: **Credentials** → **Google Sheets** → Paste JSON
6. Grant service account permission to your spreadsheet

---

## End-to-End Testing (All Three Workflows)

**Week 1:**
- [ ] Workflow 1 deployed and tested (form submission → invoice)
- [ ] Get feedback on legal agreement text
- [ ] Adjust service terms based on feedback

**Week 2:**
- [ ] Workflow 2 deployed
- [ ] Upload sample legislation
- [ ] Verify business discovery works
- [ ] Review prospect quality

**Week 3:**
- [ ] Workflow 3 deployed
- [ ] Wait for first scheduled run (Monday 7am)
- [ ] Review Discord notifications
- [ ] Test invoice form with mock business

**Week 4+:**
- [ ] Monitor conversion rates
- [ ] Adjust scoring in Workflow 2/3
- [ ] Tune search locations and industries
- [ ] Scale outreach

---

## Common Deployment Issues

| Issue | Solution |
|-------|----------|
| Credential not found | Create credential first in **Credentials** tab, then link in node |
| Form URL not generating | Activate workflow with **Publish** |
| Twilio call fails | Verify phone number is formatted `+1 5551234567` (E.164) |
| Stripe invoice not sent | Check API key has `invoicing` scope; verify email in customer record |
| n8n data table empty | Ensure column names exactly match workflow expressions |
| Discord webhook fails | Regenerate webhook URL; test with curl first |
| OTP code won't validate | Use Twilio test credentials for testing; switch to live for production |
| Form times out | Increase `resumeTimeout` in form node (in seconds) |

---

## Security Checklist

Before going to production:

- [ ] All test credentials switched to production keys
- [ ] API keys stored in n8n Credentials (not hardcoded)
- [ ] HTTPS enabled on all form URLs
- [ ] Legal agreements reviewed by attorney
- [ ] Discord webhooks have minimal permissions (only post messages)
- [ ] Stripe test mode disabled
- [ ] Twilio SMS messages use production account
- [ ] Data table access restricted (who can edit?)
- [ ] Backup/export of data tables configured
- [ ] Monitoring/alerts set up for workflow failures

---

## Monitoring & Maintenance

### Weekly Checklist

- [ ] Check workflow execution history (any failures?)
- [ ] Review new leads in Leads Pipeline
- [ ] Check Stripe invoices (sent? paid?)
- [ ] Monitor Discord notifications (any errors?)

### Monthly Checklist

- [ ] Review conversion rates by source (organic vs auto-generated)
- [ ] Audit legal agreements (any compliance issues?)
- [ ] Check API usage and costs (Stripe, Twilio, Crunchbase, etc.)
- [ ] Adjust scoring thresholds based on close rates
- [ ] Back up data tables (export to CSV)

### Quarterly Checklist

- [ ] Update legal agreements (new laws, liability limits, etc.)
- [ ] Review vendor relationships (Twilio, Stripe, Crunchbase pricing)
- [ ] Analyze customer feedback from forms
- [ ] Plan new features or optimizations

---

## Support Resources

**n8n Documentation:**
- [Workflow SDK Docs](https://docs.n8n.io/workflows/)
- [Form Trigger Docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.formtrigger/)
- [Data Table Docs](https://docs.n8n.io/workflows/data-table/)

**External Service Docs:**
- [Twilio Verify API](https://www.twilio.com/docs/verify/api)
- [Stripe Invoicing](https://stripe.com/docs/invoicing)
- [Crunchbase API](https://crunchbase.com/api)
- [Clearbit API](https://clearbit.com/api-reference)

**Community:**
- [n8n Community Forum](https://community.n8n.io)
- [n8n Slack Community](https://n8n.io/slack)

---

## Next Steps After Deployment

1. **Day 1:** Publish Workflow 1, get feedback on forms and agreement text
2. **Week 1:** Make refinements based on feedback
3. **Week 2:** Deploy Workflow 2, test prospect research
4. **Week 3:** Deploy Workflow 3, wait for first automated run
5. **Week 4:** Analyze results, adjust scoring, scale outreach

You're now ready to deploy! 🚀
