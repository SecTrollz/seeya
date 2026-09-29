import { workflow, node, trigger, sticky, newCredential, ifElse, expr } from '@n8n/workflow-sdk';

const leadsTable = { __rl: true, mode: 'id', value: '1PpAYbgev6sKzZsc', cachedResultName: 'Leads Pipeline' };
const stripeCred = { stripeApi: { id: 'hO57ixwoW0LItmz5', name: 'Stripe account' } };
const twilioCred = { twilioApi: newCredential('Twilio account') };

const agreementHtml = '<h3>Please review before signing</h3>'
  + '<p>This agreement was prepared by our AI contract assistant from our standard terms. Tap each section to expand it.</p>'
  + '<details><summary><strong>1. Service Terms</strong></summary>'
  + '<p>We will deliver the service package described on your invoice within the timeline agreed on your call. You agree to provide the documents and access we reasonably need. Either party may end the engagement with 30 days written notice; work completed up to that date remains payable.</p>'
  + '<p>Payment is due by the date shown on the Stripe invoice. Fees are non-refundable once work has started, except where required by law.</p>'
  + '</details>'
  + '<details><summary><strong>2. Privacy Policy</strong></summary>'
  + '<p>We collect your name, email, phone number, company and the details you provide, only to deliver this service, send your invoice and contact you about it. Payments are processed by Stripe; text messages by Twilio. We do not sell your data. You may request access, correction or deletion at any time by emailing us. California and EU residents have the additional rights described in our full privacy policy.</p>'
  + '</details>'
  + '<details><summary><strong>3. Fine Print</strong></summary>'
  + '<p>Our work is compliance support, not legal advice, and results are not guaranteed. Our total liability is limited to the fees you paid for this service. We are not liable for indirect or consequential damages. Disputes are resolved by binding individual arbitration in our home state; class actions are waived. You are responsible for your own filings and compliance decisions.</p>'
  + '</details>'
  + '<details><summary><strong>4. Electronic Signature</strong></summary>'
  + '<p>Typing your full name below and checking the box is your electronic signature under the U.S. E-SIGN Act and UETA and has the same effect as a handwritten signature. We record the time of signing with your answers.</p>'
  + '</details>';

const intakeForm = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'Lead Intake Form',
    parameters: {
      formTitle: 'Request a Compliance Consultation',
      formDescription: '🤖 Our AI intake assistant will text you a one-time code to verify your number, ask three quick questions, and prepare your agreement.',
      formFields: {
        values: [
          { fieldName: 'full_name', fieldLabel: 'Full name', fieldType: 'text', requiredField: true },
          { fieldName: 'email', fieldLabel: 'Email', fieldType: 'email', requiredField: true },
          { fieldName: 'phone', fieldLabel: 'Mobile phone', fieldType: 'text', placeholder: '(336) 555-0123', requiredField: true },
          { fieldName: 'company', fieldLabel: 'Company', fieldType: 'text' },
          { fieldName: 'request_details', fieldLabel: 'What do you need help with?', fieldType: 'textarea', requiredField: true },
          {
            fieldName: 'consent',
            fieldLabel: 'Consent',
            fieldType: 'checkbox',
            requiredField: true,
            fieldOptions: { values: [{ option: 'I agree to receive text messages at this number about my request, including a one-time verification code. Msg & data rates may apply. Reply STOP to opt out.' }] }
          }
        ]
      },
      responseMode: 'lastNode',
      options: { appendAttribution: false, buttonLabel: 'Text me a code', path: 'lead-intake', ignoreBots: true }
    }
  },
  output: [{ full_name: 'Jane Doe', email: 'jane@example.com', phone: '(336) 555-0123', company: 'Acme', request_details: 'OSHA posting help', consent: ['I agree to receive text messages...'], submittedAt: '2026-09-29T12:00:00.000Z', formMode: 'production' }]
});

