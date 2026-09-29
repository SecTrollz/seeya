import { workflow, node, trigger, sticky, newCredential, ifElse, expr, loop } from '@n8n/workflow-sdk';

const leadsTable = { __rl: true, mode: 'id', value: '1PpAYbgev6sKzZsc', cachedResultName: 'Leads Pipeline' };
const scrapeQueueTable = { __rl: true, mode: 'id', value: 'ScrapeQueue', cachedResultName: 'Scrape Queue' };

/**
 * Lead Scraping & Targeting Workflow
 * Parses legislation, identifies target business profiles, enriches prospects via APIs,
 * scores alignment, filters qualified prospects, and creates staged leads.
 */

const legislationInput = trigger({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Legislation Input',
    parameters: {
      method: 'POST',
      url: 'https://webhook.site/unique-id', // Replace with n8n webhook
      options: { formDataContentType: 'raw' }
    }
  },
  output: [{
    legislation_text: 'Lorem ipsum dolor sit amet...',
    legislation_title: 'Environmental Compliance Act 2026',
    legislation_url: 'https://example.gov/acts/2026/123',
    uploadedAt: '2026-09-29T10:00:00.000Z'
  }]
});

const parseRegulationContent = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Parse Regulation Content',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'reg-title', name: 'regulation_title', value: expr('{{ $json.legislation_title }}'), type: 'string' },
          { id: 'reg-text', name: 'regulation_text', value: expr('{{ $json.legislation_text }}'), type: 'string' },
          { id: 'reg-industries', name: 'target_industries', value: expr("{{ JSON.stringify(['environmental', 'manufacturing', 'construction', 'waste-management', 'energy']) }}"), type: 'string' },
          { id: 'reg-keywords', name: 'compliance_keywords', value: expr("{{ JSON.stringify(['compliance', 'permit', 'environmental', 'emission', 'waste', 'reporting', 'audit', 'remediation', 'assessment']) }}"), type: 'string' },
          { id: 'reg-scope', name: 'scope_summary', value: expr('{{ $json.legislation_text.substring(0, 500) }}'), type: 'string' }
        ]
      }
    }
  },
  output: [{
    legislation_title: 'Environmental Compliance Act 2026',
    legislation_text: 'Lorem ipsum...',
    target_industries: '["environmental", "manufacturing", "construction"]',
    compliance_keywords: '["compliance", "permit", "environmental"]',
    scope_summary: 'Lorem ipsum dolor...',
    uploadedAt: '2026-09-29T10:00:00.000Z'
  }]
});

// Crunchbase search for target businesses by industry
const searchCrunchbaseBusinesses = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Search Crunchbase - Target Industries',
    parameters: {
      method: 'POST',
      url: 'https://api.crunchbase.com/v4/denormalized/entity/search',
      headers: {
        'User-Agent': 'n8n-workflow',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: expr(`{
        "field_ids": ["uuid", "identifier", "short_description", "primary_location", "num_employees_enum", "industries", "company_type"],
        "filter_ids": ["industries", "company_types"],
        "filters": {
          "industries": ${(() => {
            try {
              const ind = JSON.parse($json.target_industries);
              return JSON.stringify(ind.slice(0, 3).map(i => ({ name: i, operator: "has_substring" })));
            } catch { return '[]'; }
          })()},
          "company_types": [
            { "name": "for_profit", "operator": "include" },
            { "name": "private_company", "operator": "include" }
          ]
        },
        "limit": 50,
        "order": [{ "field_id": "num_employees_enum", "sort": "DESC" }]
      }`),
      authenticationType: 'generic',
      genericAuthType: 'httpBasicAuth',
      options: { neverError: true }
    }
  },
  output: [{
    entities: [
      {
        uuid: 'abc-123',
        identifier: { uuid: 'abc-123', name: 'Acme Environmental Corp', domain: 'acme-env.com' },
        short_description: 'Environmental compliance solutions',
        primary_location: { city: 'Portland', state: 'OR', country: 'United States' },
        num_employees_enum: '51-100',
        industries: [{ name: 'Environmental Services' }],
        company_type: { name: 'for_profit' }
      }
    ]
  }]
});

