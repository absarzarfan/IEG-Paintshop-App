import { useState } from "react";
import { 
  useListMaterials, 
  getListMaterialsQueryKey,
  useCreateMaterial,
  useListBrands,
  getListBrandsQueryKey,
  useListMaterialPrices,
  useCreateMaterialPrice,
  MaterialInput,
  MaterialType,
  MaterialPriceInput,
  getListMaterialPricesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Droplet, Plus, History } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const materialSchema = z.object({
  brandId: z.coerce.number().min(1, "Brand is required"),
  description: z.string().min(1, "Description is required"),
  type: z.enum(["Primer", "Topcoat", "Hardener", "Thinner", "Activator"]),
  packagingSizeL: z.coerce.number().min(0.1, "Required"),
  color: z.string().optional(),
  deadStockThreshold: z.coerce.number().min(0, "Required"),
  currency: z.string().min(3, "Required").max(3),
});

const priceSchema = z.object({
  unitPrice: z.coerce.number().min(0.01, "Price must be > 0"),
  currency: z.string().min(3).max(3),
  effectiveDate: z.string().min(10, "Required"),
});

function PriceHistoryDialog({ materialId, currentCurrency, isAdmin }: { materialId: number, currentCurrency: string, isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  
  const { data: prices, isLoading } = useListMaterialPrices(materialId, {
    query: { enabled: open, queryKey: getListMaterialPricesQueryKey(materialId) }
  });
  
  const addPriceMutation = useCreateMaterialPrice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMaterialPricesQueryKey(materialId) });
        queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
        form.reset();
      }
    }
  });

  const form = useForm<z.infer<typeof priceSchema>>({
    resolver: zodResolver(priceSchema),
    defaultValues: {
      unitPrice: 0,
      currency: currentCurrency,
      effectiveDate: new Date().toISOString().split('T')[0],
    }
  });

  const onSubmit = (values: z.infer<typeof priceSchema>) => {
    addPriceMutation.mutate({ 
      id: materialId, 
      data: { ...values, effectiveDate: new Date(values.effectiveDate).toISOString() }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
          <History size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">Price History</DialogTitle>
        </DialogHeader>

        {isAdmin && (
          <div className="bg-secondary/50 p-4 border border-border mt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-3">Record New Price</h4>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="unitPrice" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Price</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} className="font-mono h-8 text-sm" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="currency" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Currency</FormLabel>
                      <FormControl><Input {...field} className="font-mono h-8 text-sm uppercase" maxLength={3} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="effectiveDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Effective Date</FormLabel>
                      <FormControl><Input type="date" {...field} className="font-mono h-8 text-sm" /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={addPriceMutation.isPending} className="font-bold uppercase tracking-wider text-xs">
                    {addPriceMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Add Record
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        <div className="mt-4">
          <h4 className="text-xs font-bold uppercase tracking-wider mb-2 text-muted-foreground">Historical Records</h4>
          {isLoading ? (
            <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
          ) : !prices || prices.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground font-medium border border-border bg-card">No prices recorded yet.</div>
          ) : (
            <div className="border border-border bg-card rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-xs uppercase text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-right font-bold text-xs uppercase text-muted-foreground">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {prices.map(p => (
                    <tr key={p.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{format(new Date(p.effectiveDate), 'yyyy-MM-dd')}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency }).format(p.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Materials() {
  const { isAdmin } = useAppAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: materials, isLoading, error } = useListMaterials({ query: { queryKey: getListMaterialsQueryKey() } });
  const { data: brands } = useListBrands({ query: { enabled: open, queryKey: getListBrandsQueryKey() } });

  const createMutation = useCreateMaterial({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
        setOpen(false);
        form.reset();
      }
    }
  });

  const form = useForm<z.infer<typeof materialSchema>>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      brandId: 0,
      description: "",
      type: "Primer",
      packagingSizeL: 20,
      color: "",
      deadStockThreshold: 10,
      currency: "IDR"
    }
  });

  function onSubmit(values: z.infer<typeof materialSchema>) {
    createMutation.mutate({ data: values as MaterialInput });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">Materials</h1>
          <p className="text-muted-foreground font-medium mt-1">Master catalog of paints, hardeners, and thinners.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="font-bold uppercase tracking-wider">
                <Plus className="mr-2 h-4 w-4" /> New Material
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">Create Material</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="brandId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Brand</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : ""}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select Brand" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {brands?.map(b => (
                              <SelectItem key={b.id} value={b.id.toString()} className="font-bold">{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="type" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.values(MaterialType).map(t => (
                              <SelectItem key={t} value={t} className="font-bold">{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Description</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Penguard Clear Sealer" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="color" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Color (Optional)</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g. RAL 9002" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="currency" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Default Currency</FormLabel>
                        <FormControl><Input {...field} className="font-mono uppercase" maxLength={3} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="packagingSizeL" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Pack Size (Liters)</FormLabel>
                        <FormControl><Input type="number" step="0.1" {...field} className="font-mono" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="deadStockThreshold" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Dead Stock Threshold</FormLabel>
                        <FormControl><Input type="number" {...field} className="font-mono" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createMutation.isPending} className="font-bold uppercase tracking-wider px-8">
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create
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
        ) : error || !materials ? (
          <div className="p-8 text-destructive text-center font-bold">Failed to load materials</div>
        ) : materials.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-secondary text-muted-foreground mx-auto flex items-center justify-center mb-4 border border-border">
              <Droplet size={32} />
            </div>
            <h3 className="text-lg font-bold text-foreground">No Materials Found</h3>
            <p className="text-muted-foreground font-medium mt-1">Add materials to track costs and inventory.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  <th className="font-bold">Brand</th>
                  <th className="font-bold">Description</th>
                  <th className="font-bold">Type</th>
                  <th className="font-bold">Color</th>
                  <th className="font-bold text-right">Pack Size</th>
                  <th className="font-bold text-right">Current Price</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {materials.map(mat => (
                  <tr key={mat.id} className="hover:bg-secondary/30 transition-colors group">
                    <td className="font-bold text-foreground py-3 px-4">{mat.brandName}</td>
                    <td className="py-3 px-4">{mat.description}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 bg-secondary text-[10px] font-bold uppercase tracking-wider border border-border">
                        {mat.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">{mat.color || "—"}</td>
                    <td className="py-3 px-4 text-right font-mono">{mat.packagingSizeL} L</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-primary">
                      {mat.currentUnitPrice ? new Intl.NumberFormat('en-US', { style: 'currency', currency: mat.currency }).format(mat.currentUnitPrice) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <PriceHistoryDialog materialId={mat.id} currentCurrency={mat.currency} isAdmin={isAdmin} />
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
