import { useState } from "react";
import { 
  useListColors, 
  getListColorsQueryKey,
  useCreateColor,
  ColorInput
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Palette, Plus } from "lucide-react";
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

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  hexCode: z.string().optional().refine(val => !val || /^#[0-9A-F]{6}$/i.test(val), "Must be a valid hex code (e.g. #FF0000)"),
});

export function Colors() {
  const { isAdmin } = useAppAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", hexCode: "" }
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createMutation.mutate({ data: values as ColorInput });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">Colors</h1>
          <p className="text-muted-foreground font-medium mt-1">Standardized paint colors.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="font-bold uppercase tracking-wider">
                <Plus className="mr-2 h-4 w-4" /> Add Color
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">Add Color</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Color Name</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Traffic Yellow" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="hexCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Hex Code (Optional)</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. #FBB900" className="font-mono uppercase" /></FormControl>
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
        ) : error || !colors ? (
          <div className="p-8 text-destructive text-center font-bold">Failed to load colors</div>
        ) : colors.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-secondary text-muted-foreground mx-auto flex items-center justify-center mb-4 border border-border">
              <Palette size={32} />
            </div>
            <h3 className="text-lg font-bold text-foreground">No Colors Found</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
            {colors.map(color => (
              <div key={color.id} className="flex items-center gap-4 p-3 border border-border bg-white shadow-sm hover:border-primary/50 transition-colors">
                <div 
                  className="w-10 h-10 rounded shadow-sm border border-black/10 shrink-0" 
                  style={{ backgroundColor: color.hexCode || '#CCCCCC' }}
                />
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground truncate flex items-center gap-2">
                    {color.name}
                    {!color.isActive && <span className="text-[10px] bg-secondary text-muted-foreground px-1 border uppercase">Inactive</span>}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground uppercase">{color.hexCode || 'No HEX'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
