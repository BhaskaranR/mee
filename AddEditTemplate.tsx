import { zodResolver } from '@hookform/resolvers/zod';
import { Card, Col, Form, Row, Button } from '@hrportal/components';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../components/common/form/form';
import { SubmitButton } from '../../components/form-controls/SubmitButton';
import { Loader } from '../../components/reusable/Loader';
import { useToastContext } from '../../contexts/ToastContext';
import { useBreadcrumbContext } from '../../contexts/BreadcrumbContext';
import { useAuth } from '../../hooks/useAuth';
import { useProgramStore } from '../../store/useProgramStore';
import { makeRequest } from '../../utils/api';
import DynamicBreadcrumbs from '../../components/layout/DynamicBreadcrumbs';
import { z } from 'zod';
import {
  ZEmailTemplate,
  TEmailTemplate,
} from '../../types/program';
import { createEditor, Descendant, BaseEditor } from 'slate';
import { Slate, Editable, withReact, ReactEditor, useSlate } from 'slate-react';
import { withHistory } from 'slate-history';
import { Editor, Transforms, Element as SlateElement, Text } from 'slate';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TMailbox {
  mailboxId: string;
  mailboxName: string;
}

// ─── Slate Custom Types ─────────────────────────────────────────────────────

type CustomElement = {
  type: 'paragraph' | 'heading-one' | 'heading-two' | 'bulleted-list' | 'numbered-list' | 'list-item' | 'link';
  url?: string;
  children: CustomText[];
};

type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

// ─── Slate Toolbar Helpers ──────────────────────────────────────────────────

const isMarkActive = (editor: Editor, format: string) => {
  const marks = Editor.marks(editor);
  return marks ? (marks as Record<string, boolean>)[format] === true : false;
};

const toggleMark = (editor: Editor, format: string) => {
  const isActive = isMarkActive(editor, format);
  if (isActive) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
};

const isBlockActive = (editor: Editor, format: string) => {
  const { selection } = editor;
  if (!selection) return false;

  const [match] = Array.from(
    Editor.nodes(editor, {
      at: Editor.unhangRange(editor, selection),
      match: (n) =>
        !Editor.isEditor(n) &&
        SlateElement.isElement(n) &&
        (n as CustomElement).type === format,
    })
  );
  return !!match;
};

const toggleBlock = (editor: Editor, format: string) => {
  const isActive = isBlockActive(editor, format);
  const isList = format === 'bulleted-list' || format === 'numbered-list';

  Transforms.unwrapNodes(editor, {
    match: (n) =>
      !Editor.isEditor(n) &&
      SlateElement.isElement(n) &&
      ['bulleted-list', 'numbered-list'].includes((n as CustomElement).type),
    split: true,
  });

  Transforms.setNodes(editor, {
    type: isActive ? 'paragraph' : isList ? 'list-item' : (format as CustomElement['type']),
  });

  if (!isActive && isList) {
    const block = { type: format as CustomElement['type'], children: [] };
    Transforms.wrapNodes(editor, block);
  }
};

// ─── Toolbar Button Components ──────────────────────────────────────────────

const MarkButton: React.FC<{ format: string; icon: string }> = ({ format, icon }) => {
  const editor = useSlate();
  return (
    <button
      type="button"
      className={`btn btn-sm ${isMarkActive(editor, format) ? 'btn-secondary' : 'btn-outline-secondary'}`}
      onMouseDown={(e) => {
        e.preventDefault();
        toggleMark(editor, format);
      }}
      title={format.charAt(0).toUpperCase() + format.slice(1)}
    >
      <i className={`hlx hlx-${icon}`} aria-hidden="true" />
    </button>
  );
};

const BlockButton: React.FC<{ format: string; icon: string }> = ({ format, icon }) => {
  const editor = useSlate();
  return (
    <button
      type="button"
      className={`btn btn-sm ${isBlockActive(editor, format) ? 'btn-secondary' : 'btn-outline-secondary'}`}
      onMouseDown={(e) => {
        e.preventDefault();
        toggleBlock(editor, format);
      }}
      title={format}
    >
      <i className={`hlx hlx-${icon}`} aria-hidden="true" />
    </button>
  );
};

