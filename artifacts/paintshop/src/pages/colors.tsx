import { useState } from "react";
import { 
  useListColors, 
  getListColorsQueryKey,
  useCreateColor,
  useUpdateColor,
  useDeleteColor,
  ColorInput
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Palette, Plus, Pencil, Trash2 } from "lucide-react";
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
  hexCode: z.string().optional().refine(val => !val || /^#[0-9A-F]{6}$/i.test(val), t("validHex")),
});

export function Colors() {
  const { t } = useLanguage();
  const { isAdmin } = useAppAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingColor, setEditingColor] = useState<{ id: number; name: string; hexCode: string | null } | null>(null);

  const { data: colors, isLoading, error } = useListColors({ query: { queryKey: getListColorsQueryKey() } });
  
  const createMutation = useCreateColor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListColorsQueryKey() });
        setOpen(false);
        form.reset();
      }
    }
  });
  const updateMutation = useUpdateColor();
  const deleteMutation = useDeleteColor();

  const form = useForm<z.infer<ReturnType<typeof formSchema>>>({
    resolver: zodResolver(formSchema(t)),
    defaultValues: { name: "", hexCode: "" }
  });

  function onSubmit(values: z.infer<ReturnType<typeof formSchema>>) {
    if (editingColor) {
      updateMutation.mutate({ id: editingColor.id, data: { ...values, hexCode: values.hexCode || null } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListColorsQueryKey() });
          setOpen(false);
          setEditingColor(null);
          form.reset();
        },
        onError: (error) => toast({ title: t("updateFailed"), description: error instanceof Error ? error.message : t("colorUpdateError"), variant: "destructive" }),
      });
      return;
    }
    createMutation.mutate({ data: values as ColorInput });
  }

  function openCreate() {
    setEditingColor(null);
    form.reset({ name: "", hexCode: "" });
    setOpen(true);
  }

  function openEdit(color: { id: number; name: string; hexCode: string | null }) {
    setEditingColor(color);
    form.reset({ name: color.name, hexCode: color.hexCode ?? "" });
    setOpen(true);
  }

  async function toggleStatus(id: number, isActive: boolean) {
    try {
      await updateMutation.mutateAsync({ id, data: { isActive } });
      queryClient.invalidateQueries({ queryKey: getListColorsQueryKey() });
    } catch (error) {
      toast({ title: t("statusUpdateFailed"), description: error instanceof Error ? error.message : t("colorStatusError"), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">{t("masterData")}</p>
          <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">{t("colorsTitle")}</h1>
          <p className="text-muted-foreground font-medium mt-1">{t("colorsIntro")}</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setEditingColor(null); }}>
            <DialogTrigger asChild>
              <Button className="font-bold uppercase tracking-wider" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> {t("addColor")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">{editingColor ? t("editColor") : t("addColor")}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">{t("colorName")}</FormLabel>
                      <FormControl><Input {...field} placeholder={`${t("example")}: Traffic Yellow`} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="hexCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">{t("hexOptional")}</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. #FBB900" className="font-mono uppercase" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="font-bold uppercase tracking-wider px-8">
                      {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingColor ? t("colorsUpdate") : t("colorsSave")}
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
        ) : error || !colors ? (
          <div className="p-8 text-destructive text-center font-bold">{t("loadColorsError")}</div>
        ) : colors.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-secondary text-muted-foreground mx-auto flex items-center justify-center mb-4 border border-border">
              <Palette size={32} />
            </div>
            <h3 className="text-lg font-bold text-foreground">{t("noColors")}</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
            {colors.map(color => (
              <div key={color.id} className="flex items-center gap-4 p-3 border border-border bg-card shadow-sm hover:border-primary/50 transition-colors">
                <div 
                  className="w-10 h-10 rounded shadow-sm border border-black/10 shrink-0" 
                  style={{ backgroundColor: color.hexCode || '#CCCCCC' }}
                />
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground truncate flex items-center gap-2">
                    {color.name}
                     {!color.isActive && <span className="text-[10px] bg-secondary text-secondary-foreground px-1 border uppercase">{t("colorsInactive")}</span>}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground uppercase">{color.hexCode || t("noHex")}</p>
                </div>
                 {isAdmin && (
                   <div className="ml-auto flex items-center gap-1">
                      <Switch checked={color.isActive} onCheckedChange={(checked) => toggleStatus(color.id, checked)} disabled={updateMutation.isPending} aria-label={`${t("status")} ${color.name}`} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(color)} aria-label={`${t("edit")} ${color.name}`}>
                       <Pencil className="h-4 w-4" />
                     </Button>
                     <Button
                       variant="ghost"
                       size="icon"
                       className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deleteMutation.isPending}
                       onClick={async () => {
                          if (!confirm(`${t("colorDeleteConfirm")} ${color.name}?`)) return;
                         try {
                           await deleteMutation.mutateAsync({ id: color.id });
                           queryClient.invalidateQueries({ queryKey: getListColorsQueryKey() });
                         } catch (error) {
                            toast({ title: t("deleteFailed"), description: error instanceof Error ? error.message : t("colorDeleteError"), variant: "destructive" });
                         }
                       }}
                        aria-label={`${t("delete")} ${color.name}`}
                     >
                       <Trash2 className="h-4 w-4" />
                     </Button>
                   </div>
                 )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
