export type Application = {
  id: string
  company: string
  role: string
  location: string
  channel: string
  url: string
  appliedAt: string
  status: string
  nextStep: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type InterviewEvent = {
  id: string
  applicationId: string
  title: string
  eventType: string
  startsAt: string
  duration: number
  location: string
  meetingUrl: string
  contact: string
  status: string
  reminderMinutes: number
  createdAt: string
}

export type Review = {
  id: string
  applicationId: string
  eventId: string | null
  title: string
  filePath: string
  storageMode: 'managed' | 'linked'
  createdAt: string
  updatedAt: string
  exists: boolean
}

export type Stage = {
  id: number
  name: string
  color: string
  sortOrder: number
  active: boolean
}

export type StatusHistory = {
  id: string
  applicationId: string
  status: string
  changedAt: string
}

export type Snapshot = {
  applications: Application[]
  events: InterviewEvent[]
  reviews: Review[]
  stages: Stage[]
  history: StatusHistory[]
  dataRoot: string
}

export type ApplicationInput = Omit<Application, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
export type EventInput = Omit<InterviewEvent, 'id' | 'createdAt'> & { id?: string }

export type ReviewDocument = { review: Review; content: string }

export type JobOpportunity = {
  id: string
  company: string
  applied: boolean
  deadline: string
  applicationUrl: string
  imagePath: string
  missingMaterials: string
  hasImage: boolean
  createdAt: string
  updatedAt: string
}

export type JobOpportunityInput = {
  id?: string
  company: string
  applied: boolean
  deadline: string
  applicationUrl: string
  imagePath: string
  missingMaterials: string
}

export type OfferManagerApi = {
  getSnapshot: () => Promise<Snapshot>
  saveApplication: (input: ApplicationInput) => Promise<Snapshot>
  updateApplicationStatus: (input: { id: string; status: string }) => Promise<Snapshot>
  deleteApplication: (id: string) => Promise<Snapshot>
  saveEvent: (input: EventInput) => Promise<Snapshot>
  deleteEvent: (id: string) => Promise<Snapshot>
  createReview: (input: { applicationId: string; eventId?: string | null; title?: string }) => Promise<{ snapshot: Snapshot; review: Review }>
  linkReview: (input: { applicationId: string; eventId?: string | null; title?: string; copyToManaged: boolean }) => Promise<Snapshot | null>
  readReview: (id: string) => Promise<ReviewDocument>
  saveReview: (input: { id: string; content: string }) => Promise<Snapshot>
  openReviewExternal: (id: string) => Promise<boolean>
  deleteReview: (id: string) => Promise<Snapshot>
  openUrl: (url: string) => Promise<void>
  showDataFolder: () => Promise<string>
  exportCsv: () => Promise<boolean>
  listOpportunities: () => Promise<JobOpportunity[]>
  chooseOpportunityImage: () => Promise<{ filePath: string; fileName: string } | null>
  saveOpportunity: (input: JobOpportunityInput) => Promise<JobOpportunity[]>
  toggleOpportunityApplied: (input: { id: string; applied: boolean }) => Promise<JobOpportunity[]>
  deleteOpportunity: (id: string) => Promise<JobOpportunity[]>
  openOpportunityImage: (id: string) => Promise<boolean>
  readOpportunityImage: (id: string) => Promise<string>
}

declare global {
  interface Window { offerManager: OfferManagerApi }
}
