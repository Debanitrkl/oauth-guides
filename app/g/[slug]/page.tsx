import { notFound } from "next/navigation";
import { GuideView } from "@/components/GuideView";
import { getLibraryGuide } from "@/lib/library";
import { loadGeneratedGuide } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = (await getLibraryGuide(slug)) ?? (await loadGeneratedGuide(slug));
  if (!guide) notFound();
  return <GuideView guide={guide} />;
}
