/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  recipientName?: string
  senderName?: string
  companyName?: string
  docLabel?: string // "Invoice" | "Payment application"
  invoiceNumber?: string
  projectName?: string
  grandTotal?: string
  dueDate?: string
  message?: string
}

const Email = ({
  recipientName,
  senderName,
  companyName,
  docLabel,
  invoiceNumber,
  projectName,
  grandTotal,
  dueDate,
  message,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {`${docLabel ?? 'Invoice'} ${invoiceNumber ?? ''} from ${companyName ?? 'EcoPower UK'}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{docLabel ?? 'Invoice'} {invoiceNumber ?? ''}</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hello,'}
        </Text>
        <Text style={text}>
          Please find attached {(docLabel ?? 'invoice').toLowerCase()} {invoiceNumber ?? ''}
          {projectName ? ` for ${projectName}` : ''}. A summary is below and
          the full PDF is attached to this email.
        </Text>

        <Section style={card}>
          {invoiceNumber && (
            <Text style={cardRow}>
              <span style={label}>Reference</span>
              <span style={value}>{invoiceNumber}</span>
            </Text>
          )}
          {projectName && (
            <Text style={cardRow}>
              <span style={label}>Project</span>
              <span style={value}>{projectName}</span>
            </Text>
          )}
          {dueDate && (
            <Text style={cardRow}>
              <span style={label}>Due</span>
              <span style={value}>{dueDate}</span>
            </Text>
          )}
          {grandTotal && (
            <Text style={cardRow}>
              <span style={label}>Total due</span>
              <span style={valueBig}>{grandTotal}</span>
            </Text>
          )}
        </Section>

        {message && <Text style={text}>{message}</Text>}

        <Hr style={hr} />
        <Text style={footer}>
          Sent by {senderName ?? 'the team'}
          {companyName ? ` at ${companyName}` : ''}. If you have any questions
          about this {(docLabel ?? 'invoice').toLowerCase()}, just reply to this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `${data.docLabel ?? 'Invoice'} ${data.invoiceNumber ?? ''} — ${data.companyName ?? 'EcoPower UK'}`.trim(),
  displayName: 'Client Invoice',
  previewData: {
    recipientName: 'Jane Smith',
    senderName: 'Alex Roberts',
    companyName: 'EcoPower UK',
    docLabel: 'Invoice',
    invoiceNumber: 'INV-2026-014',
    projectName: 'GCC WP3 — Parkside Road',
    grandTotal: '£12,480.00',
    dueDate: '30 Aug 2026',
    message: 'Payment terms: 30 days from invoice date. Bank details are on the attached PDF.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { color: '#0d7a5f', fontSize: '24px', fontWeight: 700, margin: '0 0 16px' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' }
const card = {
  backgroundColor: '#f5f2ea',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const cardRow = { color: '#333333', fontSize: '14px', margin: '4px 0', display: 'flex', justifyContent: 'space-between' as const }
const label = { color: '#666666', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const value = { color: '#111111', fontSize: '14px', fontWeight: 600 }
const valueBig = { color: '#0d7a5f', fontSize: '18px', fontWeight: 700 }
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const footer = { color: '#888888', fontSize: '12px', lineHeight: '18px' }