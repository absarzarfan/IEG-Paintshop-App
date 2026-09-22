import { useGetCurrentUser, UserRole, getGetCurrentUserQueryKey } from "@workspace/api-client-react";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  painter: "Paint Mixer",
  warehouse: "Warehouse",
};

export function useAppAuth() {
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: {
      retry: false,
      queryKey: getGetCurrentUserQueryKey()
    }
  });
  
  const isAdmin = user?.role === 'admin';
  // Read only access applies to master data for non-admins
  const isReadOnly = !isAdmin;

  return {
    user,
    isLoading,
    error,
    isAdmin,
    isReadOnly,
  };
}