// ─── Slate Renderers ────────────────────────────────────────────────────────

const renderElement = (props: any) => {
  const { attributes, children, element } = props;
  switch (element.type) {
    case 'heading-one':
      return <h1 {...attributes}>{children}</h1>;
    case 'heading-two':
      return <h2 {...attributes}>{children}</h2>;
    case 'bulleted-list':
      return <ul {...attributes}>{children}</ul>;
    case 'numbered-list':
      return <ol {...attributes}>{children}</ol>;
    case 'list-item':
      return <li {...attributes}>{children}</li>;
    case 'link':
      return (
        <a {...attributes} href={element.url}>
          {children}
        </a>
      );
    default:
      return <p {...attributes}>{children}</p>;
  }
};

const renderLeaf = (props: any) => {
  const { attributes, children, leaf } = props;
  let formattedChildren = children;
  if (leaf.bold) {
    formattedChildren = <strong>{formattedChildren}</strong>;
  }
  if (leaf.italic) {
    formattedChildren = <em>{formattedChildren}</em>;
  }
  if (leaf.underline) {
    formattedChildren = <u>{formattedChildren}</u>;
  }
  return <span {...attributes}>{formattedChildren}</span>;
};

// ─── Default Editor Content ─────────────────────────────────────────────────

const initialEditorValue: Descendant[] = [
  {
    type: 'paragraph',
    children: [{ text: '' }],
  },
];

// ─── Template Variables ─────────────────────────────────────────────────────

interface TVariable {
  label: string;
  value: string;
}

// Static fallback list — replace with API response when ready
const DEFAULT_TEMPLATE_VARIABLES: TVariable[] = [
  { label: 'First Name', value: '{{firstName}}' },
  { label: 'Last Name', value: '{{lastName}}' },
  { label: 'Full Name', value: '{{fullName}}' },
  { label: 'Email', value: '{{email}}' },
  { label: 'Manager Name', value: '{{managerName}}' },
  { label: 'Manager Email', value: '{{managerEmail}}' },
  { label: 'Phase End Date', value: '{{phaseEndDate}}' },
  { label: 'Activity Date', value: '{{activityDate}}' },
  { label: 'Program Name', value: '{{programName}}' },
  { label: 'Survey Name', value: '{{surveyName}}' },
  { label: 'Dashboard Link', value: '{{dashboardLink}}' },
  { label: 'Company Name', value: '{{companyName}}' },
];

// ─── Variable Dropdown Button ───────────────────────────────────────────────

const VariableDropdown: React.FC<{ variables?: TVariable[] }> = ({
  variables = DEFAULT_TEMPLATE_VARIABLES,
}) => {
  const editor = useSlate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const insertVariable = (variable: string) => {
    // Re-focus editor and insert at last known selection
    ReactEditor.focus(editor);

    Transforms.insertText(editor, variable);
    setIsOpen(false);
  };

  return (
    <div className="position-relative d-inline-block" ref={dropdownRef}>
      <button
        type="button"
        className={`btn btn-sm ${isOpen ? 'btn-secondary' : 'btn-outline-secondary'}`}
        title="Insert variable"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }}
      >
        <i className="hlx hlx-code mr-1" aria-hidden="true" />
        Variables
      </button>

      {isOpen && (
        <div
          className="position-absolute bg-white border rounded shadow-sm"
          style={{
            top: '100%',
            left: 0,
            zIndex: 1000,
            minWidth: '220px',
            maxHeight: '250px',
            overflowY: 'auto',
            marginTop: '4px',
          }}
        >
          <div className="list-group list-group-flush">
            {variables.map((variable) => (
              <button
                key={variable.value}
                type="button"
                className="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertVariable(variable.value);
                }}
              >
                <span>{variable.label}</span>
                <small className="text-muted font-monospace">
                  {variable.value}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Roles Interface ────────────────────────────────────────────────────────

interface Roles {
  programs?: string[];
  userRoles?: string[];
  leadershipHierarchies?: string[];
}

// ─── Main Component ─────────────────────────────────────────────────────────

const AddEditTemplate: React.FC = () => {
  const { programId, templateId } = useParams<{
    programId: string;
    templateId?: string;
  }>();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [mailboxes, setMailboxes] = useState<TMailbox[]>([]);
  const [template, setTemplate] = useState<TEmailTemplate | null>(null);
  const [editorValue, setEditorValue] = useState<Descendant[]>(initialEditorValue);
  const [templateVariables, setTemplateVariables] = useState<TVariable[]>(DEFAULT_TEMPLATE_VARIABLES);

  const { setBreadcrumbs } = useBreadcrumbContext();
  const { addToast } = useToastContext();
  const auth = useAuth() as { roles: Roles };
  const { program, setProgram } = useProgramStore();

  const hasTemplate = !!templateId;

  const editor = useMemo(() => withHistory(withReact(createEditor())), []);

  const form = useForm<TEmailTemplate>({
    resolver: zodResolver(ZEmailTemplate as any),
    mode: 'onSubmit',
    defaultValues: {
      templateID: 0,
      program: null,
      cycle: null,
      templateKey: null,
      templateName: null,
      category: null,
      subject: null,
      body: null,
      from: null,
      to: null,
      cc: null,
      active: true,
    },
  });

  // Set breadcrumbs
  useEffect(() => {
    setBreadcrumbs([
      { label: 'Administration', path: '/administration' },
      { label: 'Communications', path: '/administration/communications' },
      {
        label: hasTemplate ? 'Edit template' : 'Add template',
        path: '',
      },
    ]);
  }, [hasTemplate]);

  // Fetch template data if editing
  useEffect(() => {
    if (templateId && programId) {
      const fetchTemplate = async () => {
        const result = await makeRequest<TEmailTemplate>({
          endpoint: `/program/${programId}/communications/templates/${templateId}`,
          method: 'GET',
        });
        if (result.ok) {
          setTemplate(result.data);
          form.reset({
            templateID: result.data.templateID,
            program: result.data.program,
            cycle: result.data.cycle,
            templateKey: result.data.templateKey,
            templateName: result.data.templateName,
            category: result.data.category,
            subject: result.data.subject,
            body: result.data.body,
            from: result.data.from,
            to: result.data.to,
            cc: result.data.cc || null,
            active: result.data.active,
          });
          // If body contains Slate JSON, parse it into editor
          if (result.data.body) {
            try {
              const parsed = JSON.parse(result.data.body);
              setEditorValue(parsed);
            } catch {
              // If body is plain HTML/text, wrap in paragraph
              setEditorValue([
                { type: 'paragraph', children: [{ text: result.data.body }] },
              ]);
            }
          }
        } else {
          addToast(result.error.message, 'Error Occurred', 'danger');
        }
        setIsLoading(false);
      };
      fetchTemplate();
    } else {
      setIsLoading(false);
    }
  }, [templateId, programId]);

  // Fetch mailboxes for From dropdown
  useEffect(() => {
    const fetchMailboxes = async () => {
      const result = await makeRequest<TMailbox[]>({
        endpoint: '/program/get-all-mailboxes',
        method: 'GET',
      });
      if (result.ok) {
        setMailboxes(result.data);
      } else {
        addToast(result.error.message, 'Error Occurred', 'danger');
      }
    };
    fetchMailboxes();
  }, []);

  // TODO: Uncomment when API is ready to fetch variables dynamically
  // useEffect(() => {
  //   const fetchVariables = async () => {
  //     const result = await makeRequest<TVariable[]>({
  //       endpoint: '/program/get-template-variables',
  //       method: 'GET',
  //     });
  //     if (result.ok) {
  //       setTemplateVariables(result.data);
  //     }
  //   };
  //   fetchVariables();
  // }, []);

  // Handle form submit
  const handleSubmit = async (data: TEmailTemplate) => {
    setIsSubmitting(true);

    const payload = {
      ...data,
      body: JSON.stringify(editorValue),
    };

    const endpoint = hasTemplate
      ? `/program/${programId}/communications/templates/${templateId}`
      : `/program/${programId}/communications/templates`;

    const method = hasTemplate ? 'PUT' : 'POST';

    const result = await makeRequest({
      endpoint,
      method,
      body: payload,
    });

    if (result.ok) {
      addToast(
        `Template ${hasTemplate ? 'updated' : 'created'} successfully`,
        'Success',
        'success'
      );
      navigate(`/administration/communications`);
    } else {
      addToast(result.error.message, 'Error Occurred', 'danger');
    }
    setIsSubmitting(false);
  };

  // Handle preview
  const handlePreview = () => {
    // Open preview modal or navigate to preview route
    const formValues = form.getValues();
    // TODO: Implement preview logic
    console.log('Preview:', { ...formValues, bodyContent: editorValue });
  };

  // Handle export PDF
  const handleExportPDF = () => {
    // TODO: Implement PDF export logic
    console.log('Export PDF');
  };

  // Handle cancel
  const handleCancel = () => {
    navigate(`/administration/communications`);
  };

  if (isLoading) {
    return <Loader />;
  }

  return (
    <>
      <DynamicBreadcrumbs />
      <h1 className="mb-4" data-testid="add-edit-template-title">
        {hasTemplate ? template?.templateName || 'Edit template' : 'Add template'}
      </h1>

      <section className="mb-4">
        <Card className="shadow-none">
          <Card.Body>
            <FormProvider {...form}>
              <Form onSubmit={form.handleSubmit(handleSubmit)} noValidate>
                {/* ── Template Info ────────────────────────────── */}
                <Form.Group>
                  <Row>
                    {/* Template ID */}
                    <Col md={3} className="mb-3 mb-md-0">
                      <FormItem id="template-id">
                        <FormLabel style={{ color: 'inherit' }}>
                          Template ID
                        </FormLabel>
                        <FormControl
                          type="text"
                          value={template?.templateID || 'Auto-generated'}
                          readOnly
                          disabled
                          data-testid="template-id-input"
                        />
                        <Form.Text id="template-id-help-text">
                          Template ID is auto generated
                        </Form.Text>
                      </FormItem>
                    </Col>

                    {/* Template Name */}
                    <Col md={9} className="mb-3 mb-md-0">
                      <FormField
                        name="templateName"
                        control={form.control}
                        render={({ field, formState }) => (
                          <FormItem id="template-name">
                            <FormLabel style={{ color: 'inherit' }}>
                              Title *
                            </FormLabel>
                            <FormControl
                              {...field}
                              value={field.value ?? ''}
                              placeholder="Add title"
                              type="text"
                              aria-describedby="template-name-help-text"
                              aria-errormessage="template-name-form-item-message"
                              aria-invalid={!!formState.errors.templateName}
                            />
                            {!formState.errors.templateName && (
                              <Form.Text id="template-name-help-text">
                                Template title is required
                              </Form.Text>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Col>
                  </Row>
                </Form.Group>

                {/* ── Email Communications Header ─────────────── */}
                <Form.Group>
                  <Row className="mt-4 mb-3">
                    <Col md={6}>
                      <h5 className="mb-0">Email communications</h5>
                    </Col>
                    <Col md={6} className="d-flex align-items-center justify-content-end">
                      {/* Active Toggle */}
                      <FormField
                        name="active"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem id="template-status">
                            <FormLabel style={{ color: 'inherit' }}>
                              Active
                            </FormLabel>
                            <div className="d-flex align-items-center mt-md-1">
                              <span className="mr-2">
                                {field.value ? 'Active' : 'Inactive'}
                              </span>
                              <Form.Check
                                as="input"
                                type="switch"
                                checked={field.value as boolean}
                                onChange={(e) =>
                                  field.onChange(
                                    (e.target as HTMLInputElement).checked
                                  )
                                }
                                id="toggleTemplateStatus"
                                aria-label={
                                  field.value
                                    ? 'turn off to set template status inactive'
                                    : 'turn on to set template status active'
                                }
                                aria-describedby="templateActiveStatus"
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Preview Button */}
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm ml-3"
                        onClick={handlePreview}
                      >
                        <i
                          className="hlx hlx-search mr-1"
                          aria-hidden="true"
                        />
                        Preview
                      </button>

                      {/* Export PDF Button */}
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm ml-2"
                        onClick={handleExportPDF}
                      >
                        <i
                          className="hlx hlx-download mr-1"
                          aria-hidden="true"
                        />
                        Export PDF
                      </button>
                    </Col>
                  </Row>
                </Form.Group>

                {/* ── Email Fields ─────────────────────────────── */}
                <Form.Group>
                  {/* From */}
                  <Row className="mb-3">
                    <Col md={12}>
                      <FormField
                        name="from"
                        control={form.control}
                        render={({ field, formState }) => (
                          <FormItem id="template-from">
                            <FormLabel style={{ color: 'inherit' }}>
                              From*
                            </FormLabel>
                            <FormControl
                              as="select"
                              {...field}
                              value={field.value ?? ''}
                              aria-describedby="template-from-help-text"
                              aria-errormessage="template-from-form-item-message"
                              aria-invalid={formState.errors.from}
                              data-testid="from-input"
                            >
                              <option value="">Choose mailbox</option>
                              {mailboxes.map((mailbox) => (
                                <option
                                  key={mailbox.mailboxId}
                                  value={mailbox.mailboxId}
                                >
                                  {mailbox.mailboxName}
                                </option>
                              ))}
                            </FormControl>
                            {!formState.errors.from && (
                              <Form.Text id="template-from-help-text">
                                Choose a pre-defined mailbox
                              </Form.Text>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Col>
                  </Row>

                  {/* To */}
                  <Row className="mb-3">
                    <Col md={12}>
                      <FormField
                        name="to"
                        control={form.control}
                        render={({ field, formState }) => (
                          <FormItem id="template-to">
                            <FormLabel style={{ color: 'inherit' }}>
                              To*
                            </FormLabel>
                            <FormControl
                              {...field}
                              value={field.value ?? ''}
                              placeholder="Add recipients"
                              type="text"
                              aria-describedby="template-to-help-text"
                              aria-errormessage="template-to-form-item-message"
                              aria-invalid={formState.errors.to}
                              data-testid="to-input"
                            />
                            {!formState.errors.to && (
                              <Form.Text id="template-to-help-text">
                                Add recipient groups
                              </Form.Text>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Col>
                  </Row>

                  {/* CC */}
                  <Row className="mb-3">
                    <Col md={12}>
                      <FormField
                        name="cc"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem id="template-cc">
                            <FormLabel style={{ color: 'inherit' }}>
                              CC
                            </FormLabel>
                            <FormControl
                              {...field}
                              value={field.value ?? ''}
                              placeholder="Add CC recipients"
                              type="text"
                              aria-describedby="template-cc-help-text"
                              data-testid="cc-input"
                            />
                            <Form.Text id="template-cc-help-text">
                              Optional CC recipients
                            </Form.Text>
                          </FormItem>
                        )}
                      />
                    </Col>
                  </Row>

                  {/* Subject */}
                  <Row className="mb-3">
                    <Col md={12}>
                      <FormField
                        name="subject"
                        control={form.control}
                        render={({ field, formState }) => (
                          <FormItem id="template-subject">
                            <FormLabel style={{ color: 'inherit' }}>
                              Subject*
                            </FormLabel>
                            <FormControl
                              {...field}
                              value={field.value ?? ''}
                              placeholder="Add subject line"
                              type="text"
                              aria-describedby="template-subject-help-text"
                              aria-errormessage="template-subject-form-item-message"
                              aria-invalid={formState.errors.subject}
                              data-testid="subject-input"
                            />
                            {!formState.errors.subject && (
                              <Form.Text id="template-subject-help-text">
                                Email subject line
                              </Form.Text>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Col>
                  </Row>
                </Form.Group>

                {/* ── Email Content (Slate Editor) ────────────── */}
                <div className="mt-4">
                  <h5 className="mb-3">Email content</h5>
                  <label className="form-label">Body text</label>

                  <div
                    className="border rounded"
                    style={{ minHeight: '350px' }}
                  >
                    <Slate
                      editor={editor}
                      initialValue={editorValue}
                      onChange={(value) => setEditorValue(value)}
                    >
                      {/* Toolbar */}
                      <div
                        className="d-flex flex-wrap gap-1 p-2 border-bottom bg-light"
                        role="toolbar"
                        aria-label="Formatting options"
                      >
                        <MarkButton format="bold" icon="bold" />
                        <MarkButton format="italic" icon="italic" />
                        <MarkButton format="underline" icon="underline" />
                        <span className="border-left mx-1" />
                        <BlockButton format="heading-one" icon="type" />
                        <BlockButton format="heading-two" icon="type" />
                        <span className="border-left mx-1" />
                        <BlockButton format="bulleted-list" icon="list" />
                        <BlockButton format="numbered-list" icon="list-ordered" />
                        <span className="border-left mx-1" />
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          title="Insert link"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const url = window.prompt('Enter URL:');
                            if (url) {
                              Transforms.insertNodes(editor, {
                                type: 'link',
                                url,
                                children: [{ text: url }],
                              });
                            }
                          }}
                        >
                          <i className="hlx hlx-link" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          title="Undo"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            editor.undo();
                          }}
                        >
                          <i
                            className="hlx hlx-corner-up-left"
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          title="Redo"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            editor.redo();
                          }}
                        >
                          <i
                            className="hlx hlx-corner-up-right"
                            aria-hidden="true"
                          />
                        </button>
                        <span className="border-left mx-1" />
                        <VariableDropdown variables={templateVariables} />
                      </div>

                      {/* Editor Area */}
                      <div className="p-3">
                        <Editable
                          renderElement={renderElement}
                          renderLeaf={renderLeaf}
                          placeholder="Enter email body content..."
                          spellCheck
                          autoFocus={false}
                          style={{ minHeight: '280px', outline: 'none' }}
                          onKeyDown={(event) => {
                            if (!event.ctrlKey && !event.metaKey) return;
                            switch (event.key) {
                              case 'b':
                                event.preventDefault();
                                toggleMark(editor, 'bold');
                                break;
                              case 'i':
                                event.preventDefault();
                                toggleMark(editor, 'italic');
                                break;
                              case 'u':
                                event.preventDefault();
                                toggleMark(editor, 'underline');
                                break;
                              case 'z':
                                event.preventDefault();
                                if (event.shiftKey) {
                                  editor.redo();
                                } else {
                                  editor.undo();
                                }
                                break;
                            }
                          }}
                        />
                      </div>
                    </Slate>
                  </div>
                </div>

                {/* ── Form Actions ─────────────────────────────── */}
                <Form.Group>
                  <Row className="text-right">
                    <Col md={12} className="mt-4">
                      <Link
                        to="/administration/communications"
                        className="btn btn-brand btn-secondary mr-3"
                        aria-label="Cancel edit template"
                      >
                        Cancel
                      </Link>
                      <Button
                        className="mr-2"
                        variant="secondary"
                        onClick={form.handleSubmit(handleSubmit)}
                        disabled={isSubmitting}
                      >
                        Save
                      </Button>
                    </Col>
                  </Row>
                </Form.Group>
              </Form>
            </FormProvider>
          </Card.Body>
        </Card>
      </section>
    </>
  );
};

export default AddEditTemplate;
