/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  recipientName?: string
  senderName?: string
  companyName?: string
  siteName?: string
  postcode?: string
  message?: string
  surveyUrl?: string
  expiresAt?: string
}

const Email = ({
  recipientName, senderName, companyName, siteName, postcode, message, surveyUrl, expiresAt,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Site survey requested${siteName ? ` for ${siteName}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Site Survey Requested</Heading>
        <Text style={text}>{recipientName ? `Hi ${recipientName},` : 'Hi there,'}</Text>
        <Text style={text}>
          {senderName ?? 'The team'}{companyName ? ` at ${companyName}` : ''} has asked you to complete an On-Street / Public Car Park site survey.
        </Text>

        <Section style={card}>
          {siteName && (
            <Text style={cardRow}><span style={label}>Site</span><span style={value}>{siteName}</span></Text>
          )}
          {postcode && (
            <Text style={cardRow}><span style={label}>Postcode</span><span style={value}>{postcode}</span></Text>
          )}
          {expiresAt && (
            <Text style={cardRow}><span style={label}>Link expires</span><span style={value}>{expiresAt}</span></Text>
          )}
        </Section>

        {message && <Text style={text}>{message}</Text>}

        {surveyUrl && (
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button href={surveyUrl} style={button}>Open Survey Form</Button>
          </Section>
        )}

        <Text style={smallText}>
          The form takes about 10 minutes. You can complete it on a phone, tablet or laptop.
          Photos and a signature can be captured directly from your device.
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          If you weren't expecting this email, you can safely ignore it — the link is unique to you and expires automatically.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Site survey requested${data.siteName ? ` — ${data.siteName}` : ''}`,
  displayName: 'Site Survey Invitation',
  previewData: {
    recipientName: 'Alex Field',
    senderName: 'Jane Roberts',
    companyName: 'EcoPower UK',
    siteName: 'High Street Car Park',
    postcode: 'SW1A 1AA',
    message: 'Please complete this survey by Friday so we can move to design.',
    surveyUrl: 'https://example.com/survey/abc123',
    expiresAt: '14 Aug 2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { color: '#0d7a5f', fontSize: '24px', fontWeight: 700, margin: '0 0 16px' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' }
const smallText = { color: '#666666', fontSize: '13px', lineHeight: '20px', margin: '16px 0 0' }
const card = { backgroundColor: '#f5f2ea', borderRadius: '8px', padding: '16px 20px', margin: '20px 0' }
const cardRow = { color: '#333333', fontSize: '14px', margin: '4px 0', display: 'flex', justifyContent: 'space-between' as const }
const label = { color: '#666666', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const value = { color: '#111111', fontSize: '14px', fontWeight: 600 }
const button = {
  backgroundColor: '#0d7a5f', color: '#ffffff', padding: '12px 24px', borderRadius: '8px',
  textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block',
}
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const footer = { color: '#888888', fontSize: '12px', lineHeight: '18px' }