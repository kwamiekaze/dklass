/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { template as lessonScheduled } from './lesson-scheduled.tsx'
import { template as lessonCancelled } from './lesson-cancelled.tsx'
import { template as lessonReminder } from './lesson-reminder.tsx'
import { template as reportCardSubmitted } from './report-card-submitted.tsx'
import { template as intakeConverted } from './intake-converted.tsx'
import { template as intakeAccepted } from './intake-accepted.tsx'
import { template as updateAddresses } from './update-addresses.tsx'
import { template as guardianAdded } from './guardian-added.tsx'
import { template as trackingStarted } from './tracking-started.tsx'
import { template as trackingUpdate } from './tracking-update.tsx'
import { template as trackingEnded } from './tracking-ended.tsx'
import { template as roadTestScheduledStudent } from './road-test-scheduled-student.tsx'
import { template as roadTestScheduledInstructor } from './road-test-scheduled-instructor.tsx'
import { template as pendingSlotNotice } from './pending-slot-notice.tsx'
import { template as adminNewContactSubmission } from './admin-new-contact-submission.tsx'
import { template as adminNewIntakeSubmission } from './admin-new-intake-submission.tsx'
import { template as scheduleProposal } from './schedule-proposal.tsx'
import { template as lessonPartiallyCompleted } from './lesson-partially-completed.tsx'



export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
  /** Local part of the From address on the root domain (default 'noreply'). */
  fromLocal?: string
  /** Display name in the From header (default: site name). */
  fromName?: string
  /** Where replies go (default: none). */
  replyTo?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'lesson-scheduled': lessonScheduled,
  'lesson-cancelled': lessonCancelled,
  'lesson-reminder': lessonReminder,
  'report-card-submitted': reportCardSubmitted,
  'intake-converted': intakeConverted,
  'intake-accepted': intakeAccepted,
  'update-addresses': updateAddresses,
  'guardian-added': guardianAdded,
  'tracking-started': trackingStarted,
  'tracking-update': trackingUpdate,
  'tracking-ended': trackingEnded,
  'road-test-scheduled-student': roadTestScheduledStudent,
  'road-test-scheduled-instructor': roadTestScheduledInstructor,
  'pending-slot-notice': pendingSlotNotice,
  'admin-new-contact-submission': adminNewContactSubmission,
  'admin-new-intake-submission': adminNewIntakeSubmission,
  'schedule-proposal': scheduleProposal,
  'lesson-partially-completed': lessonPartiallyCompleted,
}
