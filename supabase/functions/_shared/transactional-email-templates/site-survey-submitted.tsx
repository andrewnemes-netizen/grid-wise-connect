/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  recipientName?: string
  siteName?: string
  postcode?: string
  submitterName?: string
  submitterEmail?: string
  overallStatus?: string
  submittedAt?: string
  pdfUrl?: string
  siteUrl?: string
}

const Email = ({
  recipientName, siteName, postcode, submitterName, submitterEmail, overallStatus, submittedAt, pdfUrl, siteUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Survey submitted${siteName ? ` for ${siteName}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Survey Submitted</Heading>
        <Text style={text}>{recipientName ? `Hi ${recipientName},` : 'Hi there,'}</Text>
        <Text style={text}>
          A completed on-street / car park site survey has just been received.
        </Text>

        <Section style={card}>
          {siteName && (<Text style={cardRow}><span style={label}>Site</span><span style={value}>{siteName}</span></Text>)}
          {postcode && (<Text style={cardRow}><span style={label}>Postcode</span><span style={value}>{postcode}</span></Text>)}
          {submitterName && (<Text style={cardRow}><span style={label}>Surveyor</span><span style={value}>{submitterName}</span></Text>)}
          {submitterEmail && (<Text style={cardRow}><span style={label}>Email</span><span style={value}>{submitterEmail}</span></Text>)}
          {overallStatus && (<Text style={cardRow}><span style={label}>Overall status</span><span style={value}>{overallStatus}</span></Text>)}
          {submittedAt && (<Text style={cardRow}><span style={label}>Submitted</span><span style={value}>{submittedAt}</span></Text>)}
        </Section>

        {pdfUrl && (
          <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
            <Button href={pdfUrl} style={button}>Download Survey PDF</Button>
          </Section>
        )}
        {siteUrl && (
          <Section style={{ textAlign: 'center', margin: '0 0 24px' }}>
            <Button href={siteUrl} style={outlineButton}>View Site</Button>
          </Section>
        )}

        <Hr style={hr} />
        <Text style={footer}>This is an automated notification from Gridwise Connect.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Survey submitted${data.siteName ? ` — ${data.siteName}` : ''}`,
  displayName: 'Site Survey Submitted',
  previewData: {
    recipientName: 'Jane',
    siteName: 'High Street Car Park',
    postcode: 'SW1A 1AA',
    submitterName: 'Alex Field',
    submitterEmail: 'alex@example.com',
    overallStatus: 'Complete',
    submittedAt: '15 Jul 2026 16:24',
    pdfUrl: 'https://example.com/survey.pdf',
    siteUrl: 'https://example.com/site/123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { color: '#0d7a5f', fontSize: '24px', fontWeight: 700, margin: '0 0 16px' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' }
const card = { backgroundColor: '#f5f2ea', borderRadius: '8px', padding: '16px 20px', margin: '20px 0' }
const cardRow = { color: '#333333', fontSize: '14px', margin: '4px 0', display: 'flex', justifyContent: 'space-between' as const }
const label = { color: '#666666', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const value = { color: '#111111', fontSize: '14px', fontWeight: 600 }
const button = {
  backgroundColor: '#0d7a5f', color: '#ffffff', padding: '12px 24px', borderRadius: '8px',
  textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block',
}
const outlineButton = {
  backgroundColor: '#ffffff', color: '#0d7a5f', padding: '10px 22px', borderRadius: '8px',
  border: '1px solid #0d7a5f', textDecoration: 'none', fontWeight: 600, fontSize: '14px', display: 'inline-block',
}
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const footer = { color: '#888888', fontSize: '12px', lineHeight: '18px' }