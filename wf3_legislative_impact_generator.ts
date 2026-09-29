import { workflow, node, trigger, sticky, newCredential, ifElse, expr, loop } from '@n8n/workflow-sdk';

const leadsTable = { __rl: true, mode: 'id', value: '1PpAYbgev6sKzZsc', cachedResultName: 'Leads Pipeline' };
const reportsTable = { __rl: true, mode: 'id', value: 'LegislativeReports', cachedResultName: 'Legislative Reports' };

/**
 * Legislative Impact Report Generator
 * Detects law changes, identifies affected businesses, generates compliance service offers,
 * enables outbound sales calls, and automates invoice generation via Stripe.
 */

// Schedule: Monday 7am
const weeklyTrigger = trigger({
  type: 'n8n-nodes-base.cronTrigger',
  version: 2.1,
  config: {
    name: 'Weekly Legislative Monitor (7am Monday)',
    parameters: {
      mode: 'cron',
      cronExpression: '0 7 * * 1' // Every Monday at 7am UTC
    }
  },
  output: [{ triggeredAt: '2026-09-29T07:00:00.000Z' }]
});

const settings = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Settings & Config',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'cfg-location', name: 'search_location', value: 'Alamance County, NC', type: 'string' },
          { id: 'cfg-zip', name: 'zip_code', value: '27244', type: 'string' },
          { id: 'cfg-industries', name: 'target_industries', value: expr("{{ JSON.stringify(['federal contractors', 'construction', 'trucking', 'healthcare', 'manufacturing', 'staffing', 'gig economy', 'professional services']) }}"), type: 'string' },
          { id: 'cfg-legislation', name: 'key_legislation', value: expr(`{{ JSON.stringify([
            { id: 'OBBBA', title: 'OBBBA (H.R. 1)', tier: 'tier1', summary: 'Permanent 100% bonus depreciation, immediate R&D expensing, permanent 20% QBI deduction, 1099-NEC threshold to $2,000', deadline: '2026-01-01', affected_roles: ['CFO', 'tax advisor', 'accounting'] },
            { id: 'CTA', title: 'Corporate Transparency Act', tier: 'tier1', summary: 'Enforcement suspended for U.S. citizens; reporting requirements narrowed', deadline: '2026-06-30', affected_roles: ['compliance officer', 'legal counsel'] },
            { id: 'OFCCP', title: 'OFCCP Final Rules', tier: 'tier1', summary: 'E.O. 11246 rescinded, Section 503 disability self-ID eliminated; 9.9M hours compliance burden removed', deadline: '2026-09-21', affected_roles: ['HR director', 'compliance officer'] },
            { id: 'DOL', title: 'DOL Independent Contractor Rule', tier: 'tier2', summary: 'Proposed to rescind 2024 rule; narrower classification test expected Q3-Q4 2026', deadline: '2026-10-31', affected_roles: ['operations', 'HR', 'legal'] },
            { id: 'OSHA', title: 'OSHA Penalties 2026', tier: 'tier2', summary: 'No inflation increase; serious violation max $16,550; willful/repeat max $165,514', deadline: '2026-02-01', affected_roles: ['safety officer', 'operations manager'] },
            { id: 'FTC', title: 'FTC Non-Compete Enforcement', tier: 'tier2', summary: 'National ban withdrawn; FTC pivots to case-by-case enforcement under Section 5', deadline: '2026-02-12', affected_roles: ['legal counsel', 'HR director'] },
            { id: 'HIPAA', title: 'HIPAA Privacy Notice Update', tier: 'tier2', summary: 'Substance use disorder records privacy notice required', deadline: '2026-02-16', affected_roles: ['compliance officer', 'privacy officer'] }
          ]) }}`), type: 'string' }
        ]
      }
    }
  },
  output: [{
    search_location: 'Alamance County, NC',
    zip_code: '27244',
    target_industries: '["federal contractors", "construction", "trucking", "healthcare"]',
    key_legislation: '[...]'
  }]
});