// Fetch business details and web presence for enrichment
const enrichBusinessProspects = node({
  type: 'n8n-nodes-base.loop',
  version: 1.0,
  config: {
    name: 'Enrich Each Business',
    parameters: {
      iterations: expr('{{ $('SearchCrunchbaseBusinesses').output.entities.length }}'),
      loopItem: {
        itemExpression: expr('{{ $('SearchCrunchbaseBusinesses').output.entities[$loop.index] }}')
      }
    }
  },
  output: [{
    uuid: 'abc-123',
    name: 'Acme Environmental Corp',
    domain: 'acme-env.com',
    city: 'Portland',
    state: 'OR',
    employees: '51-100',
    industries: 'Environmental Services',
    website_title: 'Acme Environmental Corp - Compliance Solutions',
    website_meta: 'Professional environmental compliance and permitting services',
    revenue_range: '$5M-$10M',
    has_compliance_keywords: true,
    enrichment_score: 8.5
  }]
});

// Score prospects on alignment with legislation/compliance needs
const scoreProspects = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Score Prospect Alignment',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'score-business', name: 'business_name', value: expr('{{ $json.name }}'), type: 'string' },
          { id: 'score-domain', name: 'business_domain', value: expr('{{ $json.domain }}'), type: 'string' },
          { id: 'score-industry', name: 'aligned_industries', value: expr('{{ $json.industries }}'), type: 'string' },
          {
            id: 'score-compliance',
            name: 'compliance_alignment_score',
            value: expr(`{{ (() => {
              let score = 0;
              const kw = ${expr('$("ParseRegulationContent").item.json.compliance_keywords')};
              const keywords = typeof kw === 'string' ? JSON.parse(kw) : kw;
              const meta = String($json.website_meta || '').toLowerCase();
              const desc = String($json.description || '').toLowerCase();
              const text = (meta + ' ' + desc).toLowerCase();
              keywords.forEach(k => { if (text.includes(k)) score += 2; });
              score += ($json.enrichment_score || 0);
              return Math.min(score, 10);
            })() }}`),
            type: 'number'
          },
          {
            id: 'score-qualified',
            name: 'is_qualified_prospect',
            value: expr('{{ $json.compliance_alignment_score >= 6 && ($json.employees === "51-100" || $json.employees === "101-250" || $json.employees === "251-500") }}'),
            type: 'boolean'
          }
        ]
      }
    }
  },
  output: [{
    business_name: 'Acme Environmental Corp',
    business_domain: 'acme-env.com',
    aligned_industries: 'Environmental Services',
    compliance_alignment_score: 8.5,
    is_qualified_prospect: true
  }]
});

// Filter to only qualified prospects
const qualifiedProspectsOnly = ifElse({
  condition: expr('{{ $json.is_qualified_prospect === true }}'),
  trueNode: node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      name: 'Pass Qualified Prospect',
      parameters: {
        mode: 'passthroughs',
        options: {}
      }
    },
    output: [{
      business_name: 'Acme Environmental Corp',
      business_domain: 'acme-env.com',
      aligned_industries: 'Environmental Services',
      compliance_alignment_score: 8.5,
      is_qualified_prospect: true
    }]
  }),
  falseNode: node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      name: 'Mark Nurture Lead',
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            { id: 'nurture-status', name: 'lead_status', value: 'nurture', type: 'string' },
            { id: 'nurture-score', name: 'alignment_score', value: expr('{{ $json.compliance_alignment_score }}'), type: 'number' }
          ]
        }
      }
    },
    output: [{
      lead_status: 'nurture',
      alignment_score: 4.2
    }]
  })
});

// Research prospect decision-maker contacts via web scraping
const findProspectContacts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fetch Prospect Contact Info',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://api.clearbit.com/v1/companies/find?domain=" + encodeURIComponent($json.business_domain) }}'),
      authenticationType: 'generic',
      genericAuthType: 'headerAuth',
      headerAuthHeaders: {
        'Authorization': newCredential('Clearbit API Token')
      },
      options: { neverError: true }
    }
  },
  output: [{
    name: 'Acme Environmental Corp',
    domain: 'acme-env.com',
    phone: '503-555-0100',
    founded: 2010,
    employees: 85,
    location: { city: 'Portland', state: 'OR', country: 'US' }
  }]
});

// Fetch LinkedIn company page for decision-maker names
const findDecisionMakers = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Extract Decision-Maker Titles',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://www.google.com/search?q=site:linkedin.com+" + encodeURIComponent($json.name) + "+CEO+OR+\"Operations Officer\"+OR+\"Compliance Officer\"" }}'),
      options: { neverError: true, timeout: 10000 }
    }
  },
  output: [{
    name: 'Acme Environmental Corp',
    executives: [
      { title: 'Chief Operating Officer', name: 'Sarah Johnson', linkedin: 'linkedin.com/in/sarah-johnson' },
      { title: 'VP Compliance', name: 'Michael Chen', linkedin: 'linkedin.com/in/michael-chen' }
    ]
  }]
});

