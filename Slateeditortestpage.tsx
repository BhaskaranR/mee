import React, { useState } from "react";
import { Card, Col, Row, Button } from "@hrportal/components";
import { SlateEditor } from "../../components/application/communications/SlateEditor";
import { EmailPreview } from "../../components/application/communications/EmailPreview";

// ─── Test variables (mimicking real template variables) ───────────────────────

const TEST_VARIABLES = [
	"{{firstName}}",
	"{{lastName}}",
	"{{fullName}}",
	"{{managerName}}",
	"{{phase_end_date}}",
	"{{activityDate}}",
	"{{programName}}",
	"{{surveyName}}",
	"{{dashboardLink}}",
];

// ─── SlateEditorTestPage ──────────────────────────────────────────────────────

const SlateEditorTestPage: React.FC = () => {
	const [bodyContent, setBodyContent] = useState<string>("");
	const [headerText, setHeaderText] = useState<string>("");
	const [footerText, setFooterText] = useState<string>("");
	const [lineOfBusiness, setLineOfBusiness] = useState<string>("Enterprise Communications");
	const [showPreview, setShowPreview] = useState(false);
	const [isEditable, setIsEditable] = useState(true);

	const handleReset = () => {
		setBodyContent("");
		setHeaderText("");
		setFooterText("");
		setShowPreview(false);
	};

	return (
		<>
			<div className="mb-4">
				<h1 className="mb-1" data-testid="slate-editor-test-title">
					Slate Editor — Test Page
				</h1>
				<p className="text-muted small mb-0">
					Use this page to test the SlateEditor component in isolation.
				</p>
			</div>

			<Row>
				{/* ── Left: Controls + Editor ── */}
				<Col md={showPreview ? 6 : 12}>

					{/* Test controls */}
					<section className="mb-4">
						<Card className="shadow-none">
							<Card.Body>
								<h5 className="mb-3">Test controls</h5>

								<Row>
									{/* Line of business */}
									<Col md={6} className="mb-3 mb-md-0">
										<label className="form-label small fw-semibold">
											Line of business
										</label>
										<input
											type="text"
											className="form-control"
											value={lineOfBusiness}
											onChange={(e) => setLineOfBusiness(e.target.value)}
											placeholder="e.g. Enterprise Communications"
										/>
									</Col>

									{/* Editable toggle */}
									<Col md={3} className="mb-3 mb-md-0 d-flex align-items-end">
										<div className="form-check form-switch">
											<input
												className="form-check-input"
												type="checkbox"
												id="editable-toggle"
												checked={isEditable}
												onChange={(e) => setIsEditable(e.target.checked)}
											/>
											<label className="form-check-label small" htmlFor="editable-toggle">
												Editable
											</label>
										</div>
									</Col>

									{/* Actions */}
									<Col md={3} className="d-flex align-items-end gap-2">
										<Button
											variant="outline-secondary"
											size="sm"
											onClick={handleReset}
										>
											Reset
										</Button>
										<Button
											variant={showPreview ? "secondary" : "outline-primary"}
											size="sm"
											onClick={() => setShowPreview((v) => !v)}
										>
											{showPreview ? "Hide preview" : "Preview"}
										</Button>
									</Col>
								</Row>
							</Card.Body>
						</Card>
					</section>

					{/* Editor */}
					<section className="mb-4">
						<Card className="shadow-none">
							<Card.Body>
								<h5 className="mb-3">Editor</h5>
								<SlateEditor
									getText={() => bodyContent}
									setText={setBodyContent}
									headerText={headerText}
									setHeaderText={setHeaderText}
									footerText={footerText}
									setFooterText={setFooterText}
									variables={TEST_VARIABLES}
									placeholder="Start typing your email body..."
									editable={isEditable}
									height="300px"
								/>
							</Card.Body>
						</Card>
					</section>

					{/* Raw JSON output */}
					<section className="mb-4">
						<Card className="shadow-none">
							<Card.Body>
								<h5 className="mb-2">Raw output (what gets saved)</h5>
								<p className="text-muted small mb-2">
									This is exactly what <code>getText()</code> returns — the JSON stored in the DB.
								</p>

								<div className="mb-3">
									<label className="form-label small fw-semibold text-muted">
										headerText
									</label>
									<input
										type="text"
										className="form-control form-control-sm bg-light"
										value={headerText}
										readOnly
									/>
								</div>

								<div className="mb-3">
									<label className="form-label small fw-semibold text-muted">
										bodyJson (getText())
									</label>
									<textarea
										className="form-control form-control-sm bg-light font-monospace"
										rows={6}
										value={bodyContent}
										readOnly
										style={{ fontSize: 11, resize: "vertical" }}
									/>
								</div>

								<div>
									<label className="form-label small fw-semibold text-muted">
										footerText
									</label>
									<input
										type="text"
										className="form-control form-control-sm bg-light"
										value={footerText}
										readOnly
									/>
								</div>
							</Card.Body>
						</Card>
					</section>
				</Col>

				{/* ── Right: Preview ── */}
				{showPreview && (
					<Col md={6}>
						<section>
							<Card className="shadow-none">
								<Card.Body>
									<h5 className="mb-3">Preview</h5>
									<EmailPreview
										lineOfBusiness={lineOfBusiness}
										headerText={headerText}
										bodyJson={bodyContent}
										footerText={footerText}
									/>
								</Card.Body>
							</Card>
						</section>
					</Col>
				)}
			</Row>
		</>
	);
};

export default SlateEditorTestPage;
