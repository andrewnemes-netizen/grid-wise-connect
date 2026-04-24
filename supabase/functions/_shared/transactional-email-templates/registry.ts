import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcomeClient } from './welcome-client.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome-client': welcomeClient,
}
