import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type Dispatch,
	type SetStateAction,
} from "react";
import {
	createEditor,
	type Descendant,
	type BaseEditor,
	Editor,
	Element as SlateElement,
	Transforms,
} from "slate";
import {
	Slate,
	Editable,
	withReact,
	useSlate,
	type ReactEditor,
} from "slate-react";
import { withHistory } from "slate-history";

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomElement = {
	type: "paragraph" | "bulleted-list" | "numbered-list" | "list-item" | "link";
	url?: string;
	children: CustomText[];
};

type CustomText = {
	text: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
};

declare module "slate" {
	interface CustomTypes {
		Editor: BaseEditor & ReactEditor;
		Element: CustomElement;
		Text: CustomText;
	}
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type TextEditorProps = {
	// Body
	getText: () => string;
	setText: (text: string) => void;
	// Header (optional — only renders if prop is passed)
	headerText?: string;
	setHeaderText?: (v: string) => void;
	// Footer (optional — only renders if prop is passed)
	footerText?: string;
	setFooterText?: (v: string) => void;
	// Toolbar
	excludedToolbarItems?: string[];
	variables?: string[];
	// Layout
	height?: string;
	placeholder?: string;
	disableLists?: boolean;
	// State sync
	updateTemplate?: boolean;
	firstRender?: boolean;
	setFirstRender?: Dispatch<SetStateAction<boolean>>;
	// Misc
	editable?: boolean;
	onEmptyChange?: (isEmpty: boolean) => void;
	isInvalid?: boolean;
};

// ─── Slate Helpers ────────────────────────────────────────────────────────────

const isMarkActive = (editor: Editor, format: keyof CustomText) => {
	const marks = Editor.marks(editor);
	return marks ? marks[format] === true : false;
};

const toggleMark = (editor: Editor, format: keyof CustomText) => {
	if (isMarkActive(editor, format)) Editor.removeMark(editor, format);
	else Editor.addMark(editor, format, true);
};

const isBlockActive = (editor: Editor, format: CustomElement["type"]) => {
	const { selection } = editor;
	if (!selection) return false;
	const [match] = Array.from(
		Editor.nodes(editor, {
			at: Editor.unhangRange(editor, selection),
			match: (n) =>
				!Editor.isEditor(n) &&
				SlateElement.isElement(n) &&
				(n as CustomElement).type === format,
		}),
	);
	return !!match;
};

const toggleBlock = (editor: Editor, format: CustomElement["type"]) => {
	const isActive = isBlockActive(editor, format);
	const isList = format === "bulleted-list" || format === "numbered-list";
	Transforms.unwrapNodes(editor, {
		match: (n) =>
			!Editor.isEditor(n) &&
			SlateElement.isElement(n) &&
			["bulleted-list", "numbered-list"].includes((n as CustomElement).type),
		split: true,
	});
	Transforms.setNodes(editor, {
		type: isActive ? "paragraph" : isList ? "list-item" : format,
	} as Partial<CustomElement>);
	if (!isActive && isList) {
		Transforms.wrapNodes(editor, { type: format, children: [] } as CustomElement);
	}
};

const withLinks = (editor: Editor) => {
	const { isInline } = editor;
	editor.isInline = (element) =>
		(element as CustomElement).type === "link" ? true : isInline(element);
	return editor;
};

const insertLink = (editor: Editor) => {
	const url = window.prompt("Enter URL:");
	if (!url) return;
	const { selection } = editor;
	const isCollapsed = selection && selection.anchor.path.join() === selection.focus.path.join();
	const link: CustomElement = { type: "link", url, children: isCollapsed ? [{ text: url }] : [] };
	if (isCollapsed) Transforms.insertNodes(editor, link);
	else { Transforms.wrapNodes(editor, link, { split: true }); Transforms.collapse(editor, { edge: "end" }); }
};

const removeLink = (editor: Editor) => {
	Transforms.unwrapNodes(editor, {
		match: (n) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as CustomElement).type === "link",
	});
};

const isLinkActive = (editor: Editor) => {
	const [link] = Array.from(Editor.nodes(editor, {
		match: (n) => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as CustomElement).type === "link",
	}));
	return !!link;
};

// ─── Toolbar Buttons ──────────────────────────────────────────────────────────

const MarkButton: React.FC<{ format: keyof CustomText; icon: string; title: string }> = ({ format, icon, title }) => {
	const editor = useSlate();
	return (
		<button
			type="button"
			className={`btn btn-sm ${isMarkActive(editor, format) ? "btn-secondary" : "btn-outline-secondary"}`}
			onMouseDown={(e) => { e.preventDefault(); toggleMark(editor, format); }}
			title={title}
		>
			<i className={`hlx hlx-${icon}`} aria-hidden="true" />
		</button>
	);
};

