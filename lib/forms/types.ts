export type EvidenceScanStatus = 'Clean' | 'Quarantined' | 'Pending'

export interface EvidenceFile {
  id: string
  name: string
  size: number
  mime: string
  scanStatus: EvidenceScanStatus
}
