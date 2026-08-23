import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://concept-canvas.saianurag234.chatgpt.site"),
  title: "Aardra's Library",
  description: "A professional visual knowledge library for structured SQL learning.",
  openGraph: {
    title: "Aardra's Library",
    description: "SQL Visual Knowledge Library",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Aardra's Library — SQL Visual Knowledge Library" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aardra's Library",
    description: "SQL Visual Knowledge Library",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="codex-preview" content="development" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('aardra-theme');var d=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=d;}catch(e){document.documentElement.dataset.theme='light';}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