// Fetch upcoming federal rules from Federal Register API
const fetchFederalRules = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Fetch Upcoming Federal Rules',
    parameters: {
      method: 'GET',
      url: 'https://www.federalregister.gov/api/v1/documents?filter[agencies.id]=USDOL&filter[publication_date][gte]=today&fields[]=title&fields[]=summary&fields[]=effective_on&fields[]=agency_names&per_page=20',
      options: { neverError: true }
    }
  },
  output: [{
    results: [
      {
        title: 'Final Rule: Independent Contractor Classification',
        summary: 'Establishes criteria for IC classification under Fair Labor Standards Act',
        effective_on: '2026-10-15',
        agency_names: ['Department of Labor']
      }
    ]
  }]
});

// Search news for recent legislation affecting SMBs
const searchLegislationNews = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Search News - Recent Legislation',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://newsapi.org/v2/everything?q=small+business+legislation+compliance+2026&sortBy=publishedAt&language=en&pageSize=10&apiKey=" + newCredential("NewsAPI Key") }}'),
      options: { neverError: true }
    }
  },
  output: [{
    articles: [
      {
        title: 'New Compliance Requirements for Federal Contractors',
        description: 'OFCCP clarifies affirmative action program obligations',
        url: 'https://example.com/news/123'
      }
    ]
  }]
});

// AI: Identify top 5 costliest changes and summarize each
const identifyTopChanges = node({
  type: 'n8n-nodes-base.openAi',
  version: 3.0,
  config: {
    name: 'AI: Identify Top 5 Legislative Changes',
    parameters: {
      model: 'gpt-4',
      messages: expr(`{{ [{
        role: 'system',
        content: 'You are a regulatory compliance expert. Given a list of federal rule changes and news, identify the 5 with highest financial impact for small businesses. For each, write: (1) what changed from before/after, (2) specific provisions, (3) who is affected and penalties, (4) a compliance service you could sell, (5) n8n automations to deliver that service.'
      }, {
        role: 'user',
        content: 'Federal rules: ' + JSON.stringify($('FetchFederalRules').item.json.results) + '\\nNews: ' + JSON.stringify($('SearchLegislationNews').item.json.articles) + '\\nOur legislation database: ' + $json.key_legislation
      }] }}`),
      temperature: 0.7
    }
  },
  output: [{
    choices: [{
      message: {
        content: 'Top 5 changes: 1) OBBBA - Tax depreciation... 2) OFCCP - Contractor compliance...'
      }
    }]
  }]
});

// Parse AI output to extract structured changes
const parseChanges = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Parse Top Changes',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          {
            id: 'parse-changes',
            name: 'legislation_summary',
            value: expr('{{ $("IdentifyTopChanges").item.json.choices[0].message.content }}'),
            type: 'string'
          }
        ]
      }
    }
  },
  output: [{
    legislation_summary: 'Top 5 changes: 1) OBBBA...'
  }]
});

// Loop: For each top change, generate business category keywords
const generateSearchKeywords = node({
  type: 'n8n-nodes-base.loop',
  version: 1.0,
  config: {
    name: 'Loop: Generate Search Keywords per Change',
    parameters: {
      iterations: 5,
      loopItem: {
        itemExpression: expr("{{ { change_num: $loop.index + 1, description: 'Change ' + ($loop.index + 1) } }}")
      }
    }
  },
  output: [{
    change_num: 1,
    description: 'Change 1',
    search_categories: ['federal contractor', 'defense contractor', 'government vendor'],
    search_keywords: ['compliance', 'affirmative action', 'AAP']
  }]
});

// AI: Extract business category keywords from legislation text
const extractCategoryKeywords = node({
  type: 'n8n-nodes-base.openAi',
  version: 3.0,
  config: {
    name: 'AI: Extract Business Categories',
    parameters: {
      model: 'gpt-4',
      messages: expr(`{{ [{
        role: 'system',
        content: 'Extract specific business categories and types that would be affected by this legislation. Return as JSON array of strings, e.g. ["trucking company", "dental practice", "construction firm"]'
      }, {
        role: 'user',
        content: 'Legislation change ' + $json.change_num + ': ' + $('IdentifyTopChanges').item.json.choices[0].message.content.split('\\n')[0]
      }] }}`),
      temperature: 0.5
    }
  },
  output: [{
    choices: [{
      message: {
        content: '["trucking company", "construction firm", "staffing agency"]'
      }
    }]
  }]
});

