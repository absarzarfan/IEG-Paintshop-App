import { useGetCurrentUser, UserRole, getGetCurrentUserQueryKey } from "@workspace/api-client-react";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  painter: "Painter / Operator",
  warehouse: "Warehouse",
  supervisor: "Supervisor",
  procurement: "Procurement",
  pending: "Menunggu Persetujuan",
};

export function useAppAuth() {
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: {
      retry: false,
      queryKey: getGetCurrentUserQueryKey()
    }
  });
  
  const isAdmin = user?.role === 'admin';
  const isPending = user?.role === 'pending';
  // Read only access applies to master data for non-admins
  const isReadOnly = !isAdmin;

  return {
    user,
    isLoading,
    error,
    isAdmin,
    isPending,
    isReadOnly,
  };
}
