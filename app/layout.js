import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description = "AI-powered B2B onboarding workspace for vendors and their customers.";

export const metadata = {
  metadataBase: new URL("https://vector.quest"),
  title: "Vector",
  description,
  openGraph: {
    title: "Vector",
    description,
    url: "/",
    siteName: "Vector",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vector",
    description,
  },
};

export default function RootLayout({ children }) {
  const supabaseEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    key:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      "",
  };
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__SUPABASE_ENV__=${JSON.stringify(supabaseEnv)};`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
