import { useState } from "react";
import { 
  useListUsers, 
  getListUsersQueryKey,
  useUpdateUser,
  UserRole
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Users as UsersIcon, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { ROLE_LABELS } from "@/lib/auth";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export function Users() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: users, isLoading, error } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const updateMutation = useUpdateUser();

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await updateMutation.mutateAsync({
        id: userId,
        data: { role: newRole as UserRole }
      });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "Role updated", description: "User role has been changed." });
    } catch (e) {
      toast({ title: "Update failed", description: "Could not change user role.", variant: "destructive" });
    }
  };

  const handleStatusChange = async (userId: number, isActive: boolean) => {
    try {
      await updateMutation.mutateAsync({
        id: userId,
        data: { isActive }
      });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "Status updated", description: `User is now ${isActive ? 'active' : 'inactive'}.` });
    } catch (e) {
      toast({ title: "Update failed", description: "Could not change user status.", variant: "destructive" });
    }
  };

  const roles: UserRole[] = ["admin", "painter", "warehouse", "supervisor", "procurement", "pending"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">Access Control</h1>
        <p className="text-muted-foreground font-medium mt-1">Manage system accounts and permissions.</p>
      </div>

      <div className="bg-card border border-border shadow-sm flex flex-col">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : error || !users ? (
          <div className="p-8 text-destructive text-center font-bold">Failed to load users</div>
        ) : users.length === 0 ? (
          <div className="p-16 text-center">
            <UsersIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-bold">No Users Found</h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  <th className="font-bold">Name & Email</th>
                  <th className="font-bold">Joined</th>
                  <th className="font-bold w-48">Role</th>
                  <th className="font-bold w-24 text-center">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {users.map(user => (
                  <tr key={user.id} className={`hover:bg-secondary/30 transition-colors ${user.role === 'pending' ? 'bg-orange-50/50' : ''}`}>
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        {user.role === 'pending' && <ShieldAlert className="h-5 w-5 text-primary shrink-0" />}
                        <div>
                          <p className="font-bold text-foreground">{user.name || "—"}</p>
                          <p className="font-mono text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-muted-foreground">{format(new Date(user.createdAt), 'MMM d, yyyy')}</td>
                    <td>
                      <Select 
                        value={user.role} 
                        onValueChange={(val) => handleRoleChange(user.id, val)}
                        disabled={updateMutation.isPending}
                      >
                        <SelectTrigger className={`h-8 font-bold text-xs uppercase tracking-wider ${user.role === 'pending' ? 'border-primary text-primary' : ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map(r => (
                            <SelectItem key={r} value={r} className="font-bold text-xs uppercase tracking-wider">
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="text-center px-4">
                      <Switch 
                        checked={user.isActive} 
                        onCheckedChange={(checked) => handleStatusChange(user.id, checked)}
                        disabled={updateMutation.isPending}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
