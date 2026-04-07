/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "GridWise Connect"

interface WelcomeClientProps {
  name?: string
  email?: string
  password?: string
  company?: string
  orgName?: string
  loginUrl?: string
}

const WelcomeClientEmail = ({ name, email, password, company, orgName, loginUrl }: WelcomeClientProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} account is ready — log in to get started</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Heading style={h1}>Welcome to {SITE_NAME}</Heading>
        </Section>

        <Text style={text}>
          {name ? `Hi ${name},` : 'Hello,'}
        </Text>

        <Text style={text}>
          Your account has been created{orgName ? ` for ${orgName}` : ''}. You can now log in to access
          your portfolio, site assessments, and grid connection studies.
        </Text>

        <Section style={credentialsBox}>
          <Text style={credLabel}>Email</Text>
          <Text style={credValue}>{email || '(your email address)'}</Text>
          <Text style={credLabel}>Temporary Password</Text>
          <Text style={credValue}>{password || '(provided by your administrator)'}</Text>
        </Section>

        <Text style={textSmall}>
          Please change your password after your first login for security.
        </Text>

        <Section style={buttonSection}>
          <Button style={button} href={loginUrl || 'https://grid-wise-connect.lovable.app/auth'}>
            Log In Now
          </Button>
        </Section>

        <Hr style={hr} />

        <Text style={footer}>
          If you didn't expect this email, please contact your administrator.
        </Text>
        <Text style={footer}>
          © {SITE_NAME} — Powered by Ecopower UK
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeClientEmail,
  subject: (data: Record<string, any>) =>
    `Welcome to ${SITE_NAME}${data.orgName ? ` — ${data.orgName}` : ''}`,
  displayName: 'Welcome new client',
  previewData: {
    name: 'Jane Smith',
    email: 'jane@acme-energy.com',
    password: 'TempPass123!',
    company: 'Acme Energy Ltd',
    orgName: 'Acme Energy Ltd',
    loginUrl: 'https://grid-wise-connect.lovable.app/auth',
  },
} satisfies TemplateEntry

// Styles — green brand: hsl(100, 38%, 30%) ≈ #3d6b2e
const main = { backgroundColor: '#ffffff', fontFamily: "'Arial', 'Helvetica', sans-serif" }
const container = { padding: '32px 24px', maxWidth: '520px', margin: '0 auto' }
const headerSection = { marginBottom: '24px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#3d6b2e', margin: '0 0 8px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const textSmall = { fontSize: '13px', color: '#666666', lineHeight: '1.5', margin: '0 0 24px' }
const credentialsBox = {
  backgroundColor: '#f5f7f3',
  border: '1px solid #d9e2d4',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '0 0 16px',
}
const credLabel = { fontSize: '12px', color: '#666666', margin: '0 0 2px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const credValue = { fontSize: '15px', color: '#1a1a1a', fontWeight: 'bold' as const, margin: '0 0 12px' }
const buttonSection = { textAlign: 'center' as const, margin: '0 0 32px' }
const button = {
  backgroundColor: '#3d6b2e',
  color: '#ffffff',
  padding: '12px 32px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e5e5e5', margin: '0 0 16px' }
const footer = { fontSize: '12px', color: '#999999', margin: '0 0 4px', textAlign: 'center' as const }
