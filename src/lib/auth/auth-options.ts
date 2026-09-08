import type { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import {
  extractEnterpriseRole,
  normalizeAzureGroupClaims,
} from '@/src/lib/auth/extract-enterprise-role'
import type { AtlasRole } from '@/src/providers/AuthProvider'

const azureConfigured = Boolean(
  process.env.AZURE_AD_CLIENT_ID &&
  process.env.AZURE_AD_CLIENT_SECRET &&
  process.env.AZURE_AD_TENANT_ID,
)

/**
 * NextAuth (v4) options — Microsoft Entra ID / Azure AD SSO.
 * Demo persona switcher remains available when AUTH_MODE=demo (default for POC).
 */
export const authOptions: NextAuthOptions = {
  providers: azureConfigured
    ? [
        AzureADProvider({
          clientId: process.env.AZURE_AD_CLIENT_ID!,
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
          tenantId: process.env.AZURE_AD_TENANT_ID!,
          authorization: {
            params: {
              // Request group membership claims (token configuration + admin consent required)
              scope: 'openid profile email User.Read GroupMember.Read.All',
            },
          },
        }),
      ]
    : [],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8h enterprise session
  },
  pages: {
    signIn: '/api/auth/signin',
    error: '/api/auth/error',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const groups = normalizeAzureGroupClaims(profile as { groups?: string[]; roles?: string[] })
        const role: AtlasRole = extractEnterpriseRole(groups)
        token.atlasRole = role
        token.azureGroups = groups
        token.oid = (profile as { oid?: string }).oid ?? token.sub
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.atlasRole = (token.atlasRole as AtlasRole) ?? 'Business Owner'
        session.user.azureGroups = (token.azureGroups as string[]) ?? []
        session.user.oid = (token.oid as string) ?? token.sub
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? 'atlas-poc-dev-secret-change-me',
  debug: process.env.NODE_ENV === 'development',
}
