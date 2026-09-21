import { useState } from "react";
import { 
  useListBrands, 
  getListBrandsQueryKey,
  useCreateBrand,
  useUpdateBrand,
  BrandInput
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings, Plus } from "lucide-react";
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

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export function Brands() {
  const { isAdmin } = useAppAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" }
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createMutation.mutate({ data: values as BrandInput });
  }

  const toggleStatus = async (id: number, isActive: boolean) => {
    if (!isAdmin) return;
    await updateMutation.mutateAsync({ id, data: { isActive } });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">Brands</h1>
          <p className="text-muted-foreground font-medium mt-1">Approved material manufacturers.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="font-bold uppercase tracking-wider">
                <Plus className="mr-2 h-4 w-4" /> Add Brand
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">Add Brand</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Brand Name</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Jotun" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end pt-2">
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

      <div className="bg-card border border-border shadow-sm">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : error || !brands ? (
          <div className="p-8 text-destructive text-center font-bold">Failed to load brands</div>
        ) : brands.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-secondary text-muted-foreground mx-auto flex items-center justify-center mb-4 border border-border">
              <Settings size={32} />
            </div>
            <h3 className="text-lg font-bold text-foreground">No Brands Found</h3>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th className="font-bold">Brand Name</th>
                <th className="font-bold w-32 text-center">Status</th>
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
                        brand.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-secondary text-muted-foreground border-border'
                      }`}>
                        {brand.isActive ? "Active" : "Inactive"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
