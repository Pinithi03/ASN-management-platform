/**
 * Company context hook.
 * Will provide current company selection in Sprint 3.
 */

export function useCompany() {
  return {
    currentCompany: null,
    companies: [],
    switchCompany: (_id: string) => {},
    isLoading: false,
  };
}
