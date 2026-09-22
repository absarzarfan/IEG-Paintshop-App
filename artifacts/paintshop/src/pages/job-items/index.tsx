import { useState, useMemo } from "react";
import { Link } from "wouter";
import { 
  useListJobItems, 
  useCreateJobItem, 
  getListJobItemsQueryKey,
  JobItemInput
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Loader2, PaintBucket, AlertTriangle } from "lucide-react";
import { useAppAuth } from "@/lib/auth";
import { useDebounce } from "@/hooks/use-debounce";

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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
  jobNo: z.string().min(1, "Job No is required"),
  description: z.string().min(1, "Description is required"),
  surfaceAreaM2: z.coerce.number().optional(),
  primerBaseL: z.coerce.number().min(0),
  primerHrdL: z.coerce.number().min(0),
  primerThinnerL: z.coerce.number().min(0),
  topcoatBaseL: z.coerce.number().min(0),
  topcoatHrdL: z.coerce.number().min(0),
  topcoatThinnerL: z.coerce.number().min(0),
  overconsumptionThresholdPct: z.coerce.number().optional(),
});

export function JobItems() {
  const { isAdmin } = useAppAuth();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: jobItems, isLoading, error } = useListJobItems(
    { search: debouncedSearch || undefined }, 
    { query: { queryKey: [...getListJobItemsQueryKey(), debouncedSearch] } }
  );
  
  const createMutation = useCreateJobItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobItemsQueryKey() });
        setOpen(false);
      }
    }
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobNo: "",
      description: "",
      primerBaseL: 0,
      primerHrdL: 0,
      primerThinnerL: 0,
      topcoatBaseL: 0,
      topcoatHrdL: 0,
      topcoatThinnerL: 0,
    }
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createMutation.mutate({ data: values as JobItemInput });
  }

  // Removed client-side filteredItems; using server-side search
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">Job Items</h1>
          <p className="text-muted-foreground font-medium mt-1">Katalog job dan target konsumsi cat per unit.</p>
        </div>

        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="font-bold uppercase tracking-wider">
                <Plus className="mr-2 h-4 w-4" /> Job Item Baru
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-extrabold text-xl uppercase tracking-tight">Buat Job Item</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="jobNo" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Job No</FormLabel>
                        <FormControl><Input {...field} className="font-mono" placeholder="e.g. JB-2024-001" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="surfaceAreaM2" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Surface Area (m²)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} className="font-mono" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Description</FormLabel>
                      <FormControl><Input {...field} placeholder="Part or unit description" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="space-y-4">
                    <h4 className="font-bold uppercase tracking-wider text-sm border-b pb-2">Primer Targets (Liters/Unit)</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField control={form.control} name="primerBaseL" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Base</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="primerHrdL" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Hardener</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="primerThinnerL" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Thinner</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold uppercase tracking-wider text-sm border-b pb-2">Topcoat Targets (Liters/Unit)</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField control={form.control} name="topcoatBaseL" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Base</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="topcoatHrdL" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Hardener</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="topcoatThinnerL" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Thinner</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>

                  <FormField control={form.control} name="overconsumptionThresholdPct" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Overconsumption Threshold (%)</FormLabel>
                      <FormControl><Input type="number" {...field} placeholder="Default: 10" className="font-mono" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createMutation.isPending} className="font-bold uppercase tracking-wider px-8">
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="bg-card border border-border shadow-sm flex flex-col">
        <div className="p-4 border-b border-border bg-secondary/20">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by Job No or Description..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error || !jobItems ? (
          <div className="p-8 text-center text-destructive flex items-center justify-center gap-2 font-bold">
            <AlertTriangle className="h-5 w-5" /> Failed to load job items
          </div>
        ) : jobItems.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-secondary text-muted-foreground mx-auto flex items-center justify-center mb-4 border border-border">
              <PaintBucket size={32} />
            </div>
            <h3 className="text-lg font-bold text-foreground">No Job Items Found</h3>
            <p className="text-muted-foreground font-medium mt-1">
              {search ? "No matches for your search." : "Create a job item to establish paint targets."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  <th className="font-bold">Job No</th>
                  <th className="font-bold">Description</th>
                  <th className="font-bold text-right">Primer Total (L)</th>
                  <th className="font-bold text-right">Topcoat Total (L)</th>
                  <th className="font-bold text-right">Serials</th>
                  <th className="font-bold text-center">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {jobItems.map(item => (
                  <tr key={item.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="font-mono font-extrabold tracking-tight text-primary">{item.jobNo}</td>
                    <td>{item.description}</td>
                    <td className="font-mono text-right">{item.primerTotalL.toFixed(3)}</td>
                    <td className="font-mono text-right">{item.topcoatTotalL.toFixed(3)}</td>
                    <td className="font-mono text-right">{item.serialNumberCount}</td>
                    <td className="text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                        item.isActive
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-red-100 text-red-800 border-red-300'
                      }`}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link href={`/job-items/${item.id}`} className="inline-flex items-center justify-center h-8 px-3 text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground border border-primary hover:bg-primary hover:text-primary-foreground hover:border-primary">
                        Details
                      </Link>
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
