import React from "react";
import { Card, Col, Row } from "@hrportal/components";
import { Text, type Descendant } from "slate";
import { decodeEmailHtml } from "./slateToHtml";
import { htmlToSlate } from "./htmlToSlate";

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
	lineOfBusiness?: string;
	htmlBody: string;   // single encoded string from SlateEditor getText()
};

// ─── Slate JSON → React ───────────────────────────────────────────────────────

function renderLeaf(leaf: CustomText, key: number): React.ReactNode {
	let content: React.ReactNode = leaf.text;
	if (leaf.bold) content = <strong>{content}</strong>;
	if (leaf.italic) content = <em>{content}</em>;
	if (leaf.underline) content = <u>{content}</u>;
	return <React.Fragment key={key}>{content}</React.Fragment>;
}

function renderNode(node: Descendant, index: number): React.ReactNode {
	if (Text.isText(node)) {
		return renderLeaf(node as CustomText, index);
	}

	const el = node as CustomElement;
	const children = el.children.map((child, i) =>
		renderNode(child as unknown as Descendant, i),
	);

	switch (el.type) {
		case "bulleted-list":
			return <ul key={index} className="mb-2 ps-3">{children}</ul>;
		case "numbered-list":
			return <ol key={index} className="mb-2 ps-3">{children}</ol>;
		case "list-item":
			return <li key={index} className="mb-1">{children}</li>;
		case "link":
			if (el.isButton) {
				return (
					<div key={index} className="my-3">
						<a
							href={el.url}
							target={el.target}
							rel="noreferrer"
							className="btn btn-dark rounded-pill px-4 py-2 text-decoration-none"
							style={{ fontSize: 14 }}
						>
							{children}
						</a>
					</div>
				);
			}
			return (
				<a key={index} href={el.url} target={el.target} rel="noreferrer">
					{children}
				</a>
			);
		case "paragraph":
		default:
			return (
				<p key={index} className="mb-3">
					{children}
				</p>
			);
	}
}

// ─── EmailPreview ─────────────────────────────────────────────────────────────

export const EmailPreview: React.FC<EmailPreviewProps> = ({
	lineOfBusiness,
	htmlBody,
}) => {
	const { headerText, bodyHtml, footerText } = decodeEmailHtml(htmlBody);
	const nodes = htmlToSlate(bodyHtml);

	return (
		<section>
			<Card className="shadow-none">
				<Card.Body className="p-0">

					{/* ── BofA logo bar ── */}
					<div className="d-flex justify-content-end align-items-center px-4 py-3 border-bottom">
						<span
							className="fw-bold text-danger"
							style={{ fontSize: 13, letterSpacing: "0.08em" }}
						>
							BANK OF AMERICA
						</span>
					</div>

					{/* ── Main content ── */}
					<div className="px-4 py-4">
						<Row>
							<Col>
								{/* Line of business */}
								{lineOfBusiness && (
									<p className="fw-bold small mb-3">
										{lineOfBusiness}
									</p>
								)}

								{/* Header */}
								{headerText && (
									<h2 className="fw-bold mb-4">
										{headerText}
									</h2>
								)}

								{/* Body */}
								<div className="mb-2">
									{nodes.map((node, i) => renderNode(node, i))}
								</div>
							</Col>
						</Row>
					</div>

					{/* ── Footer ── */}
					{footerText && (
						<div className="px-4 py-3 border-top">
							<p className="fw-bold small mb-0">
								{footerText}
							</p>
						</div>
					)}

				</Card.Body>
			</Card>
		</section>
	);
};

export default EmailPreview;
