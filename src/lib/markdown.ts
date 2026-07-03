import { marked } from "marked";

import type {
  DocumentKind,
  ParsedDocument,
  ParsedEntry,
  ParsedSection,
  ThemeId,
} from "@/lib/types";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function parseDocument(content: string, kind: DocumentKind): ParsedDocument {
  if (kind === "cover-letter") {
    return parseCoverLetter(content);
  }

  return parseResume(content);
}

function parseCoverLetter(content: string): ParsedDocument {
  const lines = normalizeLines(content);
  const titleLine = lines.find((line) => line.startsWith("# "));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : "Untitled Cover Letter";
  const remaining = lines.filter((line) => line !== titleLine).join("\n").trim();

  return {
    title,
    introLines: [],
    sections: [
      {
        title: "Letter",
        body: remaining,
        entries: [],
      },
    ],
  };
}

function parseResume(content: string): ParsedDocument {
  const lines = normalizeLines(content);
  const titleIndex = lines.findIndex((line) => line.startsWith("# "));
  const title =
    titleIndex >= 0 ? lines[titleIndex].replace(/^#\s+/, "").trim() : "Untitled Resume";
  const firstSectionIndex = lines.findIndex((line) => line.startsWith("## "));

  const introLines = lines
    .slice(titleIndex >= 0 ? titleIndex + 1 : 0, firstSectionIndex >= 0 ? firstSectionIndex : lines.length)
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let currentEntry: ParsedEntry | null = null;
  let currentSectionBody: string[] = [];
  let currentEntryBody: string[] = [];

  const flushEntry = () => {
    if (!currentSection || !currentEntry) {
      return;
    }

    currentEntry.body = currentEntryBody.join("\n").trim();
    currentSection.entries.push(currentEntry);
    currentEntry = null;
    currentEntryBody = [];
  };

  const flushSection = () => {
    flushEntry();

    if (!currentSection) {
      return;
    }

    currentSection.body = currentSectionBody.join("\n").trim();
    sections.push(currentSection);
    currentSection = null;
    currentSectionBody = [];
  };

  for (const line of lines.slice(firstSectionIndex >= 0 ? firstSectionIndex : lines.length)) {
    if (line.startsWith("## ")) {
      flushSection();
      currentSection = {
        title: line.replace(/^##\s+/, "").trim(),
        body: "",
        entries: [],
      };
      continue;
    }

    if (!currentSection) {
      continue;
    }

    if (line.startsWith("### ")) {
      flushEntry();
      currentEntry = {
        title: line.replace(/^###\s+/, "").trim(),
        body: "",
      };
      continue;
    }

    if (currentEntry) {
      currentEntryBody.push(line);
    } else {
      currentSectionBody.push(line);
    }
  }

  flushSection();

  return {
    title,
    introLines,
    sections,
  };
}

function normalizeLines(content: string) {
  return content.replaceAll("\r\n", "\n").split("\n");
}

export async function markdownToHtml(markdown: string) {
  return marked.parse(markdown);
}

export function getThemeExportCss(themeId: ThemeId) {
  switch (themeId) {
    case "paper":
      return `
        body { font-family: Georgia, serif; background: #f6f0e8; color: #2c221a; margin: 0; }
        .page { max-width: 860px; margin: 0 auto; padding: 56px 48px 72px; }
        .header { text-align: center; border-bottom: 1px solid #cdb79f; padding-bottom: 24px; margin-bottom: 32px; }
        .header h1 { font-size: 2.75rem; margin: 0 0 12px; }
        .intro { color: #5b4938; line-height: 1.7; }
        h2 { text-transform: uppercase; letter-spacing: .18em; font-size: .78rem; margin: 32px 0 12px; color: #8d5f3b; }
        h3 { font-size: 1.15rem; margin: 18px 0 8px; }
        p, li { line-height: 1.7; }
      `;
    case "executive":
      return `
        body { font-family: Inter, Arial, sans-serif; background: #f5f7fb; color: #162033; margin: 0; }
        .page { max-width: 980px; margin: 0 auto; padding: 48px; }
        .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #162033; padding-bottom: 20px; margin-bottom: 28px; }
        .header h1 { font-size: 2.6rem; margin: 0 0 10px; }
        .intro { max-width: 320px; color: #44506a; line-height: 1.6; }
        h2 { font-size: .85rem; letter-spacing: .16em; text-transform: uppercase; color: #5a6b8c; margin: 28px 0 10px; }
        h3 { font-size: 1.05rem; margin: 16px 0 8px; }
        p, li { line-height: 1.65; }
      `;
    case "signal":
    default:
      return `
        body { font-family: Inter, Arial, sans-serif; background: #f3f4f6; color: #111827; margin: 0; }
        .page { max-width: 980px; margin: 0 auto; padding: 40px; }
        .header { background: linear-gradient(135deg, #fff7ed, #ffffff); border: 1px solid #fed7aa; border-radius: 28px; padding: 28px 32px; margin-bottom: 24px; }
        .header h1 { font-size: 2.6rem; margin: 0 0 12px; }
        .intro { display: flex; flex-wrap: wrap; gap: 8px; color: #7c2d12; }
        .intro span { background: #fff; border: 1px solid #fdba74; border-radius: 999px; padding: 6px 12px; font-size: .92rem; }
        h2 { font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; color: #9a3412; margin: 28px 0 10px; }
        h3 { font-size: 1.08rem; margin: 16px 0 8px; }
        p, li { line-height: 1.65; }
      `;
  }
}

export async function createHtmlExport(
  title: string,
  markdown: string,
  themeId: ThemeId,
) {
  const content = await markdownToHtml(markdown);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      ${getThemeExportCss(themeId)}
    </style>
  </head>
  <body>
    <main class="page">
      ${content}
    </main>
  </body>
</html>`;
}
