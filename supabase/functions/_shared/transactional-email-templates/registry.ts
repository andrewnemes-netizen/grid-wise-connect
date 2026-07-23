import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcomeClient } from './welcome-client.tsx'
import { template as quotation } from './quotation.tsx'
import { template as siteSurveyInvite } from './site-survey-invite.tsx'
import { template as siteSurveySubmitted } from './site-survey-submitted.tsx'
import { template as invoice } from './invoice.tsx'
import { template as purchaseOrder } from './purchase-order.tsx'
import { template as pocAssignment } from './poc-assignment.tsx'
import { template as pocPoCancellation } from './poc-po-cancellation.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome-client': welcomeClient,
  quotation: quotation,
  'site-survey-invite': siteSurveyInvite,
  'site-survey-submitted': siteSurveySubmitted,
  invoice: invoice,
  'purchase-order': purchaseOrder,
  'poc-assignment': pocAssignment,
  'poc-po-cancellation': pocPoCancellation,
}
