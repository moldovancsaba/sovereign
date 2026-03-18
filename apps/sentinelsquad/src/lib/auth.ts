import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

function envHasGithubOAuth() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function envHasDevLogin() {
  return Boolean(process.env.SENTINELSQUAD_DEV_LOGIN_PASSWORD);
}

const credentialsEnabled = envHasDevLogin();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(envHasGithubOAuth()
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID ?? "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ""
          })
        ]
      : []),
    ...(envHasDevLogin()
      ? [
          CredentialsProvider({
            id: "sentinelsquad-dev",
            name: "Dev Login",
            credentials: {
              email: { label: "Email", type: "text" },
              password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
              const email = String(credentials?.email || "").trim().toLowerCase();
              const password = String(credentials?.password || "");

              const expectedPassword = String(
                process.env.SENTINELSQUAD_DEV_LOGIN_PASSWORD || ""
              );
              const expectedEmail = String(
                process.env.SENTINELSQUAD_DEV_LOGIN_EMAIL || ""
              )
                .trim()
                .toLowerCase();

              if (!email || !password) return null;
              if (password !== expectedPassword) return null;
              if (expectedEmail && email !== expectedEmail) return null;

              const user = await prisma.user.upsert({
                where: { email },
                update: { name: "SentinelSquad Dev" },
                create: { email, name: "SentinelSquad Dev" }
              });

              return { id: user.id, email: user.email, name: user.name };
            }
          })
        ]
      : [])
  ],
  session: { strategy: credentialsEnabled ? "jwt" : "database" },
  pages: {
    signIn: "/signin"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, user, token }) {
      if (session.user) {
        const resolvedUserId = user?.id || (typeof token?.sub === "string" ? token.sub : "");
        if (resolvedUserId) {
          // Expose the user id for server actions.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (session.user as any).id = resolvedUserId;
        }
      }
      return session;
    }
  }
};
