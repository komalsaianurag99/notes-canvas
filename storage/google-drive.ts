import { getDb } from "@/db";
import { getRuntimeEnv as getWorkerEnv } from "@/runtime-env";
import {
  assets as legacyAssets,
  concepts as legacyConcepts,
  topics as legacyTopics,
} from "@/db/schema";
import {
  type AssetRecord,
  type LibraryStore,
  createDefaultStore,
  parseLibraryStore,
} from "@/storage/types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DATA_FILE_NAME = "aardras-library-data.json";
const APP_ROLE_KEY = "aardrasLibraryRole";

type RuntimeEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  GOOGLE_DRIVE_FOLDER_NAME?: string;
  BUCKET?: {
    get(key: string): Promise<{
      body: ReadableStream<Uint8Array>;
    } | null>;
  };
};

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
};

type DriveWorkspace = {
  folderId: string;
  dataFileId: string;
};

type StoreWorkspace = DriveWorkspace & {
  store: LibraryStore;
};

type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderName: string;
};

let tokenCache: { value: string; expiresAt: number } | null = null;
let workspacePromise: Promise<DriveWorkspace> | null = null;
let mutationTail: Promise<void> = Promise.resolve();

function getRuntimeEnv(): RuntimeEnv {
  return getWorkerEnv() as RuntimeEnv;
}

function getGoogleConfig(): GoogleConfig {
  const runtime = getRuntimeEnv();
  const clientId = runtime.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = runtime.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = runtime.GOOGLE_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Drive storage is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to the server environment.",
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    folderName: runtime.GOOGLE_DRIVE_FOLDER_NAME?.trim() || "Aardra's Library",
  };
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }

  const config = getGoogleConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Google OAuth could not issue an access token: ${detail}`);
  }

  tokenCache = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, (payload.expires_in ?? 3600) - 60) * 1000,
  };
  return tokenCache.value;
}

async function authorizedFetch(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getAccessToken()}`);
  headers.set("Accept", "application/json");

  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && retry) {
    tokenCache = null;
    return authorizedFetch(url, init, false);
  }
  return response;
}

async function driveError(response: Response, action: string): Promise<never> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string }; message?: string }
    | null;
  const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
  throw new Error(`${action}: ${message}`);
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listDriveFiles(query: string): Promise<DriveFile[]> {
  const search = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "100",
    fields: "files(id,name,mimeType,size)",
  });
  const response = await authorizedFetch(`${DRIVE_API}/files?${search}`);
  if (!response.ok) await driveError(response, "Google Drive file search failed");
  const payload = (await response.json()) as { files?: DriveFile[] };
  return payload.files ?? [];
}

async function createFolder(name: string): Promise<DriveFile> {
  const response = await authorizedFetch(`${DRIVE_API}/files?fields=id,name,mimeType`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { [APP_ROLE_KEY]: "root" },
    }),
  });
  if (!response.ok) await driveError(response, "Google Drive folder creation failed");
  return (await response.json()) as DriveFile;
}

function combineBytes(parts: Uint8Array[]): ArrayBuffer {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result.buffer as ArrayBuffer;
}

async function createMultipartFile(
  metadata: Record<string, unknown>,
  content: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<DriveFile> {
  const boundary = `aardras-library-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  const body = combineBytes([
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    bytes,
    encoder.encode(`\r\n--${boundary}--`),
  ]);

  const response = await authorizedFetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!response.ok) await driveError(response, "Google Drive upload failed");
  return (await response.json()) as DriveFile;
}

async function updateMediaFile(fileId: string, content: string): Promise<void> {
  const response = await authorizedFetch(
    `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: content,
    },
  );
  if (!response.ok) await driveError(response, "Google Drive data update failed");
}

async function downloadDataFile(fileId: string): Promise<LibraryStore> {
  const response = await authorizedFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
  );
  if (!response.ok) await driveError(response, "Google Drive data download failed");

  const value = (await response.json().catch(() => null)) as unknown;
  return parseLibraryStore(value);
}

async function createImageFile(
  folderId: string,
  assetId: number,
  topicId: number,
  filename: string,
  contentType: string,
  bytes: ArrayBuffer,
): Promise<DriveFile> {
  const safeName = filename.replace(/[\u0000-\u001f\u007f]/g, "").trim() || `image-${assetId}`;
  return createMultipartFile(
    {
      name: safeName,
      parents: [folderId],
      appProperties: {
        [APP_ROLE_KEY]: "image",
        aardrasLibraryAssetId: String(assetId),
        aardrasLibraryTopicId: String(topicId),
      },
    },
    bytes,
    contentType,
  );
}

async function buildInitialStore(folderId: string): Promise<LibraryStore> {
  let conceptRows: Array<typeof legacyConcepts.$inferSelect>;
  let topicRows: Array<typeof legacyTopics.$inferSelect>;
  let assetRows: Array<typeof legacyAssets.$inferSelect>;

  try {
    const db = getDb();
    [conceptRows, topicRows, assetRows] = await Promise.all([
      db.select().from(legacyConcepts),
      db.select().from(legacyTopics),
      db.select().from(legacyAssets),
    ]);
  } catch {
    return createDefaultStore();
  }

  conceptRows = conceptRows.filter(
    (concept) => concept.title !== "Agentic AI" && concept.title !== "Data Engineering",
  );
  if (conceptRows.length === 0) return createDefaultStore();

  const conceptIds = new Set(conceptRows.map((concept) => concept.id));
  topicRows = topicRows.filter((topic) => conceptIds.has(topic.conceptId));
  const topicIds = new Set(topicRows.map((topic) => topic.id));
  assetRows = assetRows.filter((asset) => topicIds.has(asset.topicId));

  const migratedAssets: AssetRecord[] = [];
  const bucket = getRuntimeEnv().BUCKET;
  if (bucket) {
    for (const asset of assetRows) {
      try {
        const object = await bucket.get(asset.objectKey);
        if (!object) continue;
        const bytes = await new Response(object.body).arrayBuffer();
        const driveFile = await createImageFile(
          folderId,
          asset.id,
          asset.topicId,
          asset.filename,
          asset.contentType,
          bytes,
        );
        migratedAssets.push({
          id: asset.id,
          topicId: asset.topicId,
          driveFileId: driveFile.id,
          filename: asset.filename,
          contentType: asset.contentType,
          byteSize: asset.byteSize,
          createdAt: asset.createdAt,
        });
      } catch (error) {
        console.error("A legacy image could not be migrated to Google Drive.", error);
      }
    }
  }

  return {
    version: 1,
    nextIds: {
      concept: Math.max(0, ...conceptRows.map((item) => item.id)) + 1,
      topic: Math.max(0, ...topicRows.map((item) => item.id)) + 1,
      asset: Math.max(0, ...assetRows.map((item) => item.id)) + 1,
    },
    concepts: conceptRows.map((concept) => ({
      id: concept.id,
      title: concept.title,
      description: concept.description,
      accent: concept.accent,
      sortOrder: concept.sortOrder,
      createdAt: concept.createdAt,
    })),
    topics: topicRows.map((topic) => ({
      id: topic.id,
      conceptId: topic.conceptId,
      parentId: topic.parentId,
      title: topic.title,
      description: topic.description,
      sortOrder: topic.sortOrder,
      createdAt: topic.createdAt,
    })),
    assets: migratedAssets,
  };
}

async function createDataFile(folderId: string): Promise<DriveFile> {
  const initialStore = await buildInitialStore(folderId);
  return createMultipartFile(
    {
      name: DATA_FILE_NAME,
      parents: [folderId],
      appProperties: { [APP_ROLE_KEY]: "data" },
    },
    new TextEncoder().encode(JSON.stringify(initialStore, null, 2)),
    "application/json; charset=UTF-8",
  );
}

async function initializeWorkspace(): Promise<DriveWorkspace> {
  const config = getGoogleConfig();
  const role = escapeDriveQuery(APP_ROLE_KEY);
  const rootFiles = await listDriveFiles(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='${role}' and value='root' }`,
  );
  const folder = rootFiles[0] ?? (await createFolder(config.folderName));

  const dataFiles = await listDriveFiles(
    `'${escapeDriveQuery(folder.id)}' in parents and trashed=false and appProperties has { key='${role}' and value='data' }`,
  );
  const dataFile = dataFiles[0] ?? (await createDataFile(folder.id));

  return { folderId: folder.id, dataFileId: dataFile.id };
}

async function getWorkspace(): Promise<DriveWorkspace> {
  if (!workspacePromise) {
    workspacePromise = initializeWorkspace().catch((error) => {
      workspacePromise = null;
      throw error;
    });
  }
  return workspacePromise;
}

async function loadStoreWorkspace(): Promise<StoreWorkspace> {
  const workspace = await getWorkspace();
  return { ...workspace, store: await downloadDataFile(workspace.dataFileId) };
}

export async function getLibraryStore(): Promise<LibraryStore> {
  return (await loadStoreWorkspace()).store;
}

export async function updateLibraryStore<T>(
  mutate: (workspace: { store: LibraryStore; folderId: string }) => T | Promise<T>,
): Promise<T> {
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waitFor = mutationTail;
  mutationTail = turn;
  await waitFor;

  try {
    const workspace = await loadStoreWorkspace();
    const result = await mutate({ store: workspace.store, folderId: workspace.folderId });
    await updateMediaFile(workspace.dataFileId, JSON.stringify(workspace.store, null, 2));
    return result;
  } finally {
    release();
  }
}

export async function uploadImageToDrive(
  folderId: string,
  assetId: number,
  topicId: number,
  file: File,
): Promise<DriveFile> {
  return createImageFile(
    folderId,
    assetId,
    topicId,
    file.name,
    file.type,
    await file.arrayBuffer(),
  );
}

export async function deleteDriveFiles(fileIds: string[]): Promise<void> {
  await Promise.all(
    fileIds.map(async (fileId) => {
      const response = await authorizedFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        console.error(`Google Drive file ${fileId} could not be deleted (HTTP ${response.status}).`);
      }
    }),
  );
}

export async function getDriveImage(fileId: string): Promise<Response> {
  return authorizedFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
}