const prepareLead = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Prepare Lead',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'ref', name: 'lead_ref', value: expr('LEAD-{{ $execution.id }}'), type: 'string' },
          { id: 'e164', name: 'phone_e164', value: expr("{{ (() => { const d = String($json.phone || '').replace(/[^\\d]/g, ''); if (String($json.phone || '').trim().startsWith('+')) return '+' + d; if (d.length === 10) return '+1' + d; if (d.length === 11 && d.startsWith('1')) return '+' + d; return '+' + d; })() }}"), type: 'string' },
          { id: 'consent', name: 'consent_text', value: expr("{{ ($json.consent || []).join(' ') }}"), type: 'string' },
          { id: 'verify', name: 'twilio_verify_sid', value: 'VA_REPLACE_WITH_YOUR_VERIFY_SERVICE_SID', type: 'string' },
          { id: 'svc', name: 'service_name', value: 'Compliance Navigator', type: 'string' },
          { id: 'price', name: 'price_usd', value: 2500, type: 'number' },
          { id: 'due', name: 'days_until_due', value: 14, type: 'number' },
          { id: 'ver', name: 'agreement_version', value: 'v1-2026-09', type: 'string' }
        ]
      },
      options: {}
    }
  },
  output: [{ full_name: 'Jane Doe', email: 'jane@example.com', phone: '(336) 555-0123', company: 'Acme', request_details: 'OSHA posting help', submittedAt: '2026-09-29T12:00:00.000Z', lead_ref: 'LEAD-123', phone_e164: '+13365550123', consent_text: 'I agree...', twilio_verify_sid: 'VA123', service_name: 'Compliance Navigator', price_usd: 2500, days_until_due: 14, agreement_version: 'v1-2026-09' }]
});

const saveLead = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save New Lead',
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: leadsTable,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          lead_ref: expr('{{ $json.lead_ref }}'),
          full_name: expr('{{ $json.full_name }}'),
          email: expr('{{ $json.email }}'),
          phone: expr('{{ $json.phone_e164 }}'),
          company: expr('{{ $json.company }}'),
          request_details: expr('{{ $json.request_details }}'),
          consent_text: expr('{{ $json.consent_text }}'),
          consent_at: expr('{{ $json.submittedAt }}'),
          status: 'new',
          service_name: expr('{{ $json.service_name }}'),
          price_usd: expr('{{ $json.price_usd }}'),
          agreement_version: expr('{{ $json.agreement_version }}'),
          followup_count: 0
        },
        schema: [
          { id: 'lead_ref', displayName: 'lead_ref', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'full_name', displayName: 'full_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'email', displayName: 'email', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'company', displayName: 'company', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'request_details', displayName: 'request_details', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'consent_text', displayName: 'consent_text', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'consent_at', displayName: 'consent_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true },
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'service_name', displayName: 'service_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'price_usd', displayName: 'price_usd', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'agreement_version', displayName: 'agreement_version', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'followup_count', displayName: 'followup_count', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1, createdAt: '2026-09-29T12:00:01.000Z', updatedAt: '2026-09-29T12:00:01.000Z' }]
});

const sendCode = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Text Verification Code',
    parameters: {
      method: 'POST',
      url: expr('https://verify.twilio.com/v2/Services/{{ $("Prepare Lead").item.json.twilio_verify_sid }}/Verifications'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'twilioApi',
      sendBody: true,
      contentType: 'form-urlencoded',
      bodyParameters: {
        parameters: [
          { name: 'To', value: expr('{{ $("Prepare Lead").item.json.phone_e164 }}') },
          { name: 'Channel', value: 'sms' }
        ]
      },
      options: {}
    },
    credentials: twilioCred
  },
  output: [{ sid: 'VE123', status: 'pending', to: '+13365550123', channel: 'sms' }]
});

const enterCode = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: {
    name: 'Enter Code Page',
    parameters: {
      operation: 'page',
      formFields: {
        values: [
          { fieldName: 'otp_code', fieldLabel: '6-digit code', fieldType: 'text', placeholder: '123456', requiredField: true }
        ]
      },
      limitWaitTime: true,
      limitType: 'afterTimeInterval',
      resumeAmount: 15,
      resumeUnit: 'minutes',
      options: {
        formTitle: 'Check your texts',
        formDescription: expr('🤖 Our AI assistant just texted a 6-digit code to {{ $("Prepare Lead").item.json.phone_e164 }}. Enter it below within 15 minutes.'),
        buttonLabel: 'Verify'
      }
    }
  },
  output: [{ otp_code: '123456' }]
});

const checkCode = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Check Verification Code',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://verify.twilio.com/v2/Services/{{ $("Prepare Lead").item.json.twilio_verify_sid }}/VerificationCheck'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'twilioApi',
      sendBody: true,
      contentType: 'form-urlencoded',
      bodyParameters: {
        parameters: [
          { name: 'To', value: expr('{{ $("Prepare Lead").item.json.phone_e164 }}') },
          { name: 'Code', value: expr('{{ String($json.otp_code || "").trim() }}') }
        ]
      },
      options: {}
    },
    credentials: twilioCred
  },
  output: [{ sid: 'VE123', status: 'approved', valid: true }]
});

const codeApproved = ifElse({
  version: 2.2,
  config: {
    name: 'Code Approved?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.status }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'approved' }],
        combinator: 'and'
      }
    }
  }
});

const markVerified = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark Phone Verified',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: leadsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'lead_ref', condition: 'eq', keyValue: expr('{{ $("Prepare Lead").item.json.lead_ref }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'verified', otp_status: 'approved', otp_verified_at: expr('{{ $now.toISO() }}') },
        schema: [
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'otp_status', displayName: 'otp_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'otp_verified_at', displayName: 'otp_verified_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const prescreenPage = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: {
    name: 'Prescreen Questions Page',
    parameters: {
      operation: 'page',
      formFields: {
        values: [
          { fieldName: 'pq_timeline', fieldLabel: 'When do you need this done?', fieldType: 'dropdown', requiredField: true, fieldOptions: { values: [{ option: 'Within 30 days' }, { option: '30-60 days' }, { option: '60+ days' }] } },
          { fieldName: 'pq_budget', fieldLabel: 'Is a budget of $2,500-$7,500 workable for this service?', fieldType: 'dropdown', requiredField: true, fieldOptions: { values: [{ option: 'Yes' }, { option: 'No' }] } },
          { fieldName: 'pq_decision_maker', fieldLabel: 'Are you the decision-maker?', fieldType: 'dropdown', requiredField: true, fieldOptions: { values: [{ option: 'Yes' }, { option: 'No, I need to check with someone' }] } },
          { fieldName: 'pq_notes', fieldLabel: 'Anything else we should know?', fieldType: 'textarea' }
        ]
      },
      limitWaitTime: true,
      limitType: 'afterTimeInterval',
      resumeAmount: 2,
      resumeUnit: 'hours',
      options: {
        formTitle: 'Phone verified ✓',
        formDescription: '🤖 Three quick questions so our AI assistant can match you with the right service.',
        buttonLabel: 'Continue'
      }
    }
  },
  output: [{ pq_timeline: 'Within 30 days', pq_budget: 'Yes', pq_decision_maker: 'Yes', pq_notes: '' }]
});

const scorePrescreen = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'AI Qualification Score',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'score', name: 'prescreen_score', value: expr("{{ ($json.pq_timeline === 'Within 30 days' ? 1 : 0) + ($json.pq_budget === 'Yes' ? 1 : 0) + ($json.pq_decision_maker === 'Yes' ? 1 : 0) }}"), type: 'number' },
          { id: 'qual', name: 'qualified', value: expr("{{ $json.pq_budget === 'Yes' && (($json.pq_timeline === 'Within 30 days' ? 1 : 0) + ($json.pq_decision_maker === 'Yes' ? 1 : 0)) >= 1 }}"), type: 'boolean' }
        ]
      },
      options: {}
    }
  },
  output: [{ pq_timeline: 'Within 30 days', pq_budget: 'Yes', pq_decision_maker: 'Yes', pq_notes: '', prescreen_score: 3, qualified: true }]
});

const saveScore = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Prescreen Answers',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: leadsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'lead_ref', condition: 'eq', keyValue: expr('{{ $("Prepare Lead").item.json.lead_ref }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          pq_timeline: expr('{{ $json.pq_timeline }}'),
          pq_budget: expr('{{ $json.pq_budget }}'),
          pq_decision_maker: expr('{{ $json.pq_decision_maker }}'),
          pq_notes: expr('{{ $json.pq_notes }}'),
          prescreen_score: expr('{{ $json.prescreen_score }}'),
          qualified: expr('{{ $json.qualified }}'),
          status: expr("{{ $json.qualified ? 'qualified' : 'nurture' }}")
        },
        schema: [
          { id: 'pq_timeline', displayName: 'pq_timeline', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'pq_budget', displayName: 'pq_budget', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'pq_decision_maker', displayName: 'pq_decision_maker', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'pq_notes', displayName: 'pq_notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'prescreen_score', displayName: 'prescreen_score', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'qualified', displayName: 'qualified', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true },
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const isQualified = ifElse({
  version: 2.2,
  config: {
    name: 'Qualified?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $("AI Qualification Score").item.json.qualified }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const agreementPage = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: {
    name: 'Agreement & Signature Page',
    parameters: {
      operation: 'page',
      formFields: {
        values: [
          { fieldType: 'html', elementName: 'agreement_text', html: agreementHtml },
          { fieldName: 'signature_name', fieldLabel: 'Type your full legal name to sign', fieldType: 'text', requiredField: true },
          { fieldName: 'agreement_accepted', fieldLabel: 'Acceptance', fieldType: 'checkbox', requiredField: true, fieldOptions: { values: [{ option: 'I have read and agree to the Service Terms, Privacy Policy and Fine Print, and authorize the invoice.' }] } }
        ]
      },
      limitWaitTime: true,
      limitType: 'afterTimeInterval',
      resumeAmount: 1,
      resumeUnit: 'days',
      options: {
        formTitle: expr('Your {{ $("Prepare Lead").item.json.service_name }} agreement'),
        formDescription: expr('🤖 Prepared by our AI contract assistant for {{ $("Prepare Lead").item.json.full_name }}. Price: ${{ $("Prepare Lead").item.json.price_usd }}, due {{ $("Prepare Lead").item.json.days_until_due }} days after invoicing.'),
        buttonLabel: 'Sign & get my invoice'
      }
    }
  },
  output: [{ signature_name: 'Jane Doe', agreement_accepted: ['I have read and agree...'] }]
});

const createCustomer = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Create Stripe Customer',
    parameters: {
      method: 'POST',
      url: 'https://api.stripe.com/v1/customers',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'stripeApi',
      sendBody: true,
      contentType: 'form-urlencoded',
      bodyParameters: {
        parameters: [
          { name: 'name', value: expr('{{ $("Prepare Lead").item.json.full_name }}') },
          { name: 'email', value: expr('{{ $("Prepare Lead").item.json.email }}') },
          { name: 'phone', value: expr('{{ $("Prepare Lead").item.json.phone_e164 }}') },
          { name: 'metadata[lead_ref]', value: expr('{{ $("Prepare Lead").item.json.lead_ref }}') },
          { name: 'metadata[signature_name]', value: expr('{{ $json.signature_name }}') },
          { name: 'metadata[agreement_version]', value: expr('{{ $("Prepare Lead").item.json.agreement_version }}') }
        ]
      },
      options: {}
    },
    credentials: stripeCred
  },
  output: [{ id: 'cus_123', email: 'jane@example.com' }]
});

const createInvoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Create Draft Invoice',
    parameters: {
      method: 'POST',
      url: 'https://api.stripe.com/v1/invoices',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'stripeApi',
      sendBody: true,
      contentType: 'form-urlencoded',
      bodyParameters: {
        parameters: [
          { name: 'customer', value: expr('{{ $json.id }}') },
          { name: 'collection_method', value: 'send_invoice' },
          { name: 'days_until_due', value: expr('{{ $("Prepare Lead").item.json.days_until_due }}') },
          { name: 'auto_advance', value: 'false' },
          { name: 'metadata[lead_ref]', value: expr('{{ $("Prepare Lead").item.json.lead_ref }}') }
        ]
      },
      options: {}
    },
    credentials: stripeCred
  },
  output: [{ id: 'in_123', customer: 'cus_123', status: 'draft' }]
});

const addLineItem = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Add Service Line Item',
    parameters: {
      method: 'POST',
      url: 'https://api.stripe.com/v1/invoiceitems',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'stripeApi',
      sendBody: true,
      contentType: 'form-urlencoded',
      bodyParameters: {
        parameters: [
          { name: 'customer', value: expr('{{ $json.customer }}') },
          { name: 'invoice', value: expr('{{ $json.id }}') },
          { name: 'amount', value: expr('{{ Math.round($("Prepare Lead").item.json.price_usd * 100) }}') },
          { name: 'currency', value: 'usd' },
          { name: 'description', value: expr('{{ $("Prepare Lead").item.json.service_name }}') }
        ]
      },
      options: {}
    },
    credentials: stripeCred
  },
  output: [{ id: 'ii_123', invoice: 'in_123' }]
});

const sendInvoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Send Invoice',
    parameters: {
      method: 'POST',
      url: expr('https://api.stripe.com/v1/invoices/{{ $("Create Draft Invoice").item.json.id }}/send'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'stripeApi',
      options: {}
    },
    credentials: stripeCred
  },
  output: [{ id: 'in_123', number: 'ABC-0001', status: 'open', hosted_invoice_url: 'https://invoice.stripe.com/i/abc', amount_due: 250000 }]
});

