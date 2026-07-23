/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  recipientName?: string
  senderName?: string
  companyName?: string
  programmeName?: string
  workPackageName?: string
  poNumber?: string
  reason?: string
}

const Email = ({ recipientName, senderName, companyName, programmeName, workPackageName, poNumber, reason }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`POC assignment cancelled${poNumber ? ` — ${poNumber}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>POC Assignment Cancelled</Heading>
        <Text style={text}>{recipientName ? `Hi ${recipientName},` : 'Hi there,'}</Text>
        <Text style={text}>
          {senderName ?? 'The team'}{companyName ? ` at ${companyName}` : ''} has cancelled the POC application
          {workPackageName ? ` for ${workPackageName}` : ''}. Please stop any work in progress against this
          assignment{poNumber ? ` and disregard purchase order ${poNumber}` : ''}.
        </Text>
        <Section style={card}>
          {companyName && (<Text style={cardRow}><span style={label}>Organisation</span><span style={value}>{companyName}</span></Text>)}
          {programmeName && (<Text style={cardRow}><span style={label}>Programme</span><span style={value}>{programmeName}</span></Text>)}
          {workPackageName && (<Text style={cardRow}><span style={label}>Work Package</span><span style={value}>{workPackageName}</span></Text>)}
          {poNumber && (<Text style={cardRow}><span style={label}>Purchase Order</span><span style={value}>{poNumber} — CANCELLED</span></Text>)}
        </Section>
        {reason && (
          <>
            <Text style={{ ...label, marginBottom: 4 }}>Reason</Text>
            <Text style={text}>{reason}</Text>
          </>
        )}
        <Text style={text}>
          If any costs have been incurred prior to this notice, please reply to this email so we can settle them
          separately. Apologies for the change of plan.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>Sent from Gridwise Connect.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `POC assignment cancelled${data.poNumber ? ` — ${data.poNumber}` : ''}`,
  displayName: 'POC PO Cancellation',
  previewData: {
    recipientName: 'Alex Designer',
    senderName: 'Liam French',
    companyName: 'EcoPower UK',
    workPackageName: 'WP-2026-014',
    poNumber: 'POC-2026-0007',
    reason: 'Client withdrew the site from scope.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { color: '#c1121f', fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' }
const card = { backgroundColor: '#f5f2ea', borderRadius: '8px', padding: '16px 20px', margin: '20px 0' }
const cardRow = { color: '#333333', fontSize: '14px', margin: '4px 0', display: 'flex', justifyContent: 'space-between' as const }
const label = { color: '#666666', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const value = { color: '#111111', fontSize: '14px', fontWeight: 600 }
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const footer = { color: '#888888', fontSize: '12px', lineHeight: '18px' }