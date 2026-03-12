import { type Descendant, Text } from "slate";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// ─── Leaf → HTML string ───────────────────────────────────────────────────────

function leafToHtml(leaf: CustomText): string {
	let html = escapeHtml(leaf.text);
	if (leaf.bold) html = `<strong>${html}</strong>`;
	if (leaf.italic) html = `<em>${html}</em>`;
	if (leaf.underline) html = `<u>${html}</u>`;
	return html;
}

// ─── Node → HTML string ───────────────────────────────────────────────────────

function nodeToHtml(node: Descendant): string {
	// Text leaf
	if (Text.isText(node)) {
		return leafToHtml(node as CustomText);
	}

	const el = node as CustomElement;
	const inner = el.children.map((child) => nodeToHtml(child as Descendant)).join("");

	switch (el.type) {
		case "bulleted-list":
			return `<ul style="padding-left:20px;margin:0 0 12px;">${inner}</ul>`;

		case "numbered-list":
			return `<ol style="padding-left:20px;margin:0 0 12px;">${inner}</ol>`;

		case "list-item":
			return `<li style="margin-bottom:4px;">${inner}</li>`;

		case "link":
			if (el.isButton) {
				return `
<table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
  <tr>
    <td style="background-color:#1a2b4a;border-radius:24px;padding:10px 24px;">
      <a href="${escapeHtml(el.url ?? "")}"
         target="${escapeHtml(el.target ?? "_self")}"
         style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">
        ${inner}
      </a>
    </td>
  </tr>
</table>`.trim();
			}
			return `<a href="${escapeHtml(el.url ?? "")}" target="${escapeHtml(el.target ?? "_self")}" style="color:#0057b8;">${inner}</a>`;

		case "paragraph":
		default:
			// Empty paragraph → spacer
			if (!inner || inner.trim() === "") {
				return `<p style="margin:0 0 12px;">&nbsp;</p>`;
			}
			return `<p style="margin:0 0 12px;line-height:1.6;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">${inner}</p>`;
	}
}

// ─── Parse Slate JSON string ──────────────────────────────────────────────────

function parseBody(json: string): Descendant[] {
	if (!json) return [];
	try {
		const parsed = JSON.parse(json);
		if (Array.isArray(parsed)) return parsed;
	} catch {
		return [{ type: "paragraph", children: [{ text: json }] } as unknown as Descendant];
	}
	return [];
}

// ─── Main export: full email HTML string ─────────────────────────────────────

export type EmailHtmlOptions = {
	lineOfBusiness?: string;
	headerText?: string;
	bodyJson: string;       // from SlateEditor getText()
	footerText?: string;
};

export function slateToEmailHtml({
	lineOfBusiness,
	headerText,
	bodyJson,
	footerText,
}: EmailHtmlOptions): string {
	const nodes = parseBody(bodyJson);
	const bodyHtml = nodes.map(nodeToHtml).join("");

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="640" cellpadding="0" cellspacing="0" border="0"
               style="background:#ffffff;border:1px solid #e0e0e0;border-radius:4px;overflow:hidden;max-width:640px;width:100%;">

          <!-- BofA logo bar -->
          <tr>
            <td align="right" style="padding:16px 32px;border-bottom:1px solid #e8e8e8;">
              <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:800;
                           color:#e31837;letter-spacing:0.08em;text-transform:uppercase;">
                BANK OF AMERICA
              </span>
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding:32px 32px 24px;">

              ${lineOfBusiness ? `
              <!-- Line of business -->
              <p style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;
                         color:#1a1a1a;margin:0 0 16px;">${escapeHtml(lineOfBusiness)}</p>` : ""}

              ${headerText ? `
              <!-- Header -->
              <h2 style="font-family:Arial,sans-serif;font-size:26px;font-weight:700;
                          color:#1a1a1a;margin:0 0 24px;line-height:1.25;">${escapeHtml(headerText)}</h2>` : ""}

              <!-- Body -->
              ${bodyHtml}

            </td>
          </tr>

          ${footerText ? `
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e0e0e0;">
              <p style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;
                         color:#1a1a1a;margin:0;line-height:1.6;">${escapeHtml(footerText)}</p>
            </td>
          </tr>` : ""}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Single HTML string with header + body + footer ──────────────────────────
// Use this when the API only accepts one htmlBody field.
// Header and footer are encoded as data-role divs so they can be parsed back.

export type EmailSaveOptions = {
	headerText?: string;
	bodyJson: string;
	footerText?: string;
};

export function encodeEmailHtml({
	headerText,
	bodyJson,
	footerText,
}: EmailSaveOptions): string {
	const nodes = parseBody(bodyJson);
	const bodyHtml = nodes.map(nodeToHtml).join("");

	const headerPart = headerText
		? `<div data-role="header">${escapeHtml(headerText)}</div>`
		: "";

	const footerPart = footerText
		? `<div data-role="footer">${escapeHtml(footerText)}</div>`
		: "";

	return `${headerPart}<div data-role="body">${bodyHtml}</div>${footerPart}`;
}

export type DecodedEmail = {
	headerText: string;
	bodyHtml: string;
	footerText: string;
};

export function decodeEmailHtml(html: string): DecodedEmail {
	if (!html?.trim()) {
		return { headerText: "", bodyHtml: "", footerText: "" };
	}

	// Browser
	if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
		const doc = new DOMParser().parseFromString(html, "text/html");

		const headerEl = doc.querySelector('[data-role="header"]');
		const bodyEl   = doc.querySelector('[data-role="body"]');
		const footerEl = doc.querySelector('[data-role="footer"]');

		return {
			headerText: headerEl?.textContent?.trim() ?? "",
			bodyHtml:   bodyEl?.innerHTML ?? html,   // fallback: treat entire string as body
			footerText: footerEl?.textContent?.trim() ?? "",
		};
	}

	// Node.js fallback — simple regex
	const headerMatch = html.match(/<div data-role="header">(.*?)<\/div>/s);
	const bodyMatch   = html.match(/<div data-role="body">(.*?)<\/div>/s);
	const footerMatch = html.match(/<div data-role="footer">(.*?)<\/div>/s);

	return {
		headerText: headerMatch ? unescapeHtmlString(headerMatch[1]) : "",
		bodyHtml:   bodyMatch   ? bodyMatch[1] : html,
		footerText: footerMatch ? unescapeHtmlString(footerMatch[1]) : "",
	};
}

function unescapeHtmlString(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'");
}
