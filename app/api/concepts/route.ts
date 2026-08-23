import {
  deleteDriveFiles,
  getLibraryStore,
  updateLibraryStore,
} from "@/storage/google-drive";
import { toPublicLibrary } from "@/storage/types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    return Response.json(toPublicLibrary(await getLibraryStore()));
  } catch (error) {
    return errorResponse(error, "Unable to load the library.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      title?: string;
      description?: string;
      accent?: string;
    };
    const title = payload.title?.trim() ?? "";
    if (!title) throw new ApiError(400, "Concept name is required.");

    const concept = await updateLibraryStore(({ store }) => {
      if (store.concepts.some((item) => item.title.toLowerCase() === title.toLowerCase())) {
        throw new ApiError(409, "A concept with this name already exists.");
      }

      const created = {
        id: store.nextIds.concept++,
        title,
        description: payload.description?.trim() ?? "",
        accent: ["violet", "orange", "teal", "blue", "rose"].includes(payload.accent ?? "")
          ? payload.accent!
          : "violet",
        sortOrder: store.concepts.length,
        createdAt: new Date().toISOString(),
      };
      store.concepts.push(created);
      return created;
    });

    return Response.json({ concept }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create concept.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) throw new ApiError(400, "Invalid concept.");

    const fileIds = await updateLibraryStore(({ store }) => {
      const concept = store.concepts.find((item) => item.id === id);
      if (!concept) throw new ApiError(404, "Concept not found.");
      if (concept.title === "SQL") {
        throw new ApiError(403, "The default SQL concept is protected.");
      }

      const topicIds = new Set(
        store.topics.filter((topic) => topic.conceptId === concept.id).map((topic) => topic.id),
      );
      const relatedFiles = store.assets
        .filter((asset) => topicIds.has(asset.topicId))
        .map((asset) => asset.driveFileId);

      store.assets = store.assets.filter((asset) => !topicIds.has(asset.topicId));
      store.topics = store.topics.filter((topic) => topic.conceptId !== concept.id);
      store.concepts = store.concepts.filter((item) => item.id !== concept.id);
      return relatedFiles;
    });

    await deleteDriveFiles(fileIds);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error, "Unable to delete concept.");
  }
}
