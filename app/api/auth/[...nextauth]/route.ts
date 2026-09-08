import NextAuth from 'next-auth'
import { authOptions } from '@/src/lib/auth/auth-options'

/**
 * Enterprise SSO entrypoint (Microsoft Entra ID / Azure AD via NextAuth).
 * App Router lives at `/app` in this repo (not `/src/app`).
 */
const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