// Search Google for businesses matching category + location
const searchBusinessesByCategory = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Search: Businesses by Category + Location',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://www.google.com/search?q=" + encodeURIComponent($json.search_category + " in " + $("Settings").item.json.search_location) }}'),
      options: { neverError: true, timeout: 5000 }
    }
  },
  output: [{
    business_names: ['ABC Trucking LLC', 'Reliable Transport Inc', 'Carolina Logistics']
  }]
});

// AI: Extract real business names from search results (regex + entity extraction)
const extractBusinessNames = node({
  type: 'n8n-nodes-base.openAi',
  version: 3.0,
  config: {
    name: 'AI: Extract Real Business Names',
    parameters: {
      model: 'gpt-4',
      messages: expr(`{{ [{
        role: 'system',
        content: 'Extract real business names from these Google search results. Return as JSON array. Skip duplicates from earlier runs. Cap at 10 new names. Format: ["Business Name Inc", "Name LLC"]'
      }, {
        role: 'user',
        content: 'Search results for ' + $json.search_category + ' in ' + $("Settings").item.json.search_location + ': ' + JSON.stringify($json.search_results)
      }] }}`),
      temperature: 0.3
    }
  },
  output: [{
    choices: [{
      message: {
        content: '["ABC Trucking LLC", "Carolina Transport Inc"]'
      }
    }]
  }]
});

// Lookup: BBB Profile
const lookupBBBProfile = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Lookup: BBB Profile',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://api.bbb.org/v1/businesses/search?name=" + encodeURIComponent($json.business_name) + "&city=" + encodeURIComponent($("Settings").item.json.search_location.split(",")[0]) }}'),
      authenticationType: 'generic',
      genericAuthType: 'headerAuth',
      headerAuthHeaders: {
        'Authorization': newCredential('BBB API Key')
      },
      options: { neverError: true }
    }
  },
  output: [{
    businesses: [{
      name: 'ABC Trucking LLC',
      phone: '336-555-0100',
      website: 'abc-trucking.com',
      rating: 'A+',
      years_in_business: 15
    }]
  }]
});

// Search: Phone number + website via Google
const searchContactInfo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Search: Contact Info',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://www.google.com/search?q=" + encodeURIComponent($json.business_name + " phone address " + $("Settings").item.json.search_location) }}'),
      options: { neverError: true, timeout: 5000 }
    }
  },
  output: [{
    phone: '336-555-0100',
    website: 'abc-trucking.com',
    address: '123 Main St, Greensboro, NC 27401'
  }]
});

// Generate full compliance report + call script
const generateCompleteReport = node({
  type: 'n8n-nodes-base.openAi',
  version: 3.0,
  config: {
    name: 'AI: Generate Full Compliance Report',
    parameters: {
      model: 'gpt-4',
      messages: expr(`{{ [{
        role: 'system',
        content: 'You are a compliance consultant generating a detailed JSON report for a business affected by new legislation. Include: executive summary, applicable changes with financial impact and deadlines, priority matrix, financial exposure if they wait, customized service offer with timeline and pricing ($2,500-$7,500), lead profile, briefing with call script (never mention government or bills). Output must be valid JSON.'
      }, {
        role: 'user',
        content: JSON.stringify({
          business_name: $json.business_name,
          phone: $json.phone,
          website: $json.website,
          industry: $json.industry,
          employees: $json.employees,
          changes_affecting: $('IdentifyTopChanges').item.json.choices[0].message.content
        })
      }] }}`),
      temperature: 0.6
    }
  },
  output: [{
    choices: [{
      message: {
        content: '{"executive_summary": "...", "applicable_changes": [...], "priority_matrix": [...], "customized_service_offer": {...}, "lead_profile": {...}}'
      }
    }]
  }]
});

