/**
 * Shared TypeScript type definitions.
 */

// API response wrappers
export interface ApiError {
  error: {
    message: string;
    detail?: unknown;
    type: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Health check
export interface HealthCheck {
  status: string;
  service: string;
  version: string;
}

// Domain types — will be expanded in later sprints
export interface Company {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  company_id: string;
  is_active: boolean;
}
