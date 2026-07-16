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
  recipientCompany?: string
  senderName?: string
  companyName?: string
  poNumber?: string
  workPackageName?: string
  orderTotal?: string
  issuedDate?: string
  message?: string
}

const Email = ({
  recipientName,
  recipientCompany,
  senderName,
  companyName,
  poNumber,
  workPackageName,
  orderTotal,
  issuedDate,
  message,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {`Purchase order ${poNumber ?? ''} from ${companyName ?? 'EcoPower UK'}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>Purchase Order {poNumber ?? ''}</Heading>
        </Section>
        <Section style={inner}>
          <Text style={text}>
            {recipientName ? `Hi ${recipientName},` : 'Hello,'}
          </Text>
          <Text style={text}>
            Please find attached purchase order {poNumber ?? ''}
            {recipientCompany ? ` issued to ${recipientCompany}` : ''}. A summary is
            below and the full PDF is attached to this email.
          </Text>

          <Section style={card}>
            {poNumber && (
              <Text style={cardRow}>
                <span style={label}>PO Number</span>
                <span style={value}>{poNumber}</span>
              </Text>
            )}
            {workPackageName && (
              <Text style={cardRow}>
                <span style={label}>Work package</span>
                <span style={value}>{workPackageName}</span>
              </Text>
            )}
            {issuedDate && (
              <Text style={cardRow}>
                <span style={label}>Issued</span>
                <span style={value}>{issuedDate}</span>
              </Text>
            )}
            {orderTotal && (
              <Text style={cardRow}>
                <span style={label}>Order total</span>
                <span style={valueBig}>{orderTotal}</span>
              </Text>
            )}
          </Section>

          {message && <Text style={text}>{message}</Text>}

          <Text style={text}>
            Please acknowledge receipt in writing and quote the PO number on all
            delivery notes and invoices.
          </Text>

          <Hr style={hr} />
          <Text style={footer}>
            Sent by {senderName ?? 'the team'}
            {companyName ? ` at ${companyName}` : ''}. If you have any questions
            about this purchase order, just reply to this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Purchase order ${data.poNumber ?? ''} — ${data.companyName ?? 'EcoPower UK'}`.trim(),
  displayName: 'Purchase Order',
  previewData: {
    recipientName: 'Alex',
    recipientCompany: 'Acme Civils Ltd',
    senderName: 'Andrew',
    companyName: 'EcoPower UK',
    poNumber: 'PO-2026-001',
    workPackageName: 'GCC WP3',
    orderTotal: '£24,500.00',
    issuedDate: '16 Jul 2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { margin: '0 auto', padding: '0', maxWidth: '600px' }
const header = { backgroundColor: '#0d7a5f', padding: '24px 28px', borderRadius: '6px 6px 0 0' }
const h1 = { color: '#ffffff', fontSize: '22px', margin: '0', fontWeight: 700 as const }
const inner = { padding: '20px 28px 28px', border: '1px solid #e6e6e6', borderTop: 'none', borderRadius: '0 0 6px 6px' }
const text = { color: '#1f2937', fontSize: '14px', lineHeight: '22px', margin: '10px 0' }
const card = { backgroundColor: '#f5faf7', border: '1px solid #d6ebe1', borderRadius: '6px', padding: '14px 16px', margin: '14px 0' }
const cardRow = { margin: '4px 0', display: 'block', fontSize: '14px', color: '#1f2937' }
const label = { display: 'inline-block', width: '130px', color: '#5b6b6a', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.03em' }
const value = { color: '#0f172a', fontWeight: 600 as const }
const valueBig = { color: '#0d7a5f', fontWeight: 700 as const, fontSize: '16px' }
const hr = { borderColor: '#e6e6e6', margin: '20px 0' }
const footer = { color: '#6b7280', fontSize: '12px', lineHeight: '18px' }