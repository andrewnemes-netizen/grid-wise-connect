/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
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
  estimateName?: string
  estimateRef?: string
  grandTotal?: string
  message?: string
  pdfUrl?: string
  siteName?: string
}

const Email = ({
  recipientName,
  senderName,
  companyName,
  estimateName,
  estimateRef,
  grandTotal,
  message,
  pdfUrl,
  siteName,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {`Your quotation ${estimateRef ?? estimateName ?? ''} from ${companyName ?? 'us'}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your quotation is ready</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hi there,'}
        </Text>
        <Text style={text}>
          Please find attached the quotation
          {estimateName ? ` for ${estimateName}` : ''}
          {siteName ? ` (${siteName})` : ''}. A summary is below and the full
          PDF is available at the link.
        </Text>

        <Section style={card}>
          {estimateRef && (
            <Text style={cardRow}>
              <span style={label}>Reference</span>
              <span style={value}>{estimateRef}</span>
            </Text>
          )}
          {estimateName && (
            <Text style={cardRow}>
              <span style={label}>Estimate</span>
              <span style={value}>{estimateName}</span>
            </Text>
          )}
          {grandTotal && (
            <Text style={cardRow}>
              <span style={label}>Grand Total</span>
              <span style={valueBig}>{grandTotal}</span>
            </Text>
          )}
        </Section>

        {message && (
          <>
            <Text style={text}>{message}</Text>
          </>
        )}

        {pdfUrl && (
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button href={pdfUrl} style={button}>
              Download Quotation PDF
            </Button>
          </Section>
        )}

        <Hr style={hr} />
        <Text style={footer}>
          Sent by {senderName ?? 'the team'}
          {companyName ? ` at ${companyName}` : ''}. If you have any questions,
          just reply to this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Quotation ${data.estimateRef ?? data.estimateName ?? ''} — ${data.companyName ?? ''}`.trim(),
  displayName: 'Client Quotation',
  previewData: {
    recipientName: 'Jane Smith',
    senderName: 'Alex Roberts',
    companyName: 'EcoPower UK',
    estimateName: 'Estimate 05',
    estimateRef: 'GCC-WP3-05',
    grandTotal: '£5,051.00',
    message:
      'This quotation covers the connection works for the site as discussed. Prices are valid for 30 days.',
    pdfUrl: 'https://example.com/quotation.pdf',
    siteName: 'GCC WP3',
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
const button = {
  backgroundColor: '#0d7a5f',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '15px',
  display: 'inline-block',
}
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const footer = { color: '#888888', fontSize: '12px', lineHeight: '18px' }