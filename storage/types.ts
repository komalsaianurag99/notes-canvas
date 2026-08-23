export type ConceptRecord = {
  id: number;
  title: string;
  description: string;
  accent: string;
  sortOrder: number;
  createdAt: string;
};

export type TopicRecord = {
  id: number;
  conceptId: number;
  parentId: number | null;
  title: string;
  description: string;
  sortOrder: number;
  createdAt: string;
};

export type AssetRecord = {
  id: number;
  topicId: number;
  driveFileId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

export type LibraryStore = {
  version: 1;
  nextIds: {
    concept: number;
    topic: number;
    asset: number;
  };
  concepts: ConceptRecord[];
  topics: TopicRecord[];
  assets: AssetRecord[];
};

export type PublicAssetRecord = Omit<AssetRecord, "driveFileId">;

export type PublicLibrary = {
  concepts: ConceptRecord[];
  topics: TopicRecord[];
  assets: PublicAssetRecord[];
};

export function createDefaultStore(): LibraryStore {
  const createdAt = new Date().toISOString();

  return {
    version: 1,
    nextIds: { concept: 2, topic: 9, asset: 1 },
    concepts: [
      {
        id: 1,
        title: "SQL",
        description: "",
        accent: "blue",
        sortOrder: 0,
        createdAt,
      },
    ],
    topics: [
      { id: 1, conceptId: 1, parentId: null, title: "Database foundations", description: "", sortOrder: 0, createdAt },
      { id: 2, conceptId: 1, parentId: null, title: "SQL command categories", description: "", sortOrder: 1, createdAt },
      { id: 3, conceptId: 1, parentId: null, title: "Joins and relationships", description: "", sortOrder: 2, createdAt },
      { id: 4, conceptId: 1, parentId: 1, title: "DBMS vs database", description: "", sortOrder: 0, createdAt },
      { id: 5, conceptId: 1, parentId: 1, title: "Tables, rows & columns", description: "", sortOrder: 1, createdAt },
      { id: 6, conceptId: 1, parentId: 2, title: "DDL commands", description: "", sortOrder: 0, createdAt },
      { id: 7, conceptId: 1, parentId: 2, title: "DML and DQL commands", description: "", sortOrder: 1, createdAt },
      { id: 8, conceptId: 1, parentId: 3, title: "INNER and OUTER joins", description: "", sortOrder: 0, createdAt },
    ],
    assets: [],
  };
}

export function parseLibraryStore(value: unknown): LibraryStore {
  if (!value || typeof value !== "object") {
    throw new Error("The Google Drive library data file is not valid JSON data.");
  }

  const store = value as Partial<LibraryStore>;
  if (
    store.version !== 1 ||
    !store.nextIds ||
    !Array.isArray(store.concepts) ||
    !Array.isArray(store.topics) ||
    !Array.isArray(store.assets)
  ) {
    throw new Error("The Google Drive library data file has an unsupported format.");
  }

  return store as LibraryStore;
}

export function toPublicLibrary(store: LibraryStore): PublicLibrary {
  return {
    concepts: [...store.concepts].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    topics: [...store.topics].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    assets: [...store.assets]
      .sort((a, b) => a.id - b.id)
      .map((asset) => ({
        id: asset.id,
        topicId: asset.topicId,
        filename: asset.filename,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        createdAt: asset.createdAt,
      })),
  };
}
