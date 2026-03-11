import React from "react";
import { type Descendant, type BaseEditor, Element as SlateElement, Text } from "slate";
import { type ReactEditor } from "slate-react";

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
	children: CustomText[];
};

// ─── Props ────────────────────────────────────────────────────────────────────

export type EmailPreviewProps = {
	lineOfBusiness?: string;   // e.g. "Enterprise Communications"
	headerText?: string;       // large heading
	bodyJson: string;          // JSON string from SlateEditor getText()
	footerText?: string;       // bold footer line
};

// ─── Slate JSON → React renderer ─────────────────────────────────────────────

function renderLeaf(leaf: CustomText, key: string | number): React.ReactNode {
	let content: React.ReactNode = leaf.text;
	if (leaf.bold) content = <strong key={key}>{content}</strong>;
	if (leaf.italic) content = <em key={key}>{content}</em>;
	if (leaf.underline) content = <u key={key}>{content}</u>;
	return <React.Fragment key={key}>{content}</React.Fragment>;
}

function renderNode(node: Descendant, index: number): React.ReactNode {
	// Text leaf
	if (Text.isText(node)) {
		return renderLeaf(node as CustomText, index);
	}

	const el = node as CustomElement;
	const children = el.children.map((child, i) => renderNode(child as unknown as Descendant, i));

	switch (el.type) {
		case "bulleted-list":
			return (
				<ul key={index} style={{ paddingLeft: 20, margin: "8px 0" }}>
					{children}
				</ul>
			);
		case "numbered-list":
			return (
				<ol key={index} style={{ paddingLeft: 20, margin: "8px 0" }}>
					{children}
				</ol>
			);
		case "list-item":
			return <li key={index} style={{ marginBottom: 4 }}>{children}</li>;
		case "link":
			if (el.isButton) {
				return (
					<a
						key={index}
						href={el.url}
						target={el.target}
						rel="noreferrer"
						style={{
							display: "inline-block",
							backgroundColor: "#1a2b4a",
							color: "#fff",
							borderRadius: 24,
							padding: "8px 20px",
							fontSize: 14,
							fontWeight: 600,
							textDecoration: "none",
							margin: "12px 0",
						}}
					>
						{children}
					</a>
				);
			}
			return (
				<a key={index} href={el.url} target={el.target} rel="noreferrer"
					style={{ color: "#0057b8" }}>
					{children}
				</a>
			);
		case "paragraph":
		default:
			return (
				<p key={index} style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
					{children}
				</p>
			);
	}
}

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

// ─── EmailPreview ─────────────────────────────────────────────────────────────

export const EmailPreview: React.FC<EmailPreviewProps> = ({
	lineOfBusiness,
	headerText,
	bodyJson,
	footerText,
}) => {
	const nodes = parseBody(bodyJson);

	return (
		<div
			style={{
				fontFamily: "'Arial', sans-serif",
				fontSize: 14,
				color: "#1a1a1a",
				backgroundColor: "#fff",
				maxWidth: 700,
				margin: "0 auto",
				border: "1px solid #e0e0e0",
				borderRadius: 4,
				overflow: "hidden",
			}}
		>
			{/* ── Top bar with BofA logo ── */}
			<div
				style={{
					padding: "16px 32px",
					display: "flex",
					justifyContent: "flex-end",
					alignItems: "center",
					borderBottom: "1px solid #e8e8e8",
				}}
			>
				{/* BofA wordmark — text fallback if image not available */}
				<span
					style={{
						fontWeight: 800,
						fontSize: 13,
						letterSpacing: "0.08em",
						color: "#e31837",
						textTransform: "uppercase",
					}}
				>
					BANK OF AMERICA{" "}
					<span style={{ fontSize: 16 }}>⛿</span>
				</span>
			</div>

			{/* ── Body content ── */}
			<div style={{ padding: "32px 32px 24px" }}>

				{/* Line of business */}
				{lineOfBusiness && (
					<p
						style={{
							fontWeight: 700,
							fontSize: 13,
							margin: "0 0 16px",
							color: "#1a1a1a",
						}}
					>
						{lineOfBusiness}
					</p>
				)}

				{/* Header — large bold heading */}
				{headerText && (
					<h1
						style={{
							fontWeight: 700,
							fontSize: 26,
							margin: "0 0 24px",
							lineHeight: 1.25,
							color: "#1a1a1a",
						}}
					>
						{headerText}
					</h1>
				)}

				{/* Slate body */}
				<div style={{ color: "#1a1a1a", lineHeight: 1.65 }}>
					{nodes.map((node, i) => renderNode(node, i))}
				</div>
			</div>

			{/* ── Footer ── */}
			{footerText && (
				<div
					style={{
						padding: "20px 32px",
						borderTop: "1px solid #e0e0e0",
						backgroundColor: "#fff",
					}}
				>
					<p
						style={{
							margin: 0,
							fontWeight: 700,
							fontSize: 13,
							lineHeight: 1.6,
							color: "#1a1a1a",
						}}
					>
						{footerText}
					</p>
				</div>
			)}
		</div>
	);
};

export default EmailPreview;
