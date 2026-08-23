import { getDriveImage, getLibraryStore } from "@/storage/google-drive";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const assetId = Number(id);
    if (!Number.isInteger(assetId)) return new Response("Not found", { status: 404 });

    const store = await getLibraryStore();
    const asset = store.assets.find((item) => item.id === assetId);
    if (!asset) return new Response("Not found", { status: 404 });

    const driveResponse = await getDriveImage(asset.driveFileId);
    if (!driveResponse.ok || !driveResponse.body) {
      return new Response("Not found", { status: driveResponse.status === 404 ? 404 : 502 });
    }

    const download = new URL(request.url).searchParams.get("download") === "1";
    const safeFilename = asset.filename.replace(/["\r\n]/g, "");
    return new Response(driveResponse.body, {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.byteSize),
        "Cache-Control": "private, max-age=3600",
        ...(driveResponse.headers.get("etag") ? { ETag: driveResponse.headers.get("etag")! } : {}),
        ...(download ? { "Content-Disposition": `attachment; filename="${safeFilename}"` } : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load image.";
    return Response.json({ error: message }, { status: 500 });
  }
}
