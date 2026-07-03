import type { StoredDocument } from "@/lib/types";

const now = new Date().toISOString();

export const SAMPLE_DOCUMENTS: StoredDocument[] = [
  {
    id: "resume-senior-frontend",
    kind: "resume",
    name: "Senior Frontend Resume",
    themeId: "signal",
    createdAt: now,
    updatedAt: now,
    lastSavedAt: now,
    content: `# Jamund Ferguson

Senior Frontend Engineer
Portland, OR
jamund@example.com
github.com/xjamundx
linkedin.com/in/jamund

## Summary

Product-minded frontend engineer with deep experience building design systems, content platforms, and high-quality developer experiences. Comfortable moving between strategy, UX, architecture, and implementation.

## Experience

### Staff Frontend Engineer, Example Cloud
2022 - Present | Remote

- Led the redesign of a document publishing platform used by thousands of teams.
- Built reusable UI primitives that reduced implementation time across product surfaces.
- Partnered with design and platform teams to improve performance, accessibility, and authoring workflows.

### Senior Frontend Engineer, Editorial Labs
2019 - 2022 | Portland, OR

- Shipped a modular markdown publishing system with live preview and print-focused rendering.
- Introduced component testing and UI review practices that reduced regressions in high-traffic flows.

## Projects

### ResumeCloud

- Designing a markdown-first resume studio with themeable previews, local drafting, and export workflows.
- Focused on fast editing, clean document ownership, and practical output for real job applications.

## Skills

TypeScript, React, Next.js, CSS, Design Systems, Accessibility, Product Thinking, Markdown Tooling
`,
  },
  {
    id: "resume-consulting",
    kind: "resume",
    name: "Consulting Resume",
    themeId: "executive",
    createdAt: now,
    updatedAt: now,
    lastSavedAt: now,
    content: `# Jamund Ferguson

Frontend Consultant
Portland, OR
jamund@example.com
jamund.com

## Summary

Consultant specializing in turning early product ideas into polished, maintainable web experiences. Strong collaborator with founders, design teams, and internal product groups.

## Experience

### Independent Consultant
2021 - Present | Remote

- Delivered greenfield product interfaces, editor workflows, and component libraries for startups and agencies.
- Helped teams simplify architecture and create clearer paths from prototype to production.

## Selected Work

### Publishing Platform Modernization

- Reframed legacy UI into a modern editing experience with faster content authoring and better preview fidelity.

### Design System Rollout

- Established shared tokens, component patterns, and documentation for multi-team use.

## Skills

Consulting, Frontend Architecture, Prototyping, Design Systems, React, TypeScript
`,
  },
  {
    id: "cover-letter-acme",
    kind: "cover-letter",
    name: "Acme Cover Letter",
    themeId: "paper",
    createdAt: now,
    updatedAt: now,
    lastSavedAt: now,
    content: `# Cover Letter for Acme

July 3, 2026

Hiring Team
Acme, Inc.

Dear Hiring Team,

I am excited to apply for the Senior Frontend Engineer role at Acme. I enjoy building interfaces that help people think clearly, move quickly, and trust the tools they use every day.

Across product and platform work, I have consistently gravitated toward editor experiences, design systems, and thoughtful user flows. ResumeCloud reflects that same instinct: build a strong core experience, keep the author in control, and make the output polished enough for real-world use.

I would love to bring that blend of product taste and implementation depth to Acme.

Sincerely,

Jamund Ferguson
`,
  },
];
