import { useState } from "react";
import { 
  useListBrands, 
  getListBrandsQueryKey,
  useCreateBrand,
  useUpdateBrand,
  useDeleteBrand,
  BrandInput
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings, Plus, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useAppAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";

const formSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t("nameRequired")),
});

export function Brands() {
  const { t } = useLanguage();
  const { isAdmin } = useAppAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<{ id: number; name: string } | null>(null);

  const { data: brands, isLoading, error } = useListBrands({ query: { queryKey: getListBrandsQueryKey() } });
  
  const createMutation = useCreateBrand({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
        setOpen(false);
        form.reset();
      }
    }
  });

  const updateMutation = useUpdateBrand({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
      }
    }
  });
  const deleteMutation = useDeleteBrand();

  const form = useForm<z.infer<ReturnType<typeof formSchema>>>({
    resolver: zodResolver(formSchema(t)),
    defaultValues: { name: "" }
  });

  function onSubmit(values: z.infer<ReturnType<typeof formSchema>>) {
    if (editingBrand) {
      updateMutation.mutate({ id: editingBrand.id, data: values }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
          setOpen(false);
          setEditingBrand(null);
          form.reset();
        },
        onError: (error) => toast({ title: t("updateFailed"), description: error instanceof Error ? error.message : t("brandUpdateError"), variant: "destructive" }),
      });
      return;
    }
    createMutation.mutate({ data: values as BrandInput });
  }

  function openCreate() {
    setEditingBrand(null);
    form.reset({ name: "" });
    setOpen(true);
  }

  function openEdit(brand: { id: number; name: string }) {
    setEditingBrand(brand);
    form.reset({ name: brand.name });
    setOpen(true);
  }

  const toggleStatus = async (id: number, isActive: boolean) => {
    if (!isAdmin) return;
    await updateMutation.mutateAsync({ id, data: { isActive } });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">{t("masterData")}</p>
          <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">{t("brandsTitle")}</h1>
          <p className="text-muted-foreground font-medium mt-1">{t("brandsIntro")}</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setEditingBrand(null); }}>
            <DialogTrigger asChild>
              <Button className="font-bold uppercase tracking-wider" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> {t("addBrand")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">{editingBrand ? t("editBrand") : t("addBrand")}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">{t("brandName")}</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Jotun" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="font-bold uppercase tracking-wider px-8">
                      {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingBrand ? t("update") : t("save")}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="bg-card border border-border shadow-sm">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : error || !brands ? (
          <div className="p-8 text-destructive text-center font-bold">{t("loadBrandsError")}</div>
        ) : brands.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-secondary text-muted-foreground mx-auto flex items-center justify-center mb-4 border border-border">
              <Settings size={32} />
            </div>
            <h3 className="text-lg font-bold text-foreground">{t("noBrands")}</h3>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th className="font-bold">{t("brandName")}</th>
                <th className="font-bold w-32 text-center">{t("status")}</th>
                {isAdmin && <th className="font-bold w-28 text-right">{t("actions")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-medium">
              {brands.map(brand => (
                <tr key={brand.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="font-bold text-foreground py-3 px-4">{brand.name}</td>
                   <td className="text-center py-3 px-4">
                    {isAdmin ? (
                      <Switch 
                        checked={brand.isActive} 
                        onCheckedChange={(c) => toggleStatus(brand.id, c)}
                        disabled={updateMutation.isPending}
                      />
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                        brand.isActive ? 'bg-primary/20 text-foreground border-primary/40' : 'bg-secondary text-muted-foreground border-border'
                      }`}>
                        {brand.isActive ? t("activeStatus") : t("inactiveStatus")}
                      </span>
                    )}
                  </td>
                   {isAdmin && (
                     <td className="text-right py-3 px-4">
                       <div className="inline-flex items-center gap-1">
                         <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(brand)} aria-label={`Edit ${brand.name}`}>
                           <Pencil className="h-4 w-4" />
                         </Button>
                         <Button
                           variant="ghost"
                           size="icon"
                           className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={deleteMutation.isPending}
                           onClick={async () => {
                              if (!confirm(`${t("brandDeleteConfirm")} ${brand.name}?`)) return;
                             try {
                               await deleteMutation.mutateAsync({ id: brand.id });
                               queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
                             } catch (error) {
                                toast({ title: t("deleteFailed"), description: error instanceof Error ? error.message : t("brandDeleteError"), variant: "destructive" });
                             }
                           }}
                           aria-label={`Delete ${brand.name}`}
                         >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       </div>
                     </td>
                   )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
