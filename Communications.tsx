import React, { useMemo, useState, useEffect } from 'react';
import { Card, Col, Form, Row, Pagination, Button } from '@hrportal/components';
import { Link, useParams } from 'react-router-dom';
import { ColDef } from 'ag-grid-community';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../components/common/form/form';
import { useToastContext } from '../../contexts/ToastContext';
import { useBreadcrumbContext } from '../../contexts/BreadcrumbContext';
import { useAuth } from '../../hooks/useAuth';
import { useProgramStore } from '../../store/useProgramStore';
import { makeRequest } from '../../utils/api';
import DynamicBreadcrumbs from '../../components/layout/DynamicBreadcrumbs';
import AgGridWrapper from '../../components/AgGridWrapper';
import {
  TEmailTemplate,
  TProgram,
} from '../../types/program';

interface TProgramOption {
  programId: string;
  programName: string;
}

// Dynamically convert auth.roles.programs to label-value pairs
interface Roles {
  programs?: string[];
  userRoles?: string[];
  leadershipHierarchies?: string[];
}

const Communications: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [rowData, setRowData] = useState<TEmailTemplate[]>([]);
  const [programs, setPrograms] = useState<TProgramOption[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [hasLoadedTemplates, setHasLoadedTemplates] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const { setBreadcrumbs } = useBreadcrumbContext();
  const { addToast } = useToastContext();
  const auth = useAuth() as { roles: Roles };
  const userPrograms = (auth.roles as { programs?: string[] })?.programs;
  const { program, setProgram } = useProgramStore();

  // Set breadcrumbs
  useEffect(() => {
    setBreadcrumbs([
      { label: 'Administration', path: '/administration' },
      { label: 'Communications', path: '' },
    ]);
  }, []);

  // Fetch programs for dropdown
  useEffect(() => {
    const fetchPrograms = async () => {
      const result = await makeRequest<TProgramOption[]>({
        endpoint: '/program/get-all-programs',
        method: 'GET',
      });
      if (result.ok) {
        setPrograms(result.data);
      } else {
        addToast(result.error.message, 'Error Occurred', 'danger');
      }
    };
    fetchPrograms();
  }, []);

  // Fetch templates when program selection changes
  useEffect(() => {
    if (!selectedProgramId) return;

    const fetchTemplates = async () => {
      setIsLoading(true);
      const result = await makeRequest<TEmailTemplate[]>({
        endpoint: `/program/${selectedProgramId}/communications/templates`,
        method: 'GET',
      });
      if (result.ok) {
        setRowData(result.data);
      } else {
        addToast(result.error.message, 'Error Occurred', 'danger');
      }
      setHasLoadedTemplates(true);
      setIsLoading(false);
    };
    fetchTemplates();
  }, [selectedProgramId]);

  const handleProgramChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedProgramId(e.target.value);
    setHasLoadedTemplates(false);
    setRowData([]);
    setCurrentPage(0);
  };

  const handleDuplicate = async (templateID: number) => {
    const result = await makeRequest({
      endpoint: `/program/${selectedProgramId}/communications/templates/${templateID}/duplicate`,
      method: 'POST',
    });
    if (result.ok) {
      addToast('Template duplicated successfully', 'Success', 'success');
      // Refresh templates
      const refreshResult = await makeRequest<TEmailTemplate[]>({
        endpoint: `/program/${selectedProgramId}/communications/templates`,
        method: 'GET',
      });
      if (refreshResult.ok) {
        setRowData(refreshResult.data);
      }
    } else {
      addToast(result.error.message, 'Error Occurred', 'danger');
    }
  };

  const handleToggleStatus = async (template: TEmailTemplate) => {
    const result = await makeRequest({
      endpoint: `/program/${selectedProgramId}/communications/templates/${template.templateID}/status`,
      method: 'PATCH',
      body: { active: !template.active },
    });
    if (result.ok) {
      addToast(
        `Template ${template.active ? 'deactivated' : 'activated'} successfully`,
        'Success',
        'success'
      );
      setRowData((prev) =>
        prev.map((t) =>
          t.templateID === template.templateID
            ? { ...t, active: !t.active }
            : t
        )
      );
    } else {
      addToast(result.error.message, 'Error Occurred', 'danger');
    }
  };

  // ── Pagination ──────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(rowData.length / rowsPerPage);
  const pages = Array.from({ length: totalPages }, (_, i) => i);
  const paginatedData = rowData.slice(
    currentPage * rowsPerPage,
    (currentPage + 1) * rowsPerPage
  );
  const showingStart = rowData.length > 0 ? currentPage * rowsPerPage + 1 : 0;
  const showingEnd = Math.min((currentPage + 1) * rowsPerPage, rowData.length);

  const handlePageChange = (pageIndex: number) => {
    setCurrentPage(pageIndex);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(0);
  };

  // ── Column Definitions ────────────────────────────────────────────────────

  const templateIdRender = (params: { data: TEmailTemplate }) => (
    <Link
      to={`/programs/${selectedProgramId}/communications/templates/${params.data.templateID}`}
      className="btn-text-icon"
    >
      {params.data.templateID}
    </Link>
  );

  const templateActionRender = (params: { data: TEmailTemplate }) => (
    <div className="dropdown">
      <button
        className="btn btn-link p-0"
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded="false"
      >
        <i className="mr-1 hlx hlx-more-vertical" />
      </button>
      <ul className="dropdown-menu">
        <li>
          <Link
            className="dropdown-item"
            to={`/programs/${selectedProgramId}/communications/templates/${params.data.templateID}/edit`}
          >
            Edit
          </Link>
        </li>
        <li>
          <button
            className="dropdown-item"
            onClick={() => handleDuplicate(params.data.templateID)}
          >
            Duplicate
          </button>
        </li>
        <li>
          <button
            className="dropdown-item"
            onClick={() => handleToggleStatus(params.data)}
          >
            {params.data.active ? 'Deactivate' : 'Activate'}
          </button>
        </li>
      </ul>
    </div>
  );

  const columnDefs: ColDef[] = useMemo(
    () => [
      {
        headerName: 'Template ID',
        field: 'templateID',
        cellRenderer: templateIdRender,
      },
      {
        headerName: 'Title',
        field: 'templateName',
      },
      {
        headerName: 'Publisher',
        field: 'from',
      },
      {
        headerName: 'Category',
        field: 'category',
      },
      {
        headerName: 'Status',
        field: 'active',
        filter: 'agSetColumnFilter',
        filterParams: {
          values: ['Active', 'Inactive'],
        },
        valueGetter: (params: { data: { active: boolean | null } }) =>
          params.data.active ? 'Active' : 'Inactive',
        cellRenderer: (params: { value: string }) => params.value,
      },
      {
        headerName: 'Actions',
        field: 'actions',
        cellClass: 'cycle-action-dropdown-cell border-none',
        cellRenderer: templateActionRender,
        filter: false,
      },
    ],
    [selectedProgramId]
  );

  const addTemplateUrl = useMemo(() => {
    return selectedProgramId
      ? `/programs/${selectedProgramId}/communications/templates/create`
      : '/programs/communications/templates/create';
  }, [selectedProgramId]);

  return (
    <>
      <DynamicBreadcrumbs />
      <h1 className="mb-4" data-testid="communications-title">
        Communications
      </h1>

      <section className="mb-4">
        <Card className="shadow-none">
          <Card.Body>
            {/* Program Selection */}
            <div className="mb-4">
              <label htmlFor="programSelection" className="form-label">
                Program selection
              </label>
              <select
                id="programSelection"
                className="form-select"
                style={{ maxWidth: '350px' }}
                value={selectedProgramId}
                onChange={handleProgramChange}
              >
                <option value="">Select</option>
                {programs.map((prog) => (
                  <option key={prog.programId} value={prog.programId}>
                    {prog.programName}
                  </option>
                ))}
              </select>
              <small className="form-text text-muted">
                Choose a program to view associated templates
              </small>
            </div>

            {/* Templates Header */}
            <div className="row align-items-center mb-4">
              <div className="col-6">
                <h5 className="mb-0">Templates</h5>
              </div>
              <div className="col-6 text-right">
                <Link to={addTemplateUrl} className="btn btn-text-icon">
                  <i
                    className="mr-1 hlx hlx-control-plus"
                    aria-hidden="true"
                  />{' '}
                  Add template
                </Link>
              </div>
            </div>

            {/* No Results Alert - program selected but no templates */}
            {hasLoadedTemplates && rowData.length === 0 && selectedProgramId && (
              <div className="alert alert-danger d-flex align-items-start mb-3" role="alert">
                <i className="mr-2 hlx hlx-alert-triangle" aria-hidden="true" />
                <div>
                  <strong>No results found!</strong>
                  <br />
                  The selected program does not currently have a communication template(s)
                  associated with it. Please add a new template.
                </div>
              </div>
            )}

            {/* Templates Grid */}
            {!hasLoadedTemplates || !selectedProgramId ? (
              <div
                className="d-flex flex-column justify-content-center align-items-center mb-3"
                style={{ height: '225px' }}
              >
                <p className="font-weight-bold mb-1">
                  Communications have not been loaded
                </p>
                <p className="text-muted">
                  Use the &quot;Program selection&quot; above to load associated templates.
                </p>
              </div>
            ) : isLoading ? (
              <div
                className="d-flex justify-content-center align-items-center mb-3"
                style={{ height: '225px' }}
              >
                <p>Loading...</p>
              </div>
            ) : rowData.length > 0 ? (
              <>
                <AgGridWrapper
                  rowData={paginatedData}
                  columnDefs={columnDefs}
                  enableSorting
                  enableFiltering
                  enableResizing
                  columnMenu="new"
                  suppressHeaderMenuButton={true}
                  suppressHeaderContextMenu
                />

                {/* Pagination */}
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <div>
                    <small className="text-muted">
                      Showing {showingStart}-{showingEnd} of {rowData.length}
                    </small>
                  </div>
                  <div className="d-flex align-items-center">
                    <span className="mr-2">Rows per page</span>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: '70px' }}
                      value={rowsPerPage}
                      onChange={handleRowsPerPageChange}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>

                    <span className="mx-3">
                      Page
                      <select
                        className="form-select form-select-sm d-inline-block mx-1"
                        style={{ width: '60px' }}
                        value={currentPage}
                        onChange={(e) => handlePageChange(Number(e.target.value))}
                      >
                        {pages.map((_, index) => (
                          <option key={index} value={index}>
                            {index + 1}
                          </option>
                        ))}
                      </select>
                    </span>

                    {pages.length > 1 && (
                      <Pagination>
                        {pages.map((_, index) => (
                          <Pagination.Item
                            key={crypto.randomUUID()}
                            active={index === currentPage}
                            onClick={() => handlePageChange(index)}
                          >
                            {index + 1}
                          </Pagination.Item>
                        ))}
                      </Pagination>
                    )}

                    <Button
                      variant="tertiary"
                      className="ml-2"
                      disabled={currentPage === 0}
                      onClick={() => handlePageChange(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="tertiary"
                      className="ml-1"
                      disabled={currentPage >= totalPages - 1}
                      onClick={() => handlePageChange(currentPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </Card.Body>
        </Card>
      </section>
    </>
  );
};

export default Communications;
