/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You've been invited</Heading>
        <Text style={text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={link}><strong>{siteName}</strong></Link>.
          Click the button below to accept the invitation and create your account.
        </Text>
        <Button style={button} href={confirmationUrl}>Accept Invitation</Button>
        <Text style={footer}>If you weren't expecting this invitation, you can safely ignore this email.</Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Arial', 'Helvetica', sans-serif" }
const container = { padding: '32px 24px', maxWidth: '520px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#3d6b2e', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#141f1a', lineHeight: '1.6', margin: '0 0 20px' }
const link = { color: '#3d6b2e', textDecoration: 'underline' }
const button = { backgroundColor: '#3d6b2e', color: '#ffffff', fontSize: '15px', fontWeight: 'bold' as const, borderRadius: '8px', padding: '12px 32px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: '#6a7a72', margin: '30px 0 0' }
