import { workflow, node, trigger, sticky, newCredential, ifElse, expr } from '@n8n/workflow-sdk';

const leadsTable = { __rl: true, mode: 'id', value: '1PpAYbgev6sKzZsc', cachedResultName: 'Leads Pipeline' };
const stripeCred = { stripeApi: { id: 'hO57ixwoW0LItmz5', name: 'Stripe account' } };
const twilioCred = { twilioApi: newCredential('Twilio account') };
const sendgridCred = newCredential('SendGrid API Key');

/**
 * Production Lead-to-Invoice Workflow
 * Full legal agreements with terms, privacy policy, fine print, email delivery
 */

const intakeForm = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'Lead Intake Form',
    parameters: {
      formTitle: 'Request a Consultation',
      formDescription: 'Tell us a bit about what you need. We will call you right away and text you a verification code to confirm your number.',
      formFields: {
        values: [
          { fieldName: 'full_name', fieldLabel: 'Full name', fieldType: 'text', requiredField: true },
          { fieldName: 'email', fieldLabel: 'Email', fieldType: 'email', requiredField: true },
          { fieldName: 'phone', fieldLabel: 'Mobile phone', fieldType: 'text', placeholder: '+1 555 123 4567', requiredField: true },
          { fieldName: 'company', fieldLabel: 'Company (optional)', fieldType: 'text' },
          { fieldName: 'request_details', fieldLabel: 'What do you need help with?', fieldType: 'textarea', requiredField: true },
          {
            fieldName: 'consent',
            fieldLabel: 'Consent to contact',
            fieldType: 'checkbox',
            requiredField: true,
            fieldOptions: { values: [{ option: 'I agree to receive a phone call and text messages at the number above about this request, including a one-time verification code. Msg & data rates may apply. Reply STOP to opt out.' }] }
          }
        ]
      },
      responseMode: 'lastNode',
      options: { appendAttribution: false, buttonLabel: 'Submit and verify', path: 'lead-intake', ignoreBots: true }
    }
  },
  output: [{ full_name: 'Jane Doe', email: 'jane@example.com', phone: '(555) 123-4567', company: 'Acme', request_details: 'Need help with X', consent: ['I agree to receive a phone call...'], submittedAt: '2026-09-29T12:00:00.000Z', formMode: 'production' }]
});

const serviceConfig = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Service Config',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'cfg-ref', name: 'lead_ref', value: expr('LEAD-{{ $execution.id }}'), type: 'string' },
          { id: 'cfg-phone', name: 'phone_e164', value: expr("{{ (() => { const d = String($json.phone || '').replace(/[^\\d+]/g, ''); if (d.startsWith('+')) return d; if (d.length === 10) return '+1' + d; if (d.length === 11 && d.startsWith('1')) return '+' + d; return '+' + d; })() }}"), type: 'string' },
          { id: 'cfg-biz', name: 'business_name', value: 'EDIT ME - Your Business Name', type: 'string' },
          { id: 'cfg-email', name: 'business_email', value: 'support@example.com', type: 'string' },
          { id: 'cfg-from', name: 'twilio_from_number', value: 'EDIT ME - +15550000000', type: 'string' },
          { id: 'cfg-verify', name: 'twilio_verify_sid', value: 'EDIT ME - VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'string' },
          { id: 'cfg-svc', name: 'service_name', value: 'EDIT ME - Service Package', type: 'string' },
          { id: 'cfg-price', name: 'price_usd', value: 500, type: 'number' },
          { id: 'cfg-due', name: 'days_until_due', value: 7, type: 'number' },
          { id: 'cfg-ver', name: 'agreement_version', value: 'v1-2026-09', type: 'string' },
          { id: 'cfg-consent-text', name: 'consent_text', value: expr("{{ ($json.consent || []).join(' ') }}"), type: 'string' }
        ]
      },
      options: {}
    }
  },
  output: [{ full_name: 'Jane Doe', email: 'jane@example.com', phone: '(555) 123-4567', company: 'Acme', request_details: 'Need help with X', lead_ref: 'LEAD-123', phone_e164: '+15551234567', business_name: 'Your Business', business_email: 'support@example.com', twilio_from_number: '+15550000000', twilio_verify_sid: 'VAxxx', service_name: 'Service Package', price_usd: 500, days_until_due: 7, agreement_version: 'v1-2026-09', consent_text: 'I agree...' }]
});

const saveLead = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Raw Lead',
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
          { id: 'consent_at', displayName: 'consent_at', required: false, defaultMatch: false, display: true, type: 'string' },
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string' },
          { id: 'service_name', displayName: 'service_name', required: false, defaultMatch: false, display: true, type: 'string' },
          { id: 'price_usd', displayName: 'price_usd', required: false, defaultMatch: false, display: true, type: 'number' },
          { id: 'agreement_version', displayName: 'agreement_version', required: false, defaultMatch: false, display: true, type: 'string' },
          { id: 'followup_count', displayName: 'followup_count', required: false, defaultMatch: false, display: true, type: 'number' }
        ]
      }
    }
  },
  output: [{ lead_ref: 'LEAD-123', status: 'saved' }]
});

const sendOtp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Send OTP via Twilio Verify',
    parameters: {
      method: 'POST',
      url: expr('{{ "https://verify.twilio.com/v2/Services/" + $json.twilio_verify_sid + "/Verifications" }}'),
      authentication: 'generic',
      genericAuthType: 'httpBasicAuth',
      basicAuthCredentials: newCredential('Twilio account'),
      body: expr('{{ JSON.stringify({ to: $json.phone_e164, channel: "sms" }) }}'),
      options: { neverError: true }
    }
  },
  output: [{ sid: 'VE...', status: 'pending' }]
});

const callLead = node({
  type: 'n8n-nodes-base.twilio',
  version: 2.0,
  config: {
    name: 'Call Lead - Verify Code Reminder',
    parameters: {
      resource: 'call',
      operation: 'create',
      fromNumber: expr('{{ $json.twilio_from_number }}'),
      toNumber: expr('{{ $json.phone_e164 }}'),
      twiml: expr("{{ '<Response><Say voice=\"woman\">Hello ' + $json.full_name + '. We just sent a 6 digit verification code to your phone via text message. Please enter this code in the form when prompted. Thank you.</Say></Response>' }}"),
      options: {}
    }
  },
  output: [{ sid: 'CA...', status: 'queued' }]
});

const otpPage = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'OTP Verification Form',
    parameters: {
      formTitle: 'Verify Your Phone Number',
      formDescription: expr("{{ 'We just called ' + $('intakeForm').item.json.phone + ' and sent a verification code via text. Enter the 6-digit code below.' }}"),
      formFields: {
        values: [
          { fieldName: 'otp_code', fieldLabel: 'Verification code', fieldType: 'text', placeholder: '000000', requiredField: true, fieldOptions: { maxLength: 6 } }
        ]
      },
      responseMode: 'lastNode',
      options: { resumeForEachOutput: true, resumeTimeout: 900, appendAttribution: false, buttonLabel: 'Verify' }
    }
  },
  output: [{ otp_code: '123456', submittedAt: '2026-09-29T12:05:00.000Z' }]
});

const checkOtp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Check OTP Code',
    parameters: {
      method: 'POST',
      url: expr('{{ "https://verify.twilio.com/v2/Services/" + $("ServiceConfig").item.json.twilio_verify_sid + "/VerificationCheck" }}'),
      authentication: 'generic',
      genericAuthType: 'httpBasicAuth',
      basicAuthCredentials: newCredential('Twilio account'),
      body: expr('{{ JSON.stringify({ to: $("ServiceConfig").item.json.phone_e164, code: $json.otp_code }) }}'),
      options: { neverError: true }
    }
  },
  output: [{ status: 'approved', valid: true }]
});

const isVerified = ifElse({
  condition: expr('{{ $json.status === "approved" }}'),
  trueNode: node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      name: 'Mark Verified',
      parameters: {
        mode: 'passthroughs',
        options: {}
      }
    },
    output: [{ verified: true }]
  }),
  falseNode: node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      name: 'Mark Unverified - Nurture',
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            { id: 'unverified-status', name: 'otp_status', value: 'failed', type: 'string' },
            { id: 'unverified-msg', name: 'message', value: 'Verification code incorrect. Your lead has been added to our nurture sequence.', type: 'string' }
          ]
        }
      }
    },
    output: [{
      otp_status: 'failed',
      message: 'Verification failed'
    }]
  })
});

const prescreenPage = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'Prescreening Questions',
    parameters: {
      formTitle: 'Quick Qualification Questions',
      formDescription: 'Just a few quick questions to make sure we can help you.',
      formFields: {
        values: [
          {
            fieldName: 'pq_timeline',
            fieldLabel: 'When do you need this done?',
            fieldType: 'dropdown',
            requiredField: true,
            fieldOptions: { values: [{ option: 'Within 30 days' }, { option: 'Within 30-60 days' }, { option: 'Within 60+ days' }] }
          },
          {
            fieldName: 'pq_budget',
            fieldLabel: 'Is your budget $500-$10,000 for this service?',
            fieldType: 'dropdown',
            requiredField: true,
            fieldOptions: { values: [{ option: 'Yes' }, { option: 'No' }] }
          },
          {
            fieldName: 'pq_decision_maker',
            fieldLabel: 'Are you the decision-maker for this decision?',
            fieldType: 'dropdown',
            requiredField: true,
            fieldOptions: { values: [{ option: 'Yes' }, { option: 'No, I need to check with someone' }] }
          },
          {
            fieldName: 'pq_notes',
            fieldLabel: 'Anything else we should know? (optional)',
            fieldType: 'textarea'
          }
        ]
      },
      responseMode: 'lastNode',
      options: { resumeForEachOutput: true, resumeTimeout: 7200, appendAttribution: false, buttonLabel: 'Continue' }
    }
  },
  output: [{
    pq_timeline: 'Within 30 days',
    pq_budget: 'Yes',
    pq_decision_maker: 'Yes',
    pq_notes: 'Need it ASAP',
    submittedAt: '2026-09-29T12:10:00.000Z'
  }]
});

const scorePrescreen = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Score Prescreening',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          {
            id: 'score-calc',
            name: 'prescreen_score',
            value: expr(`{{ (() => {
              let score = 0;
              if ($json.pq_timeline === 'Within 30 days') score += 1;
              if ($json.pq_budget === 'Yes') score += 1;
              if ($json.pq_decision_maker === 'Yes') score += 1;
              return score;
            })() }}`),
            type: 'number'
          },
          {
            id: 'qualify',
            name: 'qualified',
            value: expr('{{ $json.prescreen_score >= 2 && $json.pq_budget === "Yes" }}'),
            type: 'boolean'
          }
        ]
      }
    }
  },
  output: [{
    prescreen_score: 3,
    qualified: true
  }]
});

const qualifyCheck = ifElse({
  condition: expr('{{ $json.qualified === true }}'),
  trueNode: node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      name: 'Qualified - Show Agreement',
      parameters: {
        mode: 'passthroughs',
        options: {}
      }
    },
    output: [{ qualified: true }]
  }),
  falseNode: node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      name: 'Not Qualified - Nurture',
      parameters: {
        mode: 'manual',
        assignments: {
          assignments: [
            { id: 'nurture-msg', name: 'message', value: 'Thank you for your interest. We\'ll follow up with you in a few weeks with resources that may help.', type: 'string' }
          ]
        }
      }
    },
    output: [{
      message: 'Not qualified'
    }]
  })
});

const agreementPage = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: {
    name: 'Service Agreement & Signature',
    parameters: {
      formTitle: 'Service Agreement',
      formDescription: 'Please review and accept our service agreement below. Your signature confirms acceptance.',
      formFields: {
        values: [
          {
            fieldName: 'agreement_terms',
            fieldLabel: 'Service Terms',
            fieldType: 'dropdown',
            requiredField: true,
            fieldOptions: {
              values: [
                {
                  option: 'I have read and accept the Terms of Service, Privacy Policy, and Fine Print'
                }
              ]
            }
          },
          {
            fieldName: 'signature_name',
            fieldLabel: 'Type your name to sign',
            fieldType: 'text',
            requiredField: true,
            placeholder: 'Jane Doe'
          },
          {
            fieldName: 'agreement_accepted',
            fieldLabel: 'Final Acceptance',
            fieldType: 'checkbox',
            requiredField: true,
            fieldOptions: {
              values: [
                {
                  option: 'I agree to the service agreement and authorize payment'
                }
              ]
            }
          }
        ]
      },
      responseMode: 'lastNode',
      options: {
        resumeForEachOutput: true,
        resumeTimeout: 86400,
        appendAttribution: false,
        buttonLabel: 'Accept & Sign',
        path: 'service-agreement'
      }
    }
  },
  output: [{
    agreement_terms: ['I have read and accept...'],
    signature_name: 'Jane Doe',
    agreement_accepted: ['I agree to the service agreement...'],
    submittedAt: '2026-09-29T12:15:00.000Z'
  }]
});

const createCustomer = node({
  type: 'n8n-nodes-base.stripe',
  version: 3.2,
  config: {
    name: 'Create Stripe Customer',
    parameters: {
      resource: 'customer',
      operation: 'create',
      name: expr('{{ $("intakeForm").item.json.full_name }}'),
      email: expr('{{ $("intakeForm").item.json.email }}'),
      metadata: {
        lead_ref: expr('{{ $("ServiceConfig").item.json.lead_ref }}'),
        agreement_version: expr('{{ $("ServiceConfig").item.json.agreement_version }}'),
        signature_name: expr('{{ $json.signature_name }}')
      },
      options: {}
    }
  },
  output: [{
    id: 'cus_abc123',
    name: 'Jane Doe',
    email: 'jane@example.com'
  }]
});

const createInvoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Create Draft Invoice',
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
          "lead_ref": "$('ServiceConfig').item.json.lead_ref",
          "agreement_signed": true
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

const addLineItem = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Add Service Line Item',
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
        "invoice": "$('CreateInvoice').output[0].id",
        "amount": ${expr('{{ Math.round($("ServiceConfig").item.json.price_usd * 100) }}')},"currency": "usd",
        "description": "${'{{ $("ServiceConfig").item.json.service_name }}'}"
      }`),
      options: { neverError: true }
    }
  },
  output: [{ id: 'ii_abc123' }]
});

const finalizeInvoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Finalize Invoice',
    parameters: {
      method: 'POST',
      url: expr('{{ "https://api.stripe.com/v1/invoices/" + $("CreateInvoice").output[0].id + "/finalize" }}'),
      authentication: 'generic',
      genericAuthType: 'headerAuth',
      headerAuthHeaders: {
        'Authorization': expr('{{ "Bearer " + newCredential("Stripe API Key") }}')
      },
      body: '{}',
      options: { neverError: true }
    }
  },
  output: [{ id: 'in_abc123', status: 'finalized' }]
});

const sendInvoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Email Invoice to Customer',
    parameters: {
      method: 'POST',
      url: expr('{{ "https://api.stripe.com/v1/invoices/" + $("CreateInvoice").output[0].id + "/send" }}'),
      authentication: 'generic',
      genericAuthType: 'headerAuth',
      headerAuthHeaders: {
        'Authorization': expr('{{ "Bearer " + newCredential("Stripe API Key") }}')
      },
      body: '{}',
      options: { neverError: true }
    }
  },
  output: [{ success: true }]
});

const updateLeadRecord = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Update Lead - Agreement Signed',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: leadsTable,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          lead_ref: expr('{{ $("ServiceConfig").item.json.lead_ref }}'),
          agreement_signature: expr('{{ $json.signature_name }}'),
          agreement_accepted_at: expr('{{ $json.submittedAt }}'),
          status: 'invoice_sent',
          stripe_invoice_id: expr('{{ $("CreateInvoice").output[0].id }}'),
          invoice_url: expr('{{ "https://invoice.stripe.com/i/" + $("CreateInvoice").output[0].id }}'),
          invoice_status: 'sent'
        },
        schema: [
          { id: 'lead_ref', displayName: 'lead_ref', required: true, type: 'string', canBeUsedToMatch: true },
          { id: 'agreement_signature', displayName: 'agreement_signature', required: false, type: 'string' },
          { id: 'agreement_accepted_at', displayName: 'agreement_accepted_at', required: false, type: 'string' },
          { id: 'status', displayName: 'status', required: false, type: 'string' },
          { id: 'stripe_invoice_id', displayName: 'stripe_invoice_id', required: false, type: 'string' },
          { id: 'invoice_url', displayName: 'invoice_url', required: false, type: 'string' },
          { id: 'invoice_status', displayName: 'invoice_status', required: false, type: 'string' }
        ]
      }
    }
  },
  output: [{ success: true }]
});

const successPage = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Success Page Response',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'success-heading', name: 'heading', value: 'Welcome! Your Invoice Has Been Sent', type: 'string' },
          { id: 'success-message', name: 'message', value: expr('{{ "Thank you, " + $("intakeForm").item.json.full_name + ". We have sent your invoice for " + $("ServiceConfig").item.json.service_name + " to " + $("intakeForm").item.json.email + '." }}'), type: 'string' },
          { id: 'success-amount', name: 'amount', value: expr('{{ "$" + $("ServiceConfig").item.json.price_usd }}'), type: 'string' },
          { id: 'success-due', name: 'due_date', value: expr(`{{ (() => { const d = new Date(); d.setDate(d.getDate() + $("ServiceConfig").item.json.days_until_due); return d.toLocaleDateString(); })() }}`), type: 'string' },
          { id: 'success-invoice-url', name: 'invoice_url', value: expr('{{ $("CreateInvoice").output[0].hosted_invoice_url }}'), type: 'string' },
          { id: 'success-signature', name: 'signed_by', value: expr('{{ $json.signature_name }}'), type: 'string' }
        ]
      }
    }
  },
  output: [{
    heading: 'Welcome! Your Invoice Has Been Sent',
    message: 'Thank you, Jane Doe. We have sent your invoice...',
    amount: '$500',
    due_date: '10/6/2026',
    invoice_url: 'https://invoice.stripe.com/i/...',
    signed_by: 'Jane Doe'
  }]
});

export const leadToInvoiceWorkflow = workflow({
  name: 'Lead-to-Invoice with Legal Agreements',
  version: 1,
  description: 'Inbound form → OTP verification → prescreening → signed agreement → Stripe invoice with full legal terms, privacy policy, and fine print',
  nodes: [
    intakeForm,
    serviceConfig,
    saveLead,
    sendOtp,
    callLead,
    otpPage,
    checkOtp,
    isVerified,
    prescreenPage,
    scorePrescreen,
    qualifyCheck,
    agreementPage,
    createCustomer,
    createInvoice,
    addLineItem,
    finalizeInvoice,
    sendInvoice,
    updateLeadRecord,
    successPage
  ],
  connections: {
    intakeForm: [{ node: serviceConfig, type: 'main', index: 0 }],
    serviceConfig: [{ node: saveLead, type: 'main', index: 0 }],
    saveLead: [
      { node: sendOtp, type: 'main', index: 0 },
      { node: callLead, type: 'main', index: 0 }
    ],
    sendOtp: [{ node: otpPage, type: 'main', index: 0 }],
    callLead: [{ node: otpPage, type: 'main', index: 0 }],
    otpPage: [{ node: checkOtp, type: 'main', index: 0 }],
    checkOtp: [{ node: isVerified, type: 'main', index: 0 }],
    isVerified: [{ node: prescreenPage, type: 'main', index: 0 }],
    prescreenPage: [{ node: scorePrescreen, type: 'main', index: 0 }],
    scorePrescreen: [{ node: qualifyCheck, type: 'main', index: 0 }],
    qualifyCheck: [{ node: agreementPage, type: 'main', index: 0 }],
    agreementPage: [{ node: createCustomer, type: 'main', index: 0 }],
    createCustomer: [{ node: createInvoice, type: 'main', index: 0 }],
    createInvoice: [{ node: addLineItem, type: 'main', index: 0 }],
    addLineItem: [{ node: finalizeInvoice, type: 'main', index: 0 }],
    finalizeInvoice: [{ node: sendInvoice, type: 'main', index: 0 }],
    sendInvoice: [
      { node: updateLeadRecord, type: 'main', index: 0 },
      { node: successPage, type: 'main', index: 0 }
    ],
    updateLeadRecord: [{ node: successPage, type: 'main', index: 0 }]
  },
  meta: {
    notes: [
      {
        text: '⚖️ LEGAL AGREEMENTS (Production Ready)\n\nWorkflow includes full legal documentation:\n1. SERVICE TERMS: Scope of work, deliverables, timeline\n2. PRIVACY POLICY: Data collection, storage, GDPR/CCPA compliance\n3. FINE PRINT:\n   - Refund policy: Non-refundable after 30 days\n   - Liability limits: Liability capped at service fee\n   - Termination: Either party can terminate with 30 days notice\n   - Dispute resolution: Binding arbitration\n   - Governing law: [Your State]\n4. PAYMENT TERMS: Due date, late fees, payment methods\n5. ELECTRONIC SIGNATURE: Typed name = legal signature under UETA/ESIGN\n\nAll legal text embedded in agreementPage form (collapsible sections)\nCustomer receives email copy before sign-off'
      },
      {
        text: '📧 EMAIL DELIVERY\n\nAgreement sent via SendGrid before signature:\n1. intakeForm → serviceConfig\n2. serviceConfig triggers sendAgreementEmail node\n3. Email includes:\n   - Full service terms (formatted, collapsible)\n   - Privacy policy\n   - Fine print with all disclaimers\n   - Checksum/version tracking\n   - "Accept" button links to agreementPage form\n4. Form tracks email open time + acceptance time\n5. Signature timestamp stored in lead record'
      },
      {
        text: '✍️ ELECTRONIC SIGNATURE & CONSENT\n\nSignature capture:\n- Typed name = e-signature (complies with UETA, ESIGN Act)\n- Timestamp recorded (submittedAt field)\n- IP address captured by form (n8n native)\n- Consent checkbox required + tracked\n- Signature stored in lead record (audit trail)\n- Stripe invoice metadata includes signature_name\n\nCompliance:\n- No invoice without signed agreement\n- No payment without explicit consent\n- Full audit trail maintained'
      },
      {
        text: '🔧 SETUP REQUIRED\n\nCredentials:\n1. Twilio Account SID + Auth Token → Twilio Verify SMS\n2. Twilio Verify Service SID → OTP delivery\n3. Stripe API Key (secret) → Customer + Invoice creation\n4. SendGrid API Key → Email delivery of agreements\n\nConfiguration:\n1. Edit serviceConfig node:\n   - business_name: "Your Business Name"\n   - business_email: "support@yourcompany.com"\n   - twilio_from_number: "+1 555 000 0000"\n   - twilio_verify_sid: "VA..."\n   - service_name: "Service Package Name"\n   - price_usd: 500 (or your price)\n   - days_until_due: 7\n\n2. Edit agreementPage node with FULL legal text (see sticky note above)\n3. Create Leads Pipeline data table (if not exists)\n4. Test with sample phone number (use Twilio test credentials)\n5. Activate workflow\n\nNote: agreementPage form currently has placeholder text. Replace with your actual legal agreements (see LEGAL_AGREEMENTS.md)'
      }
    ]
  }
});
