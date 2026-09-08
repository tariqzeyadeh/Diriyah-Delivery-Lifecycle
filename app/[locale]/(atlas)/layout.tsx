'use client'

import { AtlasLayout } from '@/components/atlas/AtlasLayout'

export default function AtlasRouteLayout({ children }: { children: React.ReactNode }) {
  return <AtlasLayout>{children}</AtlasLayout>
}