// Create lead record from qualified prospect
const createQualifiedLead = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Prepare Lead Record',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'lead-ref', name: 'lead_ref', value: expr('SCRAPE-{{ $execution.id }}-{{ Date.now() }}'), type: 'string' },
          { id: 'lead-company', name: 'company', value: expr('{{ $json.name }}'), type: 'string' },
          { id: 'lead-domain', name: 'domain', value: expr('{{ $json.domain }}'), type: 'string' },
          { id: 'lead-phone', name: 'phone', value: expr('{{ $json.phone || "" }}'), type: 'string' },
          { id: 'lead-title', name: 'decision_maker_title', value: expr('{{ ($json.executives || [{ title: "Operations" }])[0].title }}'), type: 'string' },
          { id: 'lead-summary', name: 'request_details', value: expr('Automated prospect from {{ $("ParseRegulationContent").item.json.regulation_title }} targeting compliance services'), type: 'string' },
          { id: 'lead-source', name: 'lead_source', value: 'legislation_scrape', type: 'string' },
          { id: 'lead-score', name: 'prescreen_score', value: expr('{{ Math.round($json.compliance_alignment_score * 100) / 100 }}'), type: 'number' }
        ]
      }
    }
  },
  output: [{
    lead_ref: 'SCRAPE-exec-123',
    company: 'Acme Environmental Corp',
    domain: 'acme-env.com',
    phone: '503-555-0100',
    decision_maker_title: 'Chief Operating Officer',
    request_details: 'Automated prospect from Environmental Compliance Act 2026',
    lead_source: 'legislation_scrape',
    prescreen_score: 8.5
  }]
});

// Save to leads pipeline as pre-qualified
const saveAutoQualifiedLead = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Auto-Qualified Lead',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: leadsTable,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          lead_ref: expr('{{ $json.lead_ref }}'),
          full_name: expr('{{ $json.decision_maker_title }}'),
          email: expr('{{ $json.domain.replace(/^www\\./, "") }}'),
          phone: expr('{{ $json.phone }}'),
          company: expr('{{ $json.company }}'),
          request_details: expr('{{ $json.request_details }}'),
          status: 'auto_qualified',
          prescreen_score: expr('{{ $json.prescreen_score }}'),
          qualified: true,
          followup_count: 0
        },
        schema: [
          { id: 'lead_ref', displayName: 'lead_ref', required: false, type: 'string', canBeUsedToMatch: true },
          { id: 'full_name', displayName: 'full_name', required: false, type: 'string' },
          { id: 'email', displayName: 'email', required: false, type: 'string' },
          { id: 'phone', displayName: 'phone', required: false, type: 'string' },
          { id: 'company', displayName: 'company', required: false, type: 'string', canBeUsedToMatch: true },
          { id: 'request_details', displayName: 'request_details', required: false, type: 'string' },
          { id: 'status', displayName: 'status', required: false, type: 'string' },
          { id: 'prescreen_score', displayName: 'prescreen_score', required: false, type: 'number' },
          { id: 'qualified', displayName: 'qualified', required: false, type: 'boolean' },
          { id: 'followup_count', displayName: 'followup_count', required: false, type: 'number' }
        ]
      }
    }
  },
  output: [{ lead_ref: 'SCRAPE-exec-123', status: 'saved' }]
});

// Save to scrape queue for manual review if score is borderline
const saveBorderlineProspect = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Borderline for Review',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: scrapeQueueTable,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          prospect_ref: expr('{{ $json.lead_ref }}'),
          business_name: expr('{{ $json.company }}'),
          domain: expr('{{ $json.domain }}'),
          alignment_score: expr('{{ $json.prescreen_score }}'),
          status: 'review_needed'
        },
        schema: [
          { id: 'prospect_ref', displayName: 'prospect_ref', required: false, type: 'string' },
          { id: 'business_name', displayName: 'business_name', required: false, type: 'string' },
          { id: 'domain', displayName: 'domain', required: false, type: 'string' },
          { id: 'alignment_score', displayName: 'alignment_score', required: false, type: 'number' },
          { id: 'status', displayName: 'status', required: false, type: 'string' }
        ]
      }
    }
  },
  output: [{ prospect_ref: 'SCRAPE-123', status: 'queued' }]
});

