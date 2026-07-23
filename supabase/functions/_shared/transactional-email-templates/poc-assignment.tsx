/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface SiteLine {
  address?: string | null
  siteId?: string | null
  postcode?: string | null
  lat?: number | null
  lng?: number | null
  sockets?: number | null
  kwPerSocket?: number | null
  breakdown?: string | null
  totalConnectedKw?: number | null
  phaseTotals?: { L1: number; L2: number; L3: number } | null
  phaseAssignments?: { L1: string[]; L2: string[]; L3: string[] } | null
  socketGroups?: Array<{ quantity: number; power_rating_kw: number; phases: number }> | null
}

interface Props {
  recipientName?: string
  senderName?: string
  companyName?: string
  programmeName?: string
  workPackageName?: string
  message?: string
  dueDate?: string
  sites?: SiteLine[]
  actionUrl?: string
}

const Email = ({
  recipientName, senderName, companyName, programmeName, workPackageName, message, dueDate, sites = [], actionUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`POC application requested${workPackageName ? ` — ${workPackageName}` : ''}${companyName ? ` · ${companyName}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>POC Application Requested</Heading>
        <Text style={text}>{recipientName ? `Hi ${recipientName},` : 'Hi there,'}</Text>
        <Text style={text}>
          {senderName ?? 'The team'}{companyName ? ` at ${companyName}` : ''} has asked you to prepare and submit a Point of Connection (POC) application{workPackageName ? ` for work package ${workPackageName}` : ''}.
        </Text>

        {(companyName || programmeName || workPackageName) && (
          <Section style={card}>
            {companyName && (
              <Text style={cardRow}><span style={label}>Organisation</span><span style={value}>{companyName}</span></Text>
            )}
            {programmeName && (
              <Text style={cardRow}><span style={label}>Programme</span><span style={value}>{programmeName}</span></Text>
            )}
            {workPackageName && (
              <Text style={cardRow}><span style={label}>Work Package</span><span style={value}>{workPackageName}</span></Text>
            )}
          </Section>
        )}

        {sites.length > 0 && (
          <>
            <Text style={{ ...label, marginBottom: 4 }}>Sites ({sites.length})</Text>
            {sites.map((s, i) => (
              <Section key={i} style={card}>
                <Text style={siteHeading}>{s.address ?? 'Site'}</Text>
                <Text style={cardRow}><span style={label}>Site ID</span><span style={value}>{s.siteId ?? 'Not assigned'}</span></Text>
                <Text style={cardRow}><span style={label}>Postcode</span><span style={value}>{s.postcode ?? '—'}</span></Text>
                <Text style={cardRow}><span style={label}>Feeder Pillar Latitude</span><span style={value}>{s.lat ?? '—'}</span></Text>
                <Text style={cardRow}><span style={label}>Feeder Pillar Longitude</span><span style={value}>{s.lng ?? '—'}</span></Text>
                <Text style={cardRow}><span style={label}>Total Sockets</span><span style={value}>{s.sockets ?? '—'}</span></Text>
                <Text style={cardRow}><span style={label}>Socket Groups</span><span style={value}>{s.breakdown ?? (s.kwPerSocket != null ? `${s.sockets ?? 0}× ${s.kwPerSocket}kW` : '—')}</span></Text>
                <Text style={cardRow}><span style={label}>Total Connected Load</span><span style={value}>{s.totalConnectedKw != null ? `${Math.round(s.totalConnectedKw * 100) / 100} kW` : (s.kwPerSocket != null && s.sockets != null ? `${Math.round(s.kwPerSocket * s.sockets * 100) / 100} kW` : '—')}</span></Text>
                {s.phaseTotals && (
                  <>
                    <Text style={{ ...label, marginTop: 10, marginBottom: 4 }}>Phase Load Balance</Text>
                    <Section style={phaseGrid}>
                      {(['L1','L2','L3'] as const).map((p) => (
                        <div key={p} style={phaseCell}>
                          <Text style={phaseLabel}>{p}</Text>
                          <Text style={phaseValue}>{Math.round((s.phaseTotals?.[p] ?? 0) * 100) / 100} kW</Text>
                          <Text style={phaseSockets}>
                            {s.phaseAssignments && s.phaseAssignments[p].length > 0
                              ? s.phaseAssignments[p].join(', ')
                              : '—'}
                          </Text>
                        </div>
                      ))}
                    </Section>
                    <Text style={{ color: '#888', fontSize: '11px', margin: '4px 0 0' }}>
                      * indicates a 3-phase socket split evenly across L1/L2/L3.
                    </Text>
                  </>
                )}
              </Section>
            ))}
            {dueDate && (
              <Section style={card}>
                <Text style={cardRow}>
                  <span style={label}>Target return</span><span style={value}>{dueDate}</span>
                </Text>
              </Section>
            )}
          </>
        )}

        {message && <Text style={text}>{message}</Text>}

        {actionUrl && (
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button href={actionUrl} style={button}>Open Work Package</Button>
          </Section>
        )}

        <Hr style={hr} />
        <Text style={footer}>
          Sent from Gridwise Connect. Please acknowledge receipt and confirm the target return date.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const n = Array.isArray(data.sites) ? data.sites.length : 0
    const wp = data.workPackageName ? ` — ${data.workPackageName}` : ''
    return `POC application requested${wp}${n ? ` (${n} site${n === 1 ? '' : 's'})` : ''}`
  },
  displayName: 'POC Application Assignment',
  previewData: {
    recipientName: 'Alex Designer',
    senderName: 'Liam French',
    companyName: 'EcoPower UK',
    workPackageName: 'WP-2026-014',
    message: 'Please submit within 5 working days and copy me on the acknowledgement.',
    dueDate: '02 Sep 2026',
    sites: [
      {
        address: 'High Street Car Park, Westminster', siteId: 'EP-001', postcode: 'SW1A 1AA',
        lat: 51.5014, lng: -0.1419, sockets: 4, kwPerSocket: 10.75,
        breakdown: '3× 7kW (1φ), 1× 22kW (3φ)', totalConnectedKw: 43,
        phaseTotals: { L1: 14.33, L2: 14.33, L3: 14.33 },
        phaseAssignments: {
          L1: ['7.33kW*', '7kW'],
          L2: ['7.33kW*', '7kW'],
          L3: ['7.33kW*', '7kW'],
        },
      },
    ],
    actionUrl: 'https://example.com/wp/abc/sites/register',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { color: '#0d7a5f', fontSize: '24px', fontWeight: 700, margin: '0 0 16px' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' }
const card = { backgroundColor: '#f5f2ea', borderRadius: '8px', padding: '16px 20px', margin: '20px 0' }
const siteHeading = { color: '#0d7a5f', fontSize: '15px', fontWeight: 700, margin: '0 0 8px' }
const cardRow = { color: '#333333', fontSize: '14px', margin: '4px 0', display: 'flex', justifyContent: 'space-between' as const }
const label = { color: '#666666', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const value = { color: '#111111', fontSize: '14px', fontWeight: 600 }
const button = {
  backgroundColor: '#0d7a5f', color: '#ffffff', padding: '12px 24px', borderRadius: '8px',
  textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block',
}
const hr = { borderColor: '#e5e5e5', margin: '24px 0' }
const footer = { color: '#888888', fontSize: '12px', lineHeight: '18px' }
const phaseGrid = { display: 'flex', gap: '8px', marginTop: '4px' }
const phaseCell = { flex: '1 1 0', backgroundColor: '#ffffff', borderRadius: '6px', padding: '8px', textAlign: 'center' as const, border: '1px solid #e5e0d3' }
const phaseLabel = { color: '#888', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: 0 }
const phaseValue = { color: '#0d7a5f', fontSize: '14px', fontWeight: 700, margin: '2px 0' }
const phaseSockets = { color: '#555', fontSize: '11px', margin: 0 }