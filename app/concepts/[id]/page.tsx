import type { Metadata } from "next";
import { getLibraryStore } from "@/storage/google-drive";
import SqlLibrary from "../../sql/sql-library";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const concept = await getLibraryStore()
    .then((store) => store.concepts.find((item) => item.id === Number(id)))
    .catch(() => undefined);
  const title = concept ? `${concept.title} | Aardra's Library` : "Concept | Aardra's Library";
  const description = concept?.description || null;
  return {
    title,
    description,
    openGraph: { title, ...(description ? { description } : {}), images: [] },
    twitter: { title, ...(description ? { description } : {}), images: [] },
  };
}

export default async function ConceptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SqlLibrary conceptId={Number(id)} />;
}
