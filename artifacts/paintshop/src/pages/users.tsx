import { 
  useListUsers, 
  getListUsersQueryKey,
  useUpdateUser,
  useCreateUser,
  UserRole
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Users as UsersIcon, ShieldAlert, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const createMutation = useCreateUser();
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("painter");

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

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createMutation.mutateAsync({
        data: {
          username: newUsername,
          name: newName,
          password: newPassword,
          role: newRole,
          isActive: true,
        },
      });
      setNewUsername("");
      setNewName("");
      setNewPassword("");
      setNewRole("painter");
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User created", description: "Account credentials are ready to share with the user." });
    } catch (error) {
      toast({
        title: "Creation failed",
        description: error instanceof Error ? error.message : "Could not create the account.",
        variant: "destructive",
      });
    }
  };

  const roles: UserRole[] = ["admin", "painter", "warehouse", "supervisor", "procurement", "pending"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">Access Control</h1>
        <p className="text-muted-foreground font-medium mt-1">Create accounts and manage system permissions.</p>
      </div>

      <form onSubmit={handleCreateUser} className="bg-card border border-border shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="font-bold uppercase tracking-wide text-sm">Create account</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">Full name</Label>
            <Input id="new-name" value={newName} onChange={(event) => setNewName(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-username">Username</Label>
            <Input id="new-username" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} minLength={3} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Temporary password</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-role">Role</Label>
            <Select value={newRole} onValueChange={(value) => setNewRole(value as UserRole)}>
              <SelectTrigger id="new-role" className="font-bold text-xs uppercase tracking-wider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.filter((role) => role !== "pending").map((role) => (
                  <SelectItem key={role} value={role} className="font-bold text-xs uppercase tracking-wider">
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={createMutation.isPending} className="font-bold uppercase tracking-wide">
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create user
        </Button>
      </form>

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
                   <th className="font-bold">Name & Username</th>
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
                           <p className="font-mono text-xs text-muted-foreground">@{user.username}</p>
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
