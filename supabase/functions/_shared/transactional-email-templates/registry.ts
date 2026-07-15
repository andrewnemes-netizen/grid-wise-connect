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

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome-client': welcomeClient,
  quotation: quotation,
  'site-survey-invite': siteSurveyInvite,
  'site-survey-submitted': siteSurveySubmitted,
}
