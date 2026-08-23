import { deleteDriveFiles, updateLibraryStore } from "@/storage/google-drive";

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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      conceptId?: number;
      parentId?: number | null;
      title?: string;
      description?: string;
    };
    const title = payload.title?.trim() ?? "";
    if (!title || !Number.isInteger(payload.conceptId)) {
      throw new ApiError(400, "Concept and topic name are required.");
    }

    const conceptId = Number(payload.conceptId);
    const parentId = payload.parentId == null ? null : Number(payload.parentId);
    if (parentId !== null && !Number.isInteger(parentId)) {
      throw new ApiError(400, "Invalid parent topic.");
    }

    const topic = await updateLibraryStore(({ store }) => {
      const concept = store.concepts.find((item) => item.id === conceptId);
      if (!concept) throw new ApiError(404, "Concept not found.");

      if (parentId !== null) {
        const parent = store.topics.find((item) => item.id === parentId);
        if (!parent || parent.conceptId !== conceptId || parent.parentId !== null) {
          throw new ApiError(404, "Parent topic not found.");
        }
      }

      const siblingCount = store.topics.filter(
        (item) => item.conceptId === conceptId && item.parentId === parentId,
      ).length;
      const created = {
        id: store.nextIds.topic++,
        conceptId,
        parentId,
        title,
        description: payload.description?.trim() ?? "",
        sortOrder: siblingCount,
        createdAt: new Date().toISOString(),
      };
      store.topics.push(created);
      return created;
    });

    return Response.json({ topic }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create topic.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) throw new ApiError(400, "Invalid item.");

    const fileIds = await updateLibraryStore(({ store }) => {
      const topic = store.topics.find((item) => item.id === id);
      if (!topic) throw new ApiError(404, "Item not found.");

      const topicIds = new Set<number>([topic.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of store.topics) {
          if (item.parentId !== null && topicIds.has(item.parentId) && !topicIds.has(item.id)) {
            topicIds.add(item.id);
            changed = true;
          }
        }
      }

      const relatedFiles = store.assets
        .filter((asset) => topicIds.has(asset.topicId))
        .map((asset) => asset.driveFileId);
      store.assets = store.assets.filter((asset) => !topicIds.has(asset.topicId));
      store.topics = store.topics.filter((item) => !topicIds.has(item.id));
      return relatedFiles;
    });

    await deleteDriveFiles(fileIds);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error, "Unable to delete item.");
  }
}
