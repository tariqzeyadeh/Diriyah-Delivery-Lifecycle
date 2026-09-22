import { AtlasLayout } from '@/components/atlas/AtlasLayout'

export const dynamic = 'force-dynamic'

export default function AtlasRouteLayout({ children }: { children: React.ReactNode }) {
  return <AtlasLayout>{children}</AtlasLayout>
}