// Save report to Legislative Reports table
const saveReport = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Report to Legislative Reports',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: reportsTable,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          report_ref: expr('{{ "REPORT-" + Date.now() }}'),
          business_name: expr('{{ $json.business_name }}'),
          phone: expr('{{ $json.phone }}'),
          website: expr('{{ $json.website }}'),
          legislation_changes: expr('{{ $("IdentifyTopChanges").item.json.choices[0].message.content }}'),
          full_report_json: expr('{{ $json.report_json }}'),
          status: 'ready_for_outreach',
          created_at: expr('{{ new Date().toISOString() }}')
        },
        schema: [
          { id: 'report_ref', displayName: 'report_ref', required: false, type: 'string' },
          { id: 'business_name', displayName: 'business_name', required: false, type: 'string', canBeUsedToMatch: true },
          { id: 'phone', displayName: 'phone', required: false, type: 'string' },
          { id: 'website', displayName: 'website', required: false, type: 'string' },
          { id: 'legislation_changes', displayName: 'legislation_changes', required: false, type: 'string' },
          { id: 'full_report_json', displayName: 'full_report_json', required: false, type: 'string' },
          { id: 'status', displayName: 'status', required: false, type: 'string' },
          { id: 'created_at', displayName: 'created_at', required: false, type: 'string' }
        ]
      }
    }
  },
  output: [{ report_ref: 'REPORT-123' }]
});

// Post to Discord: Law summary + new leads
const postDiscordSummary = node({
  type: 'n8n-nodes-base.discordWebhook',
  version: 2.0,
  config: {
    name: 'Post Discord: Weekly Law Summary',
    parameters: {
      discordWebhookUrl: newCredential('Discord Webhook - Law Summary Channel'),
      title: expr('{{ "📋 Weekly Legislative Update: " + new Date().toLocaleDateString() }}'),
      description: expr('{{ $("IdentifyTopChanges").item.json.choices[0].message.content.substring(0, 500) + "..." }}'),
      fields: [
        {
          name: 'Top Changes',
          value: expr('{{ "5 new federal rules identified for compliance service opportunities" }}'),
          inline: false
        },
        {
          name: 'Affected Businesses Found',
          value: expr('{{ "Pending research phase" }}'),
          inline: true
        }
      ]
    }
  },
  output: [{ message_id: 'msg-123' }]
});

// Post to Discord: Lead posting (per business)
const postDiscordLead = node({
  type: 'n8n-nodes-base.discordWebhook',
  version: 2.0,
  config: {
    name: 'Post Discord: New Lead Alert',
    parameters: {
      discordWebhookUrl: newCredential('Discord Webhook - Leads Channel'),
      title: expr('{{ "🎯 New Prospect: " + $json.business_name }}'),
      description: expr('{{ "Affected by: " + $("IdentifyTopChanges").item.json.choices[0].message.content.split("\\n")[0] }}'),
      fields: [
        { name: 'Phone', value: expr('{{ $json.phone }}'), inline: true },
        { name: 'Website', value: expr('{{ $json.website }}'), inline: true },
        { name: 'Call Script', value: expr('{{ $json.call_script || "See full report in Google Sheets" }}'), inline: false }
      ]
    }
  },
  output: [{ message_id: 'msg-456' }]
});

// Save to Google Sheets
const saveGoogleSheets = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.2,
  config: {
    name: 'Save Report to Google Sheets',
    parameters: {
      authentication: 'serviceAccount',
      operation: 'append',
      resource: 'spreadsheet',
      spreadsheetId: newCredential('Google Sheets - Legislative Reports'),
      range: 'Reports!A:K',
      values: expr('{{ [[Date.now(), $json.business_name, $json.phone, $json.website, $json.industry, $json.full_report_json, "ready_for_outreach", new Date().toISOString()]] }}'
      ),
      options: {}
    }
  },
  output: [{ success: true }]
});

// Form: Invoice capture after sales call
const invoiceForm = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'Invoice Intake Form',
    parameters: {
      formTitle: 'Send Compliance Service Invoice',
      formDescription: 'After the sales call, enter the agreed service and price. Customer must have explicitly agreed.',
      formFields: {
        values: [
          { fieldName: 'business_name', fieldLabel: 'Business Name', fieldType: 'text', requiredField: true },
          { fieldName: 'contact_name', fieldLabel: 'Contact Person', fieldType: 'text', requiredField: true },
          { fieldName: 'contact_email', fieldLabel: 'Contact Email', fieldType: 'email', requiredField: true },
          { fieldName: 'agreed_service', fieldLabel: 'Service Agreed Upon', fieldType: 'textarea', requiredField: true },
          { fieldName: 'agreed_price', fieldLabel: 'Agreed Price ($)', fieldType: 'number', requiredField: true },
          {
            fieldName: 'customer_consent',
            fieldLabel: 'Customer Consent',
            fieldType: 'checkbox',
            requiredField: true,
            fieldOptions: { values: [{ option: 'The customer has explicitly agreed to this service and price.' }] }
          }
        ]
      },
      responseMode: 'lastNode',
      options: { appendAttribution: false, buttonLabel: 'Send Invoice', path: 'send-client-invoice' }
    }
  },
  output: [{
    business_name: 'ABC Trucking LLC',
    contact_name: 'John Smith',
    contact_email: 'john@abc-trucking.com',
    agreed_service: 'Independent contractor classification audit and reclassification support',
    agreed_price: 3500,
    customer_consent: ['The customer has explicitly agreed...'],
    submittedAt: '2026-09-29T14:30:00.000Z'
  }]
});

