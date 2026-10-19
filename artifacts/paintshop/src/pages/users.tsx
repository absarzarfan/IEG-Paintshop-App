import { 
  useListUsers, 
  getListUsersQueryKey,
  useUpdateUser,
  useCreateUser,
  useDeleteUser,
  UserRole
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Users as UsersIcon, UserPlus, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { useAppAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";

export function Users() {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAppAuth();
  
  const { data: users, isLoading, error } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const updateMutation = useUpdateUser();
  const createMutation = useCreateUser();
  const deleteMutation = useDeleteUser();
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("painter");
  const [newIsPaintLeader, setNewIsPaintLeader] = useState(false);

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await updateMutation.mutateAsync({
        id: userId,
        data: { role: newRole as UserRole, ...(newRole === "painter" ? {} : { isPaintLeader: false }) }
      });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: t("roleUpdatedTitle"), description: t("roleUpdatedDescription") });
    } catch (e) {
      toast({ title: t("updateFailed"), description: t("roleUpdateError"), variant: "destructive" });
    }
  };

  const handleStatusChange = async (userId: number, isActive: boolean) => {
    try {
      await updateMutation.mutateAsync({
        id: userId,
        data: { isActive }
      });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: t("statusUpdate"), description: `${t("userStatusDescription")} ${t(isActive ? "activeStatus" : "inactiveStatus")}.` });
    } catch (e) {
      toast({ title: t("updateFailed"), description: t("userStatusError"), variant: "destructive" });
    }
  };

  const handleLeaderChange = async (userId: number, isPaintLeader: boolean) => {
    try {
      await updateMutation.mutateAsync({ id: userId, data: { isPaintLeader } });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: t("leaderUpdatedTitle"), description: t("leaderUpdatedDescription") });
    } catch (error) {
      toast({ title: t("updateFailed"), description: error instanceof Error ? error.message : t("leaderUpdateError"), variant: "destructive" });
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
          isPaintLeader: newRole === "painter" && newIsPaintLeader,
          isActive: true,
        },
      });
      setNewUsername("");
      setNewName("");
      setNewPassword("");
      setNewRole("painter");
      setNewIsPaintLeader(false);
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: t("userCreatedTitle"), description: t("userCreatedDescription") });
    } catch (error) {
      toast({
        title: t("userCreateFailed"),
        description: error instanceof Error ? error.message : t("userCreateError"),
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (currentUser?.id === userId) {
      toast({
        title: t("deleteBlocked"),
        description: t("deleteSelfError"),
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`${t("deleteUserConfirm")} ${username}? ${t("deleteUserConfirmIrreversible")}`)) return;
    try {
      await deleteMutation.mutateAsync({ id: userId });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: t("userDeletedTitle"), description: t("userDeletedDescription") });
    } catch (error) {
      toast({
        title: t("userDeleteFailed"),
        description: error instanceof Error ? error.message : t("userDeleteError"),
        variant: "destructive",
      });
    }
  };

  const roles: UserRole[] = ["admin", "painter", "warehouse"];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">{t("admin")}</p>
        <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">{t("access")}</h1>
        <p className="text-muted-foreground font-medium mt-1">{t("manageAccounts")}</p>
      </div>

      <form onSubmit={handleCreateUser} className="bg-card border border-border shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="font-bold uppercase tracking-wide text-sm">{t("account")}</h2>
        </div>
        <label className="flex items-center gap-3 border border-border bg-secondary/20 px-3 py-2 text-sm">
          <Switch checked={newRole === "painter" && newIsPaintLeader} disabled={newRole !== "painter"} onCheckedChange={setNewIsPaintLeader} data-testid="switch-new-paint-leader" />
          <span><strong>{t("leader")}</strong><span className="block text-xs text-muted-foreground">{t("leaderHint")}</span></span>
        </label>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">{t("fullName")}</Label>
            <Input id="new-name" value={newName} onChange={(event) => setNewName(event.target.value)} required data-testid="input-new-user-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-username">{t("username")}</Label>
            <Input id="new-username" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} minLength={3} required data-testid="input-new-user-username" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("tempPassword")}</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={4} required data-testid="input-new-user-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-role">{t("role")}</Label>
            <Select value={newRole} onValueChange={(value) => setNewRole(value as UserRole)}>
              <SelectTrigger id="new-role" className="font-bold text-xs uppercase tracking-wider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role} value={role} className="font-bold text-xs uppercase tracking-wider">
                    {role === "admin" ? t("roleAdminShort") : role === "painter" ? t("rolePainterShort") : t("roleWarehouseShort")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={createMutation.isPending} className="font-bold uppercase tracking-wide" data-testid="button-create-user">
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("create")}
        </Button>
      </form>

      <div className="bg-card border border-border shadow-sm flex flex-col">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : error || !users ? (
          <div className="p-8 text-destructive text-center font-bold" data-testid="error-users">{t("failedUsers")} <button className="underline" onClick={() => void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })}>{t("retry")}</button></div>
        ) : users.length === 0 ? (
          <div className="p-16 text-center">
            <UsersIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-bold">{t("noUsers")}</h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                   <th className="font-bold">{t("fullName")} & {t("username")}</th>
                  <th className="font-bold">{t("joined")}</th>
                  <th className="font-bold w-48">{t("role")}</th>
                   <th className="font-bold">{t("leader")}</th>
                  <th className="font-bold w-24 text-center">{t("activeUser")}</th>
                    <th className="font-bold w-20 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-bold text-foreground">{user.name || "—"}</p>
                           <p className="font-mono text-xs text-muted-foreground">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-muted-foreground">{new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", { dateStyle: "medium" }).format(new Date(user.createdAt))}</td>
                    <td>
                      <Select 
                        value={user.role} 
                        onValueChange={(val) => handleRoleChange(user.id, val)}
                        disabled={updateMutation.isPending}
                      >
                       <SelectTrigger className="h-8 font-bold text-xs uppercase tracking-wider" data-testid={`select-role-${user.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map(r => (
                            <SelectItem key={r} value={r} className="font-bold text-xs uppercase tracking-wider">
                               {r === "admin" ? t("roleAdminShort") : r === "painter" ? t("rolePainterShort") : t("roleWarehouseShort")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4">
                      <Switch checked={user.isPaintLeader} disabled={user.role !== "painter" || updateMutation.isPending} aria-label={`${t("leader")} ${user.username}`} onCheckedChange={(checked) => handleLeaderChange(user.id, checked)} data-testid={`switch-paint-leader-${user.id}`} />
                    </td>
                    <td className="text-center px-4">
                      <Switch 
                        checked={user.isActive} 
                        onCheckedChange={(checked) => handleStatusChange(user.id, checked)}
                        disabled={updateMutation.isPending}
                         data-testid={`switch-active-${user.id}`}
                      />
                    </td>
                     <td className="text-right px-4">
                       <Button
                         variant="ghost"
                         size="icon"
                         className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                         disabled={deleteMutation.isPending}
                         onClick={() => handleDeleteUser(user.id, user.username)}
                          aria-label={`${t("delete")} ${user.username}`}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
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
