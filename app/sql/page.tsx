import type { Metadata } from "next";
import SqlLibrary from "./sql-library";

export const metadata: Metadata = {
  title: "SQL | Aardra's Library",
  description: "SQL sections, subsections, and visual learning notes.",
  openGraph: {
    title: "SQL | Aardra's Library",
    description: "SQL sections, subsections, and visual learning notes.",
    images: [],
  },
  twitter: {
    title: "SQL | Aardra's Library",
    description: "SQL sections, subsections, and visual learning notes.",
    images: [],
  },
};

export default function SqlPage() {
  return <SqlLibrary />;
}
