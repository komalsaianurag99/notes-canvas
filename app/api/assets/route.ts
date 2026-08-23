import {
  deleteDriveFiles,
  updateLibraryStore,
  uploadImageToDrive,
} from "@/storage/google-drive";

const MAX_STORED_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 11 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new ApiError(413, "The image is too large. Choose an image smaller than 10 MB.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "The upload could not be read. Choose the image again.");
    }

    const file = form.get("file");
    const topicId = Number(form.get("topicId"));
    if (!(file instanceof File) || !Number.isInteger(topicId)) {
      throw new ApiError(400, "Choose an image to upload.");
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      throw new ApiError(400, "Choose a PNG, JPG, or WEBP image.");
    }
    if (file.size > MAX_STORED_IMAGE_BYTES) {
      throw new ApiError(413, "The image is too large. Choose an image smaller than 10 MB.");
    }

    const upload = await updateLibraryStore(async ({ store, folderId }) => {
      const topic = store.topics.find((item) => item.id === topicId);
      if (!topic) throw new ApiError(404, "Topic not found.");

      const replacedFileIds = store.assets
        .filter((item) => item.topicId === topicId)
        .map((item) => item.driveFileId);
      const assetId = store.nextIds.asset++;
      const driveFile = await uploadImageToDrive(folderId, assetId, topicId, file);
      const created = {
        id: assetId,
        topicId,
        driveFileId: driveFile.id,
        filename: file.name,
        contentType: file.type,
        byteSize: file.size,
        createdAt: new Date().toISOString(),
      };
      store.assets = store.assets.filter((item) => item.topicId !== topicId);
      store.assets.push(created);
      return {
        replacedFileIds,
        asset: {
          id: created.id,
          topicId: created.topicId,
          filename: created.filename,
          contentType: created.contentType,
          byteSize: created.byteSize,
          createdAt: created.createdAt,
        },
      };
    });

    await deleteDriveFiles(upload.replacedFileIds);
    return Response.json({ asset: upload.asset }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to upload image.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) throw new ApiError(400, "Invalid image.");

    const fileIds = await updateLibraryStore(({ store }) => {
      const asset = store.assets.find((item) => item.id === id);
      if (!asset) throw new ApiError(404, "Image not found.");

      const relatedAssets = store.assets.filter((item) => item.topicId === asset.topicId);
      store.assets = store.assets.filter((item) => item.topicId !== asset.topicId);
      return relatedAssets.map((item) => item.driveFileId);
    });

    await deleteDriveFiles(fileIds);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error, "Unable to delete image.");
  }
}
