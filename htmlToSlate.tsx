/**
 * htmlToSlate.ts
 *
 * Converts an HTML string back to a Slate Descendant[] array.
 * Works in both browser (DOMParser) and Node.js (via a lightweight
 * html-parse-stringify or node-html-parser — see the Node.js note below).
 *
 * Usage:
 *   const descendants = htmlToSlate(htmlString);
 *   // Then load into the editor:
 *   editor.children = descendants;
 *   editor.onChange();
 */

import { type Descendant } from "slate";

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomText = {
	text: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
};

type CustomElement = {
	type: "paragraph" | "bulleted-list" | "numbered-list" | "list-item" | "link";
	url?: string;
	target?: string;
	isButton?: boolean;
	children: (CustomText | CustomElement)[];
};

// ─── HTML → DOM ───────────────────────────────────────────────────────────────

function parseHtml(html: string): HTMLElement {
	// Browser
	if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
		const doc = new DOMParser().parseFromString(html, "text/html");
		return doc.body;
	}

	// Node.js — requires: npm install node-html-parser
	// If you're running this server-side for test/email roundtrip:
	//   const { parse } = require("node-html-parser");
	//   return parse(html) as unknown as HTMLElement;

	throw new Error(
		"htmlToSlate: DOMParser not available. " +
		"In Node.js, install node-html-parser and uncomment the Node.js block above.",
	);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unescapeHtml(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&nbsp;/g, " ");
}

function isInlineButtonAnchor(el: Element): boolean {
	// Detect buttons we generated: dark background or table-wrapped CTA
	const bg = (el as HTMLElement).style?.backgroundColor ?? "";
	return bg.includes("1a2b4a") || el.closest("table") !== null;
}

// ─── DOM Node → Slate nodes ───────────────────────────────────────────────────

function domNodeToSlate(
	node: Node,
	marks: { bold?: boolean; italic?: boolean; underline?: boolean } = {},
): (CustomText | CustomElement)[] {
	// Text node
	if (node.nodeType === Node.TEXT_NODE) {
		const text = unescapeHtml(node.textContent ?? "");
		if (!text) return [];
		return [{ text, ...marks }];
	}

	if (node.nodeType !== Node.ELEMENT_NODE) return [];

	const el = node as Element;
	const tag = el.tagName.toLowerCase();

	// ── Marks ──────────────────────────────────────────────────────────────────
	if (tag === "strong" || tag === "b") {
		return childrenToSlate(el, { ...marks, bold: true });
	}
	if (tag === "em" || tag === "i") {
		return childrenToSlate(el, { ...marks, italic: true });
	}
	if (tag === "u") {
		return childrenToSlate(el, { ...marks, underline: true });
	}

	// ── Inline elements (span, etc.) — inherit marks ───────────────────────────
	if (tag === "span") {
		return childrenToSlate(el, marks);
	}

	// ── Links ──────────────────────────────────────────────────────────────────
	if (tag === "a") {
		const href = el.getAttribute("href") ?? "";
		const target = el.getAttribute("target") ?? undefined;
		const isButton = isInlineButtonAnchor(el);
		const children = childrenToSlate(el, {});
		return [
			{
				type: "link",
				url: href,
				target,
				isButton,
				children: children.length ? children : [{ text: "" }],
			} as CustomElement,
		];
	}

	// ── Table-wrapped CTA button (from slateToHtml output) ────────────────────
	if (tag === "table") {
		const anchor = el.querySelector("a");
		if (anchor) {
			const href = anchor.getAttribute("href") ?? "";
			const target = anchor.getAttribute("target") ?? undefined;
			const children = childrenToSlate(anchor, {});
			return [
				{
					type: "link",
					url: href,
					target,
					isButton: true,
					children: children.length ? children : [{ text: "" }],
				} as CustomElement,
			];
		}
		return [];
	}

	// ── Block elements ─────────────────────────────────────────────────────────
	if (tag === "p") {
		const children = childrenToSlate(el, {});
		return [
			{
				type: "paragraph",
				children: children.length ? children : [{ text: "" }],
			} as CustomElement,
		];
	}

	if (tag === "ul") {
		const items = listItemsToSlate(el);
		return [{ type: "bulleted-list", children: items } as CustomElement];
	}

	if (tag === "ol") {
		const items = listItemsToSlate(el);
		return [{ type: "numbered-list", children: items } as CustomElement];
	}

	if (tag === "li") {
		const children = childrenToSlate(el, {});
		return [
			{
				type: "list-item",
				children: children.length ? children : [{ text: "" }],
			} as CustomElement,
		];
	}

	// ── Headings → paragraph (we don't use h1/h2 in this editor) ──────────────
	if (tag === "h1" || tag === "h2" || tag === "h3") {
		const children = childrenToSlate(el, { bold: true });
		return [
			{
				type: "paragraph",
				children: children.length ? children : [{ text: "" }],
			} as CustomElement,
		];
	}

	// ── Ignore structural email elements ───────────────────────────────────────
	if (["html", "head", "style", "meta", "title"].includes(tag)) {
		return [];
	}

	// ── Fallback: recurse into children ───────────────────────────────────────
	return childrenToSlate(el, marks);
}

