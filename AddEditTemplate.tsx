import { zodResolver } from "@hookform/resolvers/zod";
import { Card, Col, Form, Row, Button } from "@hrportal/components";
import React, { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "../../components/common/form/form";
import { SubmitButton } from "../../components/form-controls/SubmitButton";
import { Loader } from "../../components/reusable/Loader";
import { useToastContext } from "../../contexts/ToastContext";
import { useBreadcrumbContext } from "../../contexts/BreadcrumbContext";
import { makeRequest } from "../../utils/api";
import DynamicBreadcrumbs from "../../components/layout/DynamicBreadcrumbs";
import { SlateEditor } from "../../components/application/communications/SlateEditor";
import { EmailPreview } from "../../components/application/communications/EmailPreview";
import { TEmailTemplate } from "../../types/program";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TMailbox {
	mailboxId: string;
	mailboxName: string;
}

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const ZTemplateCreate = z.object({
	title:        z.string().min(1, "Template title is required"),
	active:       z.boolean().default(true),
	from:         z.string().min(1, "From is required"),
	to:           z.string().min(1, "To is required"),
	cc:           z.string().optional(),
	bcc:          z.string().optional(),
	subject:      z.string().min(1, "Subject is required"),
	htmlBody:     z.string().min(1, "Email body is required"),
});

const ZTemplateUpdate = ZTemplateCreate.extend({
	templateId: z.string(),
});

type TTemplateCreate = z.infer<typeof ZTemplateCreate>;
type TTemplateUpdate = z.infer<typeof ZTemplateUpdate>;

// ─── Component ────────────────────────────────────────────────────────────────

const AddEditCommunicationTemplate: React.FC = () => {
	const { programId, templateId } = useParams<{
		programId: string;
		templateId?: string;
	}>();
	const navigate = useNavigate();
	const { addToast } = useToastContext();
	const { setBreadcrumbs } = useBreadcrumbContext();

	const isEditMode = !!templateId;

	const [isLoading,    setIsLoading]    = useState(isEditMode);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [mailboxes,    setMailboxes]    = useState<TMailbox[]>([]);
	const [variables,    setVariables]    = useState<string[]>([]);
	const [showPreview,  setShowPreview]  = useState(false);

	// firstRender controls whether SlateEditor decodes the saved htmlBody on mount
	const [firstRender, setFirstRender] = useState(isEditMode);

	// ── Form setup ──────────────────────────────────────────────────────────────
	const form = useForm<TTemplateCreate | TTemplateUpdate>({
		resolver: zodResolver(isEditMode ? ZTemplateUpdate : ZTemplateCreate),
		defaultValues: {
			title:    "",
			active:   true,
			from:     "",
			to:       "",
			cc:       "",
			bcc:      "",
			subject:  "",
			htmlBody: "",
		},
	});

	const {
		setValue,
		watch,
		formState: { errors },
	} = form;

	// Watch htmlBody so EmailPreview stays live as user types
	const htmlBody = watch("htmlBody");

	// ── Load mailboxes + variables ──────────────────────────────────────────────
	useEffect(() => {
		const fetchMeta = async () => {
			const [mailboxRes, variableRes] = await Promise.all([
				makeRequest(`/api/programs/${programId}/mailboxes`),
				makeRequest(`/api/programs/${programId}/variables`),
			]);
			if (mailboxRes.ok) setMailboxes(mailboxRes.data);
			if (variableRes.ok) setVariables(variableRes.data);
		};
		fetchMeta();
	}, [programId]);

	// ── Load existing template (edit mode) ─────────────────────────────────────
	useEffect(() => {
		if (!isEditMode) return;

		const fetchTemplate = async () => {
			const result = await makeRequest(`/api/programs/${programId}/templates/${templateId}`);
			if (!result.ok) {
				addToast({ type: "danger", message: result.error.message });
				navigate(`/programs/${programId}/communications`);
				return;
			}

			const t: TEmailTemplate = result.data;

			// Populate all form fields from the saved template
			// htmlBody is the single encoded string — SlateEditor will
			// decode it into header/body/footer internally on first render
			form.reset({
				...(isEditMode ? { templateId: t.templateId } : {}),
				title:    t.title,
				active:   t.active,
				from:     t.from,
				to:       t.to,
				cc:       t.cc ?? "",
				bcc:      t.bcc ?? "",
				subject:  t.subject,
				htmlBody: t.htmlBody,   // ← single encoded string from DB
			});

			setBreadcrumbs([
				{ label: "Communications", href: `/programs/${programId}/communications` },
				{ label: t.title },
			]);

			setIsLoading(false);
		};

		fetchTemplate();
	}, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Submit ──────────────────────────────────────────────────────────────────
	const handleSubmit = async (data: TTemplateCreate | TTemplateUpdate) => {
		setIsSubmitting(true);
		try {
			const url = isEditMode
				? `/api/programs/${programId}/templates/${templateId}`
				: `/api/programs/${programId}/templates`;

			const result = await makeRequest(url, {
				method: isEditMode ? "PUT" : "POST",
				body: data,   // htmlBody is already the encoded string — backend stores it as-is
			});

			if (!result.ok) {
				addToast({ type: "danger", message: result.error.message });
				return;
			}

			addToast({
				type: "success",
				message: isEditMode
					? "Template updated successfully"
					: "Template created successfully",
			});

			navigate(`/programs/${programId}/communications`);
		} finally {
			setIsSubmitting(false);
		}
	};

	// ── Cancel ──────────────────────────────────────────────────────────────────
	const handleCancel = () => {
		navigate(`/programs/${programId}/communications`);
	};

	// ── Loading state ───────────────────────────────────────────────────────────
	if (isLoading) return <Loader />;

	// ── Render ──────────────────────────────────────────────────────────────────
	return (
		<>
			<DynamicBreadcrumbs />

			<h1 className="mb-4" data-testid="add-edit-template-title">
				{isEditMode ? "Edit template" : "Add template"}
			</h1>

			<FormProvider {...form}>
				<form onSubmit={form.handleSubmit(handleSubmit)} noValidate>

					{/* ── Template Info ── */}
					<section className="mb-4">
						<Card className="shadow-none">
							<Card.Body>
								<h5 className="mb-3">Template info</h5>
								<Row>
									{/* Template ID */}
									{isEditMode && (
										<Col md={3} className="mb-3 mb-md-0">
											<FormItem id="template-id">
												<FormLabel>Template ID</FormLabel>
												<FormControl
													type="text"
													value={(form.watch("templateId" as any)) ?? "Auto-generated"}
													readOnly
													disabled
													data-testid="template-id-input"
												/>
												<Form.Text>Template ID is auto generated</Form.Text>
											</FormItem>
										</Col>
									)}

									{/* Title */}
									<Col md={isEditMode ? 9 : 12}>
										<FormField
											control={form.control}
											name="title"
											render={({ field }) => (
												<FormItem id="title">
													<FormLabel>Template title *</FormLabel>
													<FormControl
														{...field}
														type="text"
														isInvalid={!!errors.title}
														data-testid="title-input"
														placeholder=""
													/>
													<FormMessage />
												</FormItem>
											)}
										/>
									</Col>
								</Row>
							</Card.Body>
						</Card>
					</section>

					{/* ── Email Details ── */}
					<section className="mb-4">
						<Card className="shadow-none">
							<Card.Body>
								<div className="d-flex align-items-center justify-content-between mb-3">
									<h5 className="mb-0">Email communications</h5>
									<div className="d-flex align-items-center gap-3">
										{/* Active toggle */}
										<FormField
											control={form.control}
											name="active"
											render={({ field }) => (
												<Form.Check
													type="switch"
													id="active-toggle"
													label="Active"
													checked={field.value as boolean}
													onChange={field.onChange}
												/>
											)}
										/>
										{/* Preview toggle */}
										<Button
											type="button"
											variant={showPreview ? "secondary" : "outline-secondary"}
											size="sm"
											onClick={() => setShowPreview((v) => !v)}
										>
											{showPreview ? "Hide preview" : "Preview"}
										</Button>
									</div>
								</div>

								<Row>
									{/* From */}
									<Col md={6} className="mb-3">
										<FormField
											control={form.control}
											name="from"
											render={({ field }) => (
												<FormItem id="from">
													<FormLabel>From *</FormLabel>
													<Form.Select
														{...field}
														isInvalid={!!errors.from}
														data-testid="from-select"
													>
														<option value="">Select mailbox</option>
														{mailboxes.map((m) => (
															<option key={m.mailboxId} value={m.mailboxId}>
																{m.mailboxName}
															</option>
														))}
													</Form.Select>
													<FormMessage />
												</FormItem>
											)}
										/>
									</Col>

									{/* To */}
									<Col md={6} className="mb-3">
										<FormField
											control={form.control}
											name="to"
											render={({ field }) => (
												<FormItem id="to">
													<FormLabel>To *</FormLabel>
													<FormControl
														{...field}
														type="text"
														isInvalid={!!errors.to}
														data-testid="to-input"
													/>
													<FormMessage />
												</FormItem>
											)}
										/>
									</Col>

									{/* CC */}
									<Col md={6} className="mb-3">
										<FormField
											control={form.control}
											name="cc"
											render={({ field }) => (
												<FormItem id="cc">
													<FormLabel>CC</FormLabel>
													<FormControl
														{...field}
														type="text"
														data-testid="cc-input"
													/>
												</FormItem>
											)}
										/>
									</Col>

									{/* BCC */}
									<Col md={6} className="mb-3">
										<FormField
											control={form.control}
											name="bcc"
											render={({ field }) => (
												<FormItem id="bcc">
													<FormLabel>BCC</FormLabel>
													<FormControl
														{...field}
														type="text"
														data-testid="bcc-input"
													/>
												</FormItem>
											)}
										/>
									</Col>

									{/* Subject */}
									<Col md={12} className="mb-3">
										<FormField
											control={form.control}
											name="subject"
											render={({ field }) => (
												<FormItem id="subject">
													<FormLabel>Subject *</FormLabel>
													<FormControl
														{...field}
														type="text"
														isInvalid={!!errors.subject}
														data-testid="subject-input"
													/>
													<FormMessage />
												</FormItem>
											)}
										/>
									</Col>
								</Row>
							</Card.Body>
						</Card>
					</section>

					{/* ── Email Body (editor + optional preview side by side) ── */}
					<section className="mb-4">
						<Row>
							{/* Editor */}
							<Col md={showPreview ? 6 : 12}>
								<Card className="shadow-none">
									<Card.Body>
										<h5 className="mb-3">Email content</h5>

										{/*
										 * SlateEditor manages header/body/footer internally.
										 * getText() → returns single encoded HTML string
										 * setText()  → RHF setValue keeps "htmlBody" in sync
										 *              every time user types, changes header/footer,
										 *              or inserts a variable/button
										 *
										 * On mount (edit mode):
										 *   updateTemplate=true + firstRender=true
										 *   → editor decodes htmlBody from defaultValues
										 *   → populates header input, Slate body, footer input
										 */}
										<SlateEditor
											getText={() => htmlBody}
											setText={(html) =>
												setValue("htmlBody", html, {
													shouldDirty:    true,
													shouldValidate: true,
													shouldTouch:    true,
												})
											}
											variables={variables}
											updateTemplate={isEditMode}
											firstRender={firstRender}
											setFirstRender={setFirstRender}
											isInvalid={!!errors.htmlBody}
											placeholder="Start typing your email body..."
											height="300px"
										/>

										{/* Validation message for the body field */}
										{errors.htmlBody && (
											<div className="text-danger small mt-1">
												{errors.htmlBody.message}
											</div>
										)}
									</Card.Body>
								</Card>
							</Col>

							{/* Live preview */}
							{showPreview && (
								<Col md={6}>
									<Card className="shadow-none">
										<Card.Body>
											<h5 className="mb-3">Preview</h5>
											{/*
											 * EmailPreview decodes the same htmlBody string
											 * and renders header / body / footer visually.
											 * Updates live as the user types.
											 */}
											<EmailPreview
												lineOfBusiness="Enterprise Communications"
												htmlBody={htmlBody}
											/>
										</Card.Body>
									</Card>
								</Col>
							)}
						</Row>
					</section>

					{/* ── Actions ── */}
					<div className="d-flex justify-content-end gap-2 mb-5">
						<button
							type="button"
							className="btn btn-outline-secondary"
							onClick={handleCancel}
							disabled={isSubmitting}
						>
							Cancel
						</button>
						<SubmitButton
							isSubmitting={isSubmitting}
							label="Save"
							data-testid="save-template-btn"
						/>
					</div>

				</form>
			</FormProvider>
		</>
	);
};

export default AddEditCommunicationTemplate;
