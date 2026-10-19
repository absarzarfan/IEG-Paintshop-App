import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListCustomersQueryKey, useCreateCustomer, useListCustomers, useUpdateCustomer } from "@workspace/api-client-react";
import { AlertTriangle, Loader2, Pencil, Plus, Power, Users } from "lucide-react";
import { useAppAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Customers() {
  const { t } = useLanguage();
  const { user } = useAppAuth();
  const queryClient = useQueryClient();
  const queryKey = getListCustomersQueryKey();
  const query = useListCustomers({ query: { queryKey } });
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin";

  function getMutationError(cause: unknown) {
    const message = cause instanceof Error ? cause.message : "";
    if (message.toLowerCase().includes("already exists")) return t("customerExists");
    if (message.toLowerCase().includes("already linked to jobs")) return t("customerUsed");
    return t("error");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const cleanName = name.trim();
    if (!cleanName) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, data: { name: cleanName } });
      } else {
        await create.mutateAsync({ data: { name: cleanName } });
      }
      await queryClient.invalidateQueries({ queryKey });
      setName("");
      setEditing(null);
    } catch (cause) {
      setError(getMutationError(cause));
    }
  }

  async function toggleActive(customer: { id: number; isActive: boolean }) {
    setError("");
    try {
      await update.mutateAsync({ id: customer.id, data: { isActive: !customer.isActive } });
      await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      setError(getMutationError(cause));
    }
  }

  function beginEdit(customer: { id: number; name: string }) {
    setEditing({ id: customer.id, name: customer.name });
    setName(customer.name);
    setError("");
  }

  function cancelEdit() {
    setEditing(null);
    setName("");
    setError("");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header className="border-b border-border pb-5">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{t("masterData")}</p>
        <h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">{t("customersTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("customersIntro")}</p>
      </header>

      {isAdmin && (
        <form onSubmit={submit} className="flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-end" data-testid="form-customer">
          <label className="flex-1 space-y-1 text-xs font-bold uppercase text-muted-foreground">
            {t("customerNameLabel")}
            <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} data-testid="input-customer-name" />
          </label>
          <Button type="submit" disabled={create.isPending || update.isPending} data-testid="button-save-customer">
            {(create.isPending || update.isPending) ? <Loader2 size={15} className="mr-2 animate-spin" /> : editing ? <Pencil size={15} className="mr-2" /> : <Plus size={15} className="mr-2" />}
            {editing ? t("saveChanges") : t("addCustomer")}
          </Button>
          {editing && <Button type="button" variant="outline" onClick={cancelEdit}>{t("cancel")}</Button>}
        </form>
      )}

      {error && <div className="flex gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert"><AlertTriangle size={16} className="shrink-0" />{error}</div>}

      <section className="border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border bg-secondary/20 p-4">
          <Users size={18} className="text-primary" />
          <p className="text-xs font-bold uppercase tracking-widest">{query.data?.length ?? 0} {t("customers")}</p>
        </div>
        {query.isLoading ? <p className="p-8 text-sm text-muted-foreground">{t("loading")}</p>
          : query.error ? <p className="p-8 text-sm font-semibold text-destructive">{t("error")}</p>
          : !query.data?.length ? <p className="p-8 text-center text-sm text-muted-foreground">{t("noCustomers")}</p>
          : <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="p-3">{t("customerNameLabel")}</th><th className="p-3">{t("linkedJobs")}</th><th className="p-3">{t("status")}</th>{isAdmin && <th className="p-3 text-right">{t("actions")}</th>}</tr></thead>
              <tbody>{query.data.map((customer) => <tr key={customer.id} className="border-b border-border last:border-0" data-testid={`row-customer-${customer.id}`}>
                <td className="p-3 font-semibold">{customer.name}</td>
                <td className="p-3 font-mono">{customer.jobCount}</td>
                <td className="p-3"><span className={`border px-2 py-1 text-[10px] font-bold uppercase ${customer.isActive ? "border-emerald-700/30 bg-emerald-50 text-emerald-800" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>{customer.isActive ? t("activeStatus") : t("inactiveStatus")}</span></td>
                {isAdmin && <td className="space-x-2 p-3 text-right">
                  {customer.jobCount === 0 && <Button size="sm" variant="outline" onClick={() => beginEdit(customer)} aria-label={`${t("editCustomer")} ${customer.name}`}><Pencil size={14} /></Button>}
                  <Button size="sm" variant="outline" onClick={() => void toggleActive(customer)} aria-label={`${customer.isActive ? t("deactivate") : t("activate")} ${customer.name}`} data-testid={`button-toggle-customer-${customer.id}`}><Power size={14} className={customer.isActive ? "text-destructive" : "text-emerald-700"} /></Button>
                </td>}
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
      <p className="text-xs text-muted-foreground">{t("customerUsed")}</p>
    </div>
  );
}