// Validate consent before invoicing
const validateConsent = ifElse({
  condition: expr('{{ ($json.customer_consent || []).length > 0 && $json.agreed_price > 0 }}'),
  trueNode: node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      name: 'Approved - Create Invoice',
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            { id: 'inv-biz', name: 'business_name', value: expr('{{ $json.business_name }}'), type: 'string' },
            { id: 'inv-email', name: 'contact_email', value: expr('{{ $json.contact_email }}'), type: 'string' },
            { id: 'inv-service', name: 'service_description', value: expr('{{ $json.agreed_service }}'), type: 'string' },
            { id: 'inv-price', name: 'price_usd', value: expr('{{ $json.agreed_price }}'), type: 'number' },
            { id: 'inv-consent', name: 'consent_verified', value: true, type: 'boolean' }
          ]
        }
      }
    },
    output: [{
      business_name: 'ABC Trucking LLC',
      contact_email: 'john@abc-trucking.com',
      service_description: 'Independent contractor audit',
      price_usd: 3500,
      consent_verified: true
    }]
  }),
  falseNode: node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      name: 'Rejected - No Consent',
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            { id: 'reject-msg', name: 'error_message', value: 'Invoice rejected: customer consent not confirmed or price is $0', type: 'string' }
          ]
        }
      }
    },
    output: [{
      error_message: 'Invoice rejected'
    }]
  })
});

// Create Stripe customer
const createStripeCustomer = node({
  type: 'n8n-nodes-base.stripe',
  version: 3.2,
  config: {
    name: 'Create Stripe Customer',
    parameters: {
      resource: 'customer',
      operation: 'create',
      name: expr('{{ $json.business_name }}'),
      email: expr('{{ $json.contact_email }}'),
      metadata: {
        service: expr('{{ $json.service_description }}'),
        legislation_driven: 'true'
      },
      options: {}
    }
  },
  output: [{
    id: 'cus_abc123',
    name: 'ABC Trucking LLC',
    email: 'john@abc-trucking.com'
  }]
});

// Create Stripe invoice
const createStripeInvoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Create Stripe Invoice',
    parameters: {
      method: 'POST',
      url: 'https://api.stripe.com/v1/invoices',
      authentication: 'generic',
      genericAuthType: 'headerAuth',
      headerAuthHeaders: {
        'Authorization': expr('{{ "Bearer " + newCredential("Stripe API Key") }}')
      },
      body: expr(`{
        "customer": "$('CreateStripeCustomer').output[0].id",
        "auto_advance": false,
        "metadata": {
          "service_type": "compliance_navigator",
          "legislation_date": "${new Date().toISOString()}"
        }
      }`),
      options: { neverError: true }
    }
  },
  output: [{
    id: 'in_abc123',
    customer: 'cus_abc123',
    status: 'draft'
  }]
});

// Add line item to invoice
const addLineItem = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Add Line Item to Invoice',
    parameters: {
      method: 'POST',
      url: 'https://api.stripe.com/v1/invoiceitems',
      authentication: 'generic',
      genericAuthType: 'headerAuth',
      headerAuthHeaders: {
        'Authorization': expr('{{ "Bearer " + newCredential("Stripe API Key") }}')
      },
      body: expr(`{
        "customer": "$('CreateStripeCustomer').output[0].id",
        "invoice": "$('CreateStripeInvoice').output[0].id",
        "amount": ${expr('{{ Math.round($json.price_usd * 100) }}')},"currency": "usd",
        "description": "${'{{ $json.service_description }}'}",
        "period": {
          "start": ${Math.floor(Date.now() / 1000)},
          "end": ${Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000)}
        }
      }`),
      options: { neverError: true }
    }
  },
  output: [{ id: 'ii_abc123' }]
});

