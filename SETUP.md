# AI Sales & Compliance Automations (n8n)

Three n8n workflows in the `trasch.app.n8n.cloud` personal project. Everything user-facing is labeled as AI-generated.

| Workflow | n8n ID | Trigger | Status |
|---|---|---|---|
| Legislative Impact Report Generator | `tS9r89ioA4EexAZ8` | Mondays 7:00 AM America/New_York + invoice form `/form/send-client-invoice` | **Published (live)** |
| AI Lead-to-Invoice Assistant | `1iyVDbhgaF1jtmJH` | Form `/form/lead-intake` | Unpublished draft |
| AI Prospector: Legislation to Leads | `SuYCZoOOt1C8vcuz` | Form `/form/ai-prospector` | Unpublished draft |

The live workflows in n8n are the source of truth. `wf1_lead_to_invoice_production.ts` and `wf2_lead_scraping.ts` are the n8n Workflow SDK code for the second and third rows.

## Test results (2026-09-29)

| Workflow | Run | Result |
|---|---|---|
| Legislative Report Generator | Real run, execution 6 | ✅ It pulled 231 upcoming federal rules and the AI picked the top changes. It found 3 local businesses (e.g. Mike's Deli, Burlington, (336) 586-0502), wrote reports to Legislative Reports, and posted the AI digest and lead alerts to Discord. Vibe and Crunchbase returned "Credentials not found" (fail-soft, as designed). After this run, vague search terms like "pass-through business" are now filtered out. |
| AI Prospector | Real AI, simulated Vibe data, execution 7 | ✅ The AI picked only valid Vibe categories. Two NC contractors scored 9/10 and were saved to Leads Pipeline. The trade association Carolinas AGC scored 1 and was dropped. |
| Lead-to-Invoice | Simulated Twilio/Stripe/form answers, execution 8 | ✅ The phone was normalized to `+13365550123`. The Leads Pipeline row moved new → verified → qualified → invoice_sent, with the signature and invoice ID saved. |

The test runs left 3 rows in **Leads Pipeline**: `LEAD-8` "TEST Lead (delete me)", and `PROSPECT-7-0` / `PROSPECT-7-1` (tagged "TEST RUN" in `request_details`). Delete the test lead from the n8n Data Tables screen. The two prospects are real NC contractors, so you can keep them if you like.

## What each one does

**Legislative Impact Report Generator.** It pulls upcoming Federal Register rules and Brave news results. An AI analyst picks the 5 costliest changes and posts a digest to Discord. An AI scout turns the changes into local business searches in Alamance County, NC and picks up to 10 new businesses a week. Each business is enriched through Vibe Prospecting (Explorium), Crunchbase and a phone-number search, then the AI writes an impact report and a call script. Reports go to the **Legislative Reports** data table and to Discord. After a sales call, the **Log Agreed Client** form creates and emails a Stripe invoice, but only if you tick the box confirming the customer agreed.

**AI Lead-to-Invoice Assistant.** The flow runs:
1. The intake form collects the lead, with SMS consent.
2. Twilio Verify texts a one-time code (SMS only).
3. The lead answers three prescreen questions.
4. Qualified leads see an agreement page with Terms, Privacy, Fine Print and E-Signature sections, each of which expands when tapped. They sign by typing their name.
5. Stripe creates and emails the invoice.

Every step updates **Leads Pipeline**.

**AI Prospector.** You paste the text of a law. The AI extracts the affected industries, then Vibe Prospecting searches for matching businesses and Crunchbase checks each one. The AI scores each business from 0 to 10:
- **7 or higher:** goes to **Leads Pipeline**.
- **4 to 6:** goes to **Scrape Queue** for a person to review.
- **Below 4:** dropped.

Nobody is contacted automatically.

## Lead scoring and briefs

Both prospecting workflows use the same approach:
- **AI-rated factors:** the AI rates each factor from 0 to 5 and must quote the evidence (a fact plus its source). If it has no evidence, the factor is capped at 1, so a lead can't score high on guesses.
- **Calculated factors:** everything else is computed by the workflow, not the AI.

**Legislative Report Generator.** The score runs 0–100. You can edit the weights and thresholds in the **Settings** node.

| Factor | Setting | Default | How it's scored |
|---|---|---|---|
| The law fits their actual work | `w_applicability` | 30 | AI, with evidence |
| Deadline urgency | `w_urgency` | 20 | Computed from the nearest upcoming deadline: ≤90 days = 5, ≤180 = 4, ≤1 year = 3, already past = 1 |
| Penalty exposure | `w_penalty` | 15 | AI, with evidence |
| Company size fit | `w_size_fit` | 15 | Computed. Inside `ideal_min_employees`–`ideal_max_employees` (10–500) = 5; within half/double of that range = 3; otherwise 1; unknown = 2 |
| Contactability | `w_contactability` | 10 | Computed. Verified phone = +3, official website found = +2 |
| Timing signals (hiring, expansion, contracts, incidents) | `w_trigger_signals` | 10 | AI, with evidence |

- **Tier:** A if the score is at least `tier_a_min` (75); B if at least `tier_b_min` (55); otherwise C.
- **Confidence:** the share of the six factors backed by real data. A low-confidence lead needs more checking before you call.

**What each brief (Discord post and Legislative Reports row) contains:**
- The score, tier, confidence and per-factor breakdown.
- The phone number, used only if it appears next to the business name in the research or on the business's own website.
- The official website. The workflow finds the company's own site, skipping directories such as Yelp, YellowPages and BBB, and reads it.
- Location, size, and who to ask for when a decision-maker is named publicly.
- A plain summary of what the company does.
- 2–3 sourced talking points, and a call script whose opener uses one of them.

**AI Prospector.** The score runs 0–10. The weights are at the top of the **Compute Weighted Score** node: law fit 45, penalty 20, size 20, signals 15. Trade associations, chambers, non-profits and government bodies score 0.

## Data tables

| Table | ID | Used by |
|---|---|---|
| Leads Pipeline | `1PpAYbgev6sKzZsc` | Lead-to-Invoice, Prospector |
| Legislative Reports | `uNC0yfMxQPaZKwkU` | Legislative Report Generator |
| Scrape Queue | `mMmobCBaV5qy9R18` | Prospector |

## Setup checklist

Each workflow also has a "Setup checklist" sticky note on its canvas.

**Credentials**
- **Stripe:** the existing *Stripe account* credential. Open each Stripe HTTP node in Lead-to-Invoice and confirm it is selected. ⚠️ **This credential is connected to a LIVE Stripe account ("evanShmevan Services").** For testing, create a second Stripe credential with a test key (`sk_test_…`) and switch to it. Invoices sent with the live key are real.
- **Twilio:** create a Twilio credential and select it in **Text Verification Code** and **Check Verification Code**. Create a Verify Service in the Twilio console and paste its SID (`VA…`) into `twilio_verify_sid` in **Prepare Lead**.
- **Vibe Prospecting (Explorium):** create a *Custom Auth* credential with `{"headers":{"api_key":"YOUR_KEY"}}`. Select it in **Match Business in Vibe**, **Enrich Firmographics** and **Search Vibe Prospecting**.
- **Crunchbase:** requires a paid API plan. Create a *Custom Auth* credential with `{"headers":{"X-cb-user-key":"YOUR_KEY"}}` and select it in both **Look Up Crunchbase** nodes.
- **OpenAI, Brave Search:** these run on n8n gateway credits; nothing to set up.

**Discord.** The Legislative workflow uses your connected *Discord account* credential; there are no webhook URLs. For now, all three Discord nodes post to **#administrative-notices** on *trasch's services*. To split them out, create #law-summary and #new-leads, then pick them in **Post Law Changes Digest** and **Post Lead to Discord**.

**Business settings.** In **Prepare Lead** (Lead-to-Invoice), set `service_name`, `price_usd` and `days_until_due`. The Legislative workflow's target area is set in its **Settings** node.

## Testing

1. **Legislative Report Generator:** open the workflow and click *Execute workflow*. Check Discord and the Legislative Reports table. If a Vibe or Crunchbase key is missing, that step fails soft and the report marks the field UNVERIFIED.
2. **Lead-to-Invoice:** first switch the Stripe credential to a test key. Publish, open `/form/lead-intake`, and use your own phone. Then check the Leads Pipeline row and the invoice in the Stripe dashboard.
3. **AI Prospector:** publish, open `/form/ai-prospector`, and paste a short rule summary. The Vibe filters were checked against Vibe Prospecting directly: `company_region_country_code` (e.g. `US-NC`) and a fixed list of valid `linkedin_category` values that the AI must choose from. A sample search returned 4,511 NC construction firms with 11–200 employees.

## Defaults to review

These were chosen without your input and are easy to change:
- The target area is Alamance County, NC for weekly reports, and `us-nc` for the Prospector.
- The price is $2,500 in Lead-to-Invoice, and the call scripts quote $2,500–$7,500.
- Qualification rules:
  - **Lead-to-Invoice:** the lead must answer "Yes" on budget, plus give a 30-day timeline or be the decision-maker.
  - **Prospector:** an AI score of 7 or higher qualifies.
- **Legal text:** the agreement page and `LEGAL_AGREEMENTS.md` are **drafts written by AI, not by a lawyer**. They include binding arbitration, a class-action waiver, liability capped at the fee paid, and no refunds once work starts. Have an attorney review them and fill in your business name and state before real customers sign.

## Lead Portal (swipe review + dialer)

**Standalone: no n8n, no accounts and no credentials needed.** It's one file and needs only Node 18+:
```bash
node lead_portal_app.mjs                       # open http://localhost:8787
PORTAL_PASS='secret' node lead_portal_app.mjs  # optional password (username: admin)
```
- **Storage:** data is saved to `lead_portal_data.json` next to the app (git-ignored).
- **First start:** it loads the 23 real AI-researched briefs in `leads_seed.json`, from the test runs of the legislative workflow.
- **More leads:** add them with **⬆ Import**, using a JSON array or a CSV with a header row (`business_name` is required). **⬇ Export** downloads everything.
- **Calling from your phone:** the terminal prints a Wi-Fi address (e.g. `http://192.168.1.20:8787`). Open it on your phone and tap a number to call with the phone's own dialer.

**How it works:**
- **Review tab:** each card is an AI-researched profile, best score first. It shows the score and tier, contact details, what the company does, the law changes that affect them, how we can help, what happens if they wait, talking points and the call script. Swipe right (or press →) to **ship**, left (←) to **pass**. Profiles you haven't swiped stay in the queue across restarts.
- **Shipping** schedules call slots at **10 AM and 2 PM ET on weekdays for the next 7 days** (up to 10 calls).
- **Dialer tab:** calls due now, one card per business, highest score first. Each card has a tap-to-call button, talking points, the script and a notes box. It refreshes every minute.
- **Outcome buttons and stop rules:**
  - **No answer** and **Left voicemail** keep the calls going.
  - **Do not call**, **Talked to decision-maker** and **Interested** cancel all remaining slots.
  - After **3 voicemails**, the Left voicemail button is disabled.
  - Slots that passed without a call are marked missed.
- **Tuning:** call times, days and the voicemail limit are constants at the top of `lead_portal_app.mjs` (`CALL_HOURS`, `CALL_DAYS`, `VOICEMAIL_LIMIT`).

The n8n workflow "AI Lead Portal" (`khysPRlqfn2Odp5N`) is optional and unpublished. You don't need it.

**Known gaps and failure points:**
- **Test runs used up leads.** My 3 test runs used the "skip already reported" memory, so those ~23 businesses won't come back automatically. They are already in the review queue.
- **Phone type is unknown.** Numbers aren't checked as mobile vs landline. Calls are dialed by hand from a phone, which avoids autodialer consent rules, but still honor do-not-call requests and call only between 8am and 9pm local time.
- **Calls are logged by hand.** If a rep forgets to tap an outcome, the slot is marked missed at the next logged outcome.
- **Discord gets every lead.** All leads, even low scores, still post to Discord; the portal is where you filter.
- **No failure alerts.** Nothing alerts you if the Monday run fails. Check n8n → Executions, or add an error workflow.