function childrenToSlate(
	el: Element,
	marks: { bold?: boolean; italic?: boolean; underline?: boolean },
): (CustomText | CustomElement)[] {
	const result: (CustomText | CustomElement)[] = [];
	el.childNodes.forEach((child) => {
		result.push(...domNodeToSlate(child, marks));
	});
	return result;
}

function listItemsToSlate(el: Element): CustomElement[] {
	const items: CustomElement[] = [];
	el.childNodes.forEach((child) => {
		const nodes = domNodeToSlate(child);
		nodes.forEach((n) => {
			if ((n as CustomElement).type === "list-item") {
				items.push(n as CustomElement);
			}
		});
	});
	return items;
}

// ─── Top-level body children → Slate blocks ───────────────────────────────────

function bodyToSlate(body: HTMLElement): Descendant[] {
	const result: Descendant[] = [];

	body.childNodes.forEach((child) => {
		const nodes = domNodeToSlate(child);
		nodes.forEach((n) => {
			// Only push block-level nodes at the top level
			const el = n as CustomElement;
			if (el.type) {
				result.push(el as unknown as Descendant);
			} else {
				// Bare text at top level — wrap in paragraph
				const text = (n as CustomText).text ?? "";
				if (text.trim()) {
					result.push({
						type: "paragraph",
						children: [n as CustomText],
					} as unknown as Descendant);
				}
			}
		});
	});

	// Always return at least one empty paragraph
	if (!result.length) {
		return [{ type: "paragraph", children: [{ text: "" }] } as unknown as Descendant];
	}

	return result;
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Convert an HTML string to Slate Descendant[].
 * Pass the full email HTML or just the body snippet.
 */
export function htmlToSlate(html: string): Descendant[] {
	if (!html?.trim()) {
		return [{ type: "paragraph", children: [{ text: "" }] } as unknown as Descendant];
	}

	const body = parseHtml(html);

	// If the HTML is a full email wrapper (from slateToEmailHtml),
	// find the main content cell and parse only that
	const mainTd = body.querySelector("td > table td");
	const target = mainTd ?? body;

	return bodyToSlate(target as HTMLElement);
}

/**
 * Convenience: parse Slate JSON string → Descendant[]
 * Falls back to htmlToSlate if the string looks like HTML.
 */
export function parseEditorValue(raw: string): Descendant[] {
	if (!raw?.trim()) {
		return [{ type: "paragraph", children: [{ text: "" }] } as unknown as Descendant];
	}

	// Try JSON first (Slate native format)
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length) return parsed as Descendant[];
	} catch {
		// Not JSON
	}

	// Looks like HTML — convert it
	if (raw.trimStart().startsWith("<")) {
		return htmlToSlate(raw);
	}

	// Plain text fallback
	return [
		{
			type: "paragraph",
			children: [{ text: raw }],
		} as unknown as Descendant,
	];
}