const saveInvoice = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Signature & Invoice',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: leadsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'lead_ref', condition: 'eq', keyValue: expr('{{ $("Prepare Lead").item.json.lead_ref }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          agreement_signature: expr('{{ $("Agreement & Signature Page").item.json.signature_name }}'),
          agreement_accepted_at: expr('{{ $now.toISO() }}'),
          stripe_customer_id: expr('{{ $("Create Stripe Customer").item.json.id }}'),
          stripe_invoice_id: expr('{{ $json.id }}'),
          invoice_url: expr('{{ $json.hosted_invoice_url }}'),
          invoice_status: expr('{{ $json.status }}'),
          status: 'invoice_sent'
        },
        schema: [
          { id: 'agreement_signature', displayName: 'agreement_signature', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'agreement_accepted_at', displayName: 'agreement_accepted_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true },
          { id: 'stripe_customer_id', displayName: 'stripe_customer_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'stripe_invoice_id', displayName: 'stripe_invoice_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'invoice_url', displayName: 'invoice_url', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'invoice_status', displayName: 'invoice_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const invoiceSentPage = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: {
    name: 'Invoice Sent Page',
    parameters: {
      operation: 'completion',
      respondWith: 'text',
      completionTitle: 'Signed. Your invoice is on its way.',
      completionMessage: expr('Thank you, {{ $("Prepare Lead").item.json.full_name }}. Our AI billing assistant emailed invoice {{ $("Send Invoice").item.json.number }} for ${{ $("Prepare Lead").item.json.price_usd }} to {{ $("Prepare Lead").item.json.email }}. You can also pay here: {{ $("Send Invoice").item.json.hosted_invoice_url }}')
    }
  },
  output: [{}]
});

const nurturePage = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: {
    name: 'Nurture Page',
    parameters: {
      operation: 'completion',
      respondWith: 'text',
      completionTitle: 'Thanks, we will be in touch',
      completionMessage: 'Our AI assistant reviewed your answers. We will email you helpful resources and follow up when the timing is right.'
    }
  },
  output: [{}]
});

const markUnverified = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark Code Failed',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: leadsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'lead_ref', condition: 'eq', keyValue: expr('{{ $("Prepare Lead").item.json.lead_ref }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'unverified', otp_status: expr("{{ $json.status || 'failed' }}") },
        schema: [
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'otp_status', displayName: 'otp_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const codeFailedPage = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: {
    name: 'Code Failed Page',
    parameters: {
      operation: 'completion',
      respondWith: 'text',
      completionTitle: 'We could not verify that code',
      completionMessage: 'The code was incorrect or expired. Please submit the request form again to get a new code.'
    }
  },
  output: [{}]
});

const aboutNote = sticky('## 🤖 AI Lead-to-Invoice Assistant\n1. **Intake form** collects the lead with SMS consent\n2. **Twilio Verify** texts a one-time code (SMS only, no calls)\n3. **Prescreen** - three questions, auto-scored\n4. **Agreement page** - collapsible Terms / Privacy / Fine Print, typed-name e-signature\n5. **Stripe** creates and emails the invoice\n\nEvery step is recorded in the **Leads Pipeline** data table.', [], { color: 5 });

const setupNote = sticky('## ⚙️ Setup checklist\n- **Prepare Lead**: set `twilio_verify_sid`, `service_name`, `price_usd`, `days_until_due`\n- **Text Verification Code / Check Verification Code**: select a Twilio credential\n- **Agreement page**: legal text is a DRAFT from LEGAL_AGREEMENTS.md. Have an attorney review it and fill in your business name and state\n- Stripe uses your existing *Stripe account* credential\n- Publish, then open `/form/lead-intake` to test', [], { color: 3 });

export default workflow('lead-to-invoice', 'AI Lead-to-Invoice Assistant')
  .add(intakeForm)
  .to(prepareLead)
  .to(saveLead)
  .to(sendCode)
  .to(enterCode)
  .to(checkCode)
  .to(codeApproved
    .onTrue(markVerified.to(prescreenPage).to(scorePrescreen).to(saveScore).to(isQualified
      .onTrue(agreementPage.to(createCustomer).to(createInvoice).to(addLineItem).to(sendInvoice).to(saveInvoice).to(invoiceSentPage))
      .onFalse(nurturePage)))
    .onFalse(markUnverified.to(codeFailedPage)))
  .add(aboutNote)
  .add(setupNote)
  .group('AI intake & phone check', [prepareLead, saveLead, sendCode, enterCode, checkCode], { description: 'Normalizes the phone number, saves the lead, texts a Twilio Verify code and checks the reply' })
  .group('AI qualification', [markVerified, prescreenPage, scorePrescreen, saveScore], { description: 'Three prescreen questions scored automatically and saved to the Leads Pipeline' })
  .group('AI agreement & billing', [agreementPage, createCustomer, createInvoice, addLineItem, sendInvoice, saveInvoice, invoiceSentPage], { description: 'Collapsible terms with typed-name e-signature, then Stripe creates and emails the invoice' });
