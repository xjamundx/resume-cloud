export type ThemeId = "signal" | "paper" | "executive";

export type DocumentKind = "resume" | "cover-letter";

export type StoredDocument = {
  id: string;
  kind: DocumentKind;
  name: string;
  content: string;
  themeId: ThemeId;
  createdAt: string;
  updatedAt: string;
  lastSavedAt: string;
};

export type ParsedEntry = {
  title: string;
  body: string;
};

export type ParsedSection = {
  title: string;
  body: string;
  entries: ParsedEntry[];
};

export type ParsedDocument = {
  title: string;
  introLines: string[];
  sections: ParsedSection[];
};