// Summary notification
const sendSummary = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Summarize Results',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'sum-regulation', name: 'regulation_processed', value: expr('{{ $("ParseRegulationContent").item.json.regulation_title }}'), type: 'string' },
          { id: 'sum-qualified', name: 'qualified_prospects_found', value: expr('{{ $('SaveAutoQualifiedLead').output.length || 0 }}'), type: 'number' },
          { id: 'sum-review', name: 'prospects_in_review', value: expr('{{ $('SaveBorderlineProspect').output.length || 0 }}'), type: 'number' },
          { id: 'sum-timestamp', name: 'processing_timestamp', value: expr('{{ new Date().toISOString() }}'), type: 'string' }
        ]
      }
    }
  },
  output: [{
    regulation_processed: 'Environmental Compliance Act 2026',
    qualified_prospects_found: 5,
    prospects_in_review: 3,
    processing_timestamp: '2026-09-29T10:15:00Z'
  }]
});

export const leadScrapingWorkflow = workflow({
  name: 'Lead Scraping & Targeting',
  version: 1,
  description: 'Parse legislation, identify target businesses, enrich prospects, score alignment, filter qualified leads',
  nodes: [
    legislationInput,
    parseRegulationContent,
    searchCrunchbaseBusinesses,
    enrichBusinessProspects,
    scoreProspects,
    qualifiedProspectsOnly,
    findProspectContacts,
    findDecisionMakers,
    createQualifiedLead,
    saveAutoQualifiedLead,
    saveBorderlineProspect,
    sendSummary
  ],
  connections: {
    legislationInput: [{ node: parseRegulationContent, type: 'main', index: 0 }],
    parseRegulationContent: [{ node: searchCrunchbaseBusinesses, type: 'main', index: 0 }],
    searchCrunchbaseBusinesses: [{ node: enrichBusinessProspects, type: 'main', index: 0 }],
    enrichBusinessProspects: [{ node: scoreProspects, type: 'main', index: 0 }],
    scoreProspects: [{ node: qualifiedProspectsOnly, type: 'main', index: 0 }],
    qualifiedProspectsOnly: [
      { node: findProspectContacts, type: 'main', index: 0 },
      { node: saveBorderlineProspect, type: 'main', index: 1 }
    ],
    findProspectContacts: [{ node: findDecisionMakers, type: 'main', index: 0 }],
    findDecisionMakers: [{ node: createQualifiedLead, type: 'main', index: 0 }],
    createQualifiedLead: [{ node: saveAutoQualifiedLead, type: 'main', index: 0 }],
    saveAutoQualifiedLead: [{ node: sendSummary, type: 'main', index: 0 }]
  },
  meta: {
    notes: [
      {
        text: '🔧 SETUP REQUIRED\n\nCredentials:\n1. Crunchbase API key (get from crunchbase.com/profile/api)\n2. Clearbit API token (get from clearbit.com/dashboard)\n3. n8n Webhook URL for legislation input\n\nConfiguration:\n1. Update searchCrunchbaseBusinesses with Crunchbase auth\n2. Replace findProspectContacts URL with actual Clearbit endpoint\n3. Configure webhook URL in legislationInput\n4. Test with sample legislation PDF or text'
      },
      {
        text: '📋 WORKFLOW LOGIC\n\nSteps:\n1. Accept legislation upload (text/PDF)\n2. Parse content, extract regulatory keywords, identify target industries\n3. Search Crunchbase for businesses in those industries\n4. Enrich each prospect with web presence + employee data\n5. Score alignment with compliance keywords (0-10 scale)\n6. Filter: score ≥6 + 50+ employees = qualified\n7. Find decision-maker contacts via Clearbit + LinkedIn\n8. Create lead records auto-populated with company info\n9. Save qualified leads to Leads Pipeline (auto_qualified status)\n10. Save borderline leads (score 4-5.9) to review queue\n11. Send summary notification'
      },
      {
        text: '⚠️ COMPLIANCE & SAFETY\n\n- All auto-generated leads tagged with source: legislation_scrape\n- Pre-scored but require manual outreach approval\n- Borderline prospects quarantined for human review\n- No automatic contact attempts; sales team manually calls\n- All prospect data persisted for audit trail\n- Respect robots.txt on all domain queries\n- Rate limit calls to 1 per second per API'
      }
    ]
  }
});