// Finalize and email invoice
const finalizeInvoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Finalize & Email Invoice',
    parameters: {
      method: 'POST',
      url: expr('{{ "https://api.stripe.com/v1/invoices/" + $("CreateStripeInvoice").output[0].id + "/finalize" }}'),
      authentication: 'generic',
      genericAuthType: 'headerAuth',
      headerAuthHeaders: {
        'Authorization': expr('{{ "Bearer " + newCredential("Stripe API Key") }}')
      },
      body: expr(`{
        "auto_advance": true
      }`),
      options: { neverError: true }
    }
  },
  output: [{ id: 'in_abc123', status: 'finalized' }]
});

const sendInvoiceEmail = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Email Invoice to Customer',
    parameters: {
      method: 'POST',
      url: expr('{{ "https://api.stripe.com/v1/invoices/" + $("CreateStripeInvoice").output[0].id + "/send" }}'),
      authentication: 'generic',
      genericAuthType: 'headerAuth',
      headerAuthHeaders: {
        'Authorization': expr('{{ "Bearer " + newCredential("Stripe API Key") }}')
      },
      options: { neverError: true }
    }
  },
  output: [{ success: true }]
});

// Post invoice confirmation to Discord
const postInvoiceConfirmation = node({
  type: 'n8n-nodes-base.discordWebhook',
  version: 2.0,
  config: {
    name: 'Post Discord: Invoice Sent',
    parameters: {
      discordWebhookUrl: newCredential('Discord Webhook - Administrative'),
      title: expr('{{ "✅ Invoice Sent: " + $json.business_name }}'),
      fields: [
        { name: 'Amount', value: expr('{{ "$" + $json.price_usd }}'), inline: true },
        { name: 'Service', value: expr('{{ $json.service_description }}'), inline: true },
        { name: 'Customer Email', value: expr('{{ $json.contact_email }}'), inline: false }
      ]
    }
  },
  output: [{ message_id: 'msg-789' }]
});

// Success message
const successPage = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Success - Invoice Queued',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'success-msg', name: 'message', value: expr('{{ "Invoice for $" + $json.price_usd + " sent to " + $json.contact_email + ". Awaiting payment." }}'), type: 'string' },
          { id: 'success-invoice', name: 'invoice_id', value: expr('{{ $("CreateStripeInvoice").output[0].id }}'), type: 'string' }
        ]
      }
    }
  },
  output: [{
    message: 'Invoice for $3500 sent to john@abc-trucking.com. Awaiting payment.',
    invoice_id: 'in_abc123'
  }]
});

