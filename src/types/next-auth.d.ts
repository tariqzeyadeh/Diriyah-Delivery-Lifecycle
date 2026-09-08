import 'next-auth'
import 'next-auth/jwt'
import type { AtlasRole } from '@/src/providers/AuthProvider'

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      atlasRole: AtlasRole
      azureGroups: string[]
      oid?: string
    }
  }

  interface User {
    atlasRole?: AtlasRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    atlasRole?: AtlasRole
    azureGroups?: string[]
    oid?: string
  }
}