const BlockButton: React.FC<{ format: CustomElement["type"]; icon: string; title: string }> = ({ format, icon, title }) => {
	const editor = useSlate();
	return (
		<button
			type="button"
			className={`btn btn-sm ${isBlockActive(editor, format) ? "btn-secondary" : "btn-outline-secondary"}`}
			onMouseDown={(e) => { e.preventDefault(); toggleBlock(editor, format); }}
			title={title}
		>
			<i className={`hlx hlx-${icon}`} aria-hidden="true" />
		</button>
	);
};

// ─── Link Buttons ─────────────────────────────────────────────────────────────

// Icon-only link button
const LinkIconButton: React.FC = () => {
	const editor = useSlate();
	const active = isLinkActive(editor);
	return (
		<button
			type="button"
			className={`btn btn-sm ${active ? "btn-secondary" : "btn-outline-secondary"}`}
			onMouseDown={(e) => {
				e.preventDefault();
				if (active) removeLink(editor);
				else insertLink(editor);
			}}
			title="Insert / remove link"
		>
			<i className="hlx hlx-link" aria-hidden="true" />
		</button>
	);
};

// ─── Insert Button Panel (inline below toolbar) ───────────────────────────────

const isSentenceCase = (text: string) => {
	if (!text) return true;
	return text[0] === text[0].toUpperCase();
};