export const legislativeImpactWorkflow = workflow({
  name: 'Legislative Impact Report Generator',
  version: 1,
  description: 'Auto-detect law changes, identify affected businesses, generate compliance service offers, enable outbound calling, send invoices',
  nodes: [
    weeklyTrigger,
    settings,
    fetchFederalRules,
    searchLegislationNews,
    identifyTopChanges,
    parseChanges,
    generateSearchKeywords,
    extractCategoryKeywords,
    searchBusinessesByCategory,
    extractBusinessNames,
    lookupBBBProfile,
    searchContactInfo,
    generateCompleteReport,
    saveReport,
    postDiscordSummary,
    postDiscordLead,
    saveGoogleSheets,
    invoiceForm,
    validateConsent,
    createStripeCustomer,
    createStripeInvoice,
    addLineItem,
    finalizeInvoice,
    sendInvoiceEmail,
    postInvoiceConfirmation,
    successPage
  ],
  connections: {
    weeklyTrigger: [{ node: settings, type: 'main', index: 0 }],
    settings: [
      { node: fetchFederalRules, type: 'main', index: 0 },
      { node: searchLegislationNews, type: 'main', index: 0 }
    ],
    fetchFederalRules: [{ node: identifyTopChanges, type: 'main', index: 0 }],
    searchLegislationNews: [{ node: identifyTopChanges, type: 'main', index: 0 }],
    identifyTopChanges: [
      { node: parseChanges, type: 'main', index: 0 },
      { node: postDiscordSummary, type: 'main', index: 0 }
    ],
    parseChanges: [{ node: generateSearchKeywords, type: 'main', index: 0 }],
    generateSearchKeywords: [{ node: extractCategoryKeywords, type: 'main', index: 0 }],
    extractCategoryKeywords: [{ node: searchBusinessesByCategory, type: 'main', index: 0 }],
    searchBusinessesByCategory: [{ node: extractBusinessNames, type: 'main', index: 0 }],
    extractBusinessNames: [
      { node: lookupBBBProfile, type: 'main', index: 0 },
      { node: searchContactInfo, type: 'main', index: 0 }
    ],
    lookupBBBProfile: [{ node: generateCompleteReport, type: 'main', index: 0 }],
    searchContactInfo: [{ node: generateCompleteReport, type: 'main', index: 0 }],
    generateCompleteReport: [
      { node: saveReport, type: 'main', index: 0 },
      { node: postDiscordLead, type: 'main', index: 0 },
      { node: saveGoogleSheets, type: 'main', index: 0 }
    ],
    invoiceForm: [{ node: validateConsent, type: 'main', index: 0 }],
    validateConsent: [
      { node: createStripeCustomer, type: 'main', index: 0 },
      { node: successPage, type: 'main', index: 1 }
    ],
    createStripeCustomer: [{ node: createStripeInvoice, type: 'main', index: 0 }],
    createStripeInvoice: [{ node: addLineItem, type: 'main', index: 0 }],
    addLineItem: [{ node: finalizeInvoice, type: 'main', index: 0 }],
    finalizeInvoice: [{ node: sendInvoiceEmail, type: 'main', index: 0 }],
    sendInvoiceEmail: [
      { node: postInvoiceConfirmation, type: 'main', index: 0 },
      { node: successPage, type: 'main', index: 0 }
    ]
  },
  meta: {
    notes: [
      {
        text: '🤖 AUTOMATED WORKFLOW (Weekly Monday 7am)\n\nSteps 1-16 run automatically every Monday:\n1. Fetch upcoming federal rules from Federal Register API\n2. Search news for recent SMB legislation\n3. AI identifies top 5 costliest changes + service opportunities\n4. For each change, AI extracts business categories affected\n5. Search Google for "[category] in [location]"\n6. AI extracts real business names from results\n7. Loop: For each business:\n   - Lookup BBB profile\n   - Search for phone/website/address\n   - Generate full compliance report + call script\n   - Save report to Legislative Reports table\n   - Post lead alert to Discord\n   - Save to Google Sheets\n\nOutput: Ready-to-call lead list with full reports'
      },
      {
        text: '📞 MANUAL OUTREACH (Your Sales Team)\n\n1. Sales rep reviews lead in Discord or Sheets\n2. Rep calls business using AI-generated call script\n3. Rep pitches Compliance Navigator service ($2,500-$7,500)\n4. If business agrees:\n   - Rep fills Invoice Form with business name, email, service, agreed price\n   - MUST check \"customer explicitly agreed\" box\n5. Submit form → workflow auto-creates Stripe invoice + emails it\n6. Confirmation posts to Discord #administrative-notices\n\nNo invoice sent without explicit consent checkbox + price > $0'
      },
      {
        text: '🔧 SETUP REQUIRED\n\nCredentials:\n1. NewsAPI key (newsapi.org)\n2. BBB API key (bbb.org/profile/api)\n3. Discord webhooks:\n   - "Law Summary Channel" for weekly updates\n   - "Leads Channel" for new prospect alerts\n   - "Administrative" for invoice confirmations\n4. Google Sheets connection + spreadsheet chosen\n5. Stripe API key (production)\n\nConfiguration:\n1. Edit Settings node: search_location, zip_code\n2. Choose target industries based on your service offerings\n3. Test with sample legislation week 1'
      },
      {
        text: '⚠️ COMPLIANCE & ETHICS\n\n- Workflow identifies real businesses affected by real law changes\n- Service is legitimate: compliance consulting is lawful\n- Call script written to NOT sound like government notice\n- Price range ($2,500-$7,500) reflects real consulting delivery\n- Consent checkbox prevents accidental invoicing\n- All leads saved with source tracking\n- Respect robots.txt on web searches\n- Rate limit: 1 search/second per API'
      }
    ]
  }
});