// Shared open state lifted to context so toolbar button and panel can share it
const ButtonPanelContext = React.createContext<{
	open: boolean;
	setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

const LinkTextButton: React.FC = () => {
	const { open, setOpen } = React.useContext(ButtonPanelContext);
	return (
		<button
			type="button"
			className={`btn btn-sm ${open ? "btn-secondary" : "btn-outline-secondary"}`}
			onMouseDown={(e) => {
				e.preventDefault();
				setOpen(!open);
			}}
			title="Insert button"
		>
			Link
		</button>
	);
};

const InsertButtonPanel: React.FC = () => {
	const editor = useSlate();
	const { open, setOpen } = React.useContext(ButtonPanelContext);
	const [buttonText, setButtonText] = useState("");
	const [url, setUrl] = useState("");
	const [target, setTarget] = useState("none");
	const [submitted, setSubmitted] = useState(false);

	const reset = () => {
		setButtonText("");
		setUrl("");
		setTarget("none");
		setSubmitted(false);
		setOpen(false);
	};

	const handleSave = () => {
		setSubmitted(true);
		if (!buttonText.trim() || !url.trim() || !isSentenceCase(buttonText)) return;

		const link = {
			type: "link",
			url: url.trim(),
			target: target !== "none" ? target : undefined,
			isButton: true,
			children: [{ text: buttonText.trim() }],
		} as any;

		Transforms.insertNodes(editor, link);
		reset();
	};

	if (!open) return null;

	return (
		<div className="border-bottom px-3 py-3 bg-white">
			<h6 className="fw-semibold mb-3">Button info</h6>

			{/* Button text */}
			<div className="mb-3">
				<label className="form-label fw-semibold small mb-1">Button text</label>
				<input
					autoFocus
					type="text"
					className={`form-control${submitted && (!buttonText.trim() || !isSentenceCase(buttonText)) ? " is-invalid" : ""}`}
					value={buttonText}
					onChange={(e) => setButtonText(e.target.value)}
					placeholder=""
				/>
				{submitted && !buttonText.trim() && (
					<div className="invalid-feedback">Button text is required.</div>
				)}
				{submitted && buttonText.trim() && !isSentenceCase(buttonText) && (
					<div className="invalid-feedback">Name must use sentence case.</div>
				)}
				{!submitted && (
					<div className="form-text" style={{ fontSize: 11 }}>Name must use sentence case.</div>
				)}
			</div>

			{/* URL */}
			<div className="mb-3">
				<label className="form-label fw-semibold small mb-1">URL address</label>
				<input
					type="text"
					className={`form-control${submitted && !url.trim() ? " is-invalid" : ""}`}
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					placeholder="http://"
					onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") reset(); }}
				/>
				{submitted && !url.trim() && (
					<div className="invalid-feedback">URL is required.</div>
				)}
			</div>

			{/* Target */}
			<div className="mb-3">
				<label className="form-label fw-semibold small mb-1">Target</label>
				<select
					className="form-select"
					value={target}
					onChange={(e) => setTarget(e.target.value)}
				>
					<option value="none">None</option>
					<option value="_blank">New tab (_blank)</option>
					<option value="_self">Same tab (_self)</option>
				</select>
			</div>

			{/* Actions */}
			<div className="d-flex justify-content-end gap-2">
				<button
					type="button"
					className="btn btn-outline-secondary rounded-pill px-4"
					onMouseDown={(e) => { e.preventDefault(); reset(); }}
				>
					Cancel
				</button>
				<button
					type="button"
					className="btn btn-primary rounded-pill px-4"
					onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
				>
					Save
				</button>
			</div>
		</div>
	);
};

// ─── Variables Dropdown ───────────────────────────────────────────────────────

const VariablesDropdown: React.FC<{ variables: string[] }> = ({ variables }) => {
	const editor = useSlate();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	const insertVariable = (v: string) => { Editor.insertText(editor, v); setOpen(false); };

	if (!variables.length) return null;

	return (
		<div className="position-relative d-inline-block" ref={ref}>
			<button
				type="button"
				className={`btn btn-sm ${open ? "btn-secondary" : "btn-outline-secondary"}`}
				onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
				title="Insert variable"
			>
				<i className="hlx hlx-code me-1" aria-hidden="true" />
				Variables
			</button>
			{open && (
				<div
					className="position-absolute bg-white border rounded shadow-sm"
					style={{ top: "100%", left: 0, zIndex: 1050, minWidth: 230, maxHeight: 260, overflowY: "auto", marginTop: 4 }}
				>
					<div className="list-group list-group-flush">
						{variables.map((v) => (
							<button
								key={v}
								type="button"
								className="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center"
								onMouseDown={(e) => { e.preventDefault(); insertVariable(v); }}
							>
								<span className="small">{v.replace(/[{}]/g, "")}</span>
								<span className="text-muted font-monospace" style={{ fontSize: 11 }}>{v}</span>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

// ─── Renderers ────────────────────────────────────────────────────────────────

const renderElement = (props: any) => {
	const { attributes, children, element } = props;
	switch (element.type) {
		case "bulleted-list": return <ul {...attributes}>{children}</ul>;
		case "numbered-list": return <ol {...attributes}>{children}</ol>;
		case "list-item": return <li {...attributes}>{children}</li>;
		case "link":
			// Button-style link renders as { text } pill
			if (element.isButton) {
				return (
					<a
						{...attributes}
						href={element.url}
						target={element.target}
						style={{
							display: "inline-block",
							border: "1px solid #333",
							borderRadius: 20,
							padding: "4px 14px",
							fontSize: 13,
							color: "#333",
							textDecoration: "none",
							cursor: "default",
						}}
					>
						{"{ "}{children}{" }"}
					</a>
				);
			}
			return <a {...attributes} href={element.url}>{children}</a>;
		default: return <p {...attributes}>{children}</p>;
	}
};

const renderLeaf = (props: any) => {
	const { attributes, leaf } = props;
	let { children } = props;
	if (leaf.bold) children = <strong>{children}</strong>;
	if (leaf.italic) children = <em>{children}</em>;
	if (leaf.underline) children = <u>{children}</u>;
	return <span {...attributes}>{children}</span>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_VALUE: Descendant[] = [{ type: "paragraph", children: [{ text: "" }] }];

function parseValue(raw: string): Descendant[] {
	if (!raw) return EMPTY_VALUE;
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length) return parsed as Descendant[];
	} catch {
		return [{ type: "paragraph", children: [{ text: raw }] }];
	}
	return EMPTY_VALUE;
}

// ─── SlateEditor ─────────────────────────────────────────────────────────────

export const SlateEditor: React.FC<TextEditorProps> = ({
	getText,
	setText,
	headerText,
	setHeaderText,
	footerText,
	setFooterText,
	excludedToolbarItems = [],
	variables = [],
	height,
	placeholder = "",
	disableLists = false,
	updateTemplate,
	firstRender,
	setFirstRender,
	editable: editableProp = true,
	onEmptyChange,
	isInvalid,
}) => {
	const editor = useMemo(() => withLinks(withHistory(withReact(createEditor()))), []);

	const [value, setValue] = useState<Descendant[]>(() =>
		updateTemplate && firstRender ? parseValue(getText()) : EMPTY_VALUE,
	);

	useEffect(() => {
		if (updateTemplate && firstRender) setFirstRender?.(false);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const excluded = new Set(excludedToolbarItems);

	const handleChange = useCallback(
		(newValue: Descendant[]) => {
			setValue(newValue);
			setText(JSON.stringify(newValue));
			if (onEmptyChange) {
				const isEmpty =
					newValue.length === 1 &&
					SlateElement.isElement(newValue[0]) &&
					(newValue[0] as CustomElement).children.length === 1 &&
					(newValue[0] as CustomElement).children[0].text === "";
				onEmptyChange(isEmpty);
			}
		},
		[setText, onEmptyChange],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			switch (e.key) {
				case "b": e.preventDefault(); toggleMark(editor, "bold"); break;
				case "i": e.preventDefault(); toggleMark(editor, "italic"); break;
				case "u": e.preventDefault(); toggleMark(editor, "underline"); break;
				case "z": e.preventDefault(); editor.undo(); break;
				case "y": e.preventDefault(); editor.redo(); break;
			}
		},
		[editor],
	);

	const showHeader = headerText !== undefined || !!setHeaderText;
	const showFooter = footerText !== undefined || !!setFooterText;
	const [buttonPanelOpen, setButtonPanelOpen] = useState(false);

	return (
		<div
			className={`border rounded${isInvalid ? " border-danger" : ""}`}
			style={{ cursor: editableProp ? "text" : "default" }}
		>
			<ButtonPanelContext.Provider value={{ open: buttonPanelOpen, setOpen: setButtonPanelOpen }}>
			<Slate editor={editor} initialValue={value} onChange={handleChange}>

				{/* ── Toolbar — matches screenshot exactly ── */}
				<div
					className="d-flex flex-wrap align-items-center gap-1 p-2 border-bottom bg-light"
					role="toolbar"
					aria-label="Formatting options"
				>
					{/* Bold */}
					<MarkButton format="bold" icon="bold" title="Bold (Ctrl+B)" />

					{/* Italic */}
					<MarkButton format="italic" icon="italic" title="Italic (Ctrl+I)" />

					{/* Underline */}
					<MarkButton format="underline" icon="underline" title="Underline (Ctrl+U)" />

					<span className="vr mx-1" />

					{/* Bullet list */}
					{!disableLists && (
						<BlockButton format="bulleted-list" icon="list" title="Bulleted List" />
					)}

					{/* Numbered list */}
					{!disableLists && (
						<BlockButton format="numbered-list" icon="list-ordered" title="Numbered List" />
					)}

					<span className="vr mx-1" />

					{/* Link — icon only */}
					<LinkIconButton />

					{/* Link — styled as a text button (second to last) */}
					<LinkTextButton />

					<span className="vr mx-1" />

					{/* Variables dropdown — last */}
					{variables.length > 0 && (
						<VariablesDropdown variables={variables} />
					)}
				</div>

				{/* ── Insert Button Panel (inline, opens below toolbar) ── */}
				<InsertButtonPanel />

				{/* ── Canvas ── */}
				<div className="p-3">

					{/* Header */}
					{showHeader && (
						<div className="mb-3">
							{/* "Header" label is a locked UI guide — not saved or shown in preview */}
							<div
								className="d-flex align-items-center gap-2 mb-1"
								style={{ userSelect: "none", pointerEvents: "none" }}
							>
								<span className="small fw-semibold text-muted">Header</span>
								<i className="hlx hlx-lock text-muted" aria-hidden="true" style={{ fontSize: 11 }} />
							</div>
							<input
								type="text"
								className="form-control"
								value={headerText ?? ""}
								onChange={(e) => setHeaderText?.(e.target.value)}
								readOnly={!editableProp || !setHeaderText}
								placeholder="Enter header text..."
							/>
						</div>
					)}

					{/* Body */}
					<div
						className={`border rounded p-2${!editableProp ? " bg-light" : ""}`}
						style={{ minHeight: height ?? 120, height, overflowY: "auto" }}
					>
						<Editable
							readOnly={!editableProp}
							renderElement={renderElement}
							renderLeaf={renderLeaf}
							placeholder={placeholder}
							onKeyDown={handleKeyDown}
							style={{ minHeight: height ?? 100, outline: "none" }}
						/>
					</div>

					{/* Footer */}
					{showFooter && (
						<div className="mt-3">
							{/* "Footer" label is a locked UI guide — not saved or shown in preview */}
							<div
								className="d-flex align-items-center gap-2 mb-1"
								style={{ userSelect: "none", pointerEvents: "none" }}
							>
								<span className="small fw-semibold text-muted">Footer</span>
								<i className="hlx hlx-lock text-muted" aria-hidden="true" style={{ fontSize: 11 }} />
							</div>
							<input
								type="text"
								className="form-control"
								value={footerText ?? ""}
								onChange={(e) => setFooterText?.(e.target.value)}
								readOnly={!editableProp || !setFooterText}
								placeholder="Enter footer text..."
							/>
						</div>
					)}

				</div>
			</Slate>
			</ButtonPanelContext.Provider>
		</div>
	);
};

export default SlateEditor;
