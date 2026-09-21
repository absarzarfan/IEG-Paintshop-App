import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetJobItem, 
  getGetJobItemQueryKey,
  useListJobItemSerialNumbers,
  getListJobItemSerialNumbersQueryKey,
  useCreateJobItemSerialNumbers,
  useDeleteSerialNumber,
  useListMaterials,
  useUpdateJobItem,
  getListJobItemsQueryKey,
  getListMaterialsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, AlertTriangle, Settings2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useAppAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function JobItemDetail() {
  const { id } = useParams<{ id: string }>();
  const jobId = parseInt(id, 10);
  const { isAdmin } = useAppAuth();
  const queryClient = useQueryClient();

  const { data: job, isLoading: jobLoading, error: jobError } = useGetJobItem(jobId, {
    query: { enabled: !!jobId, queryKey: getGetJobItemQueryKey(jobId) }
  });

  const { data: serials, isLoading: serialsLoading } = useListJobItemSerialNumbers(jobId, {
    query: { enabled: !!jobId, queryKey: getListJobItemSerialNumbersQueryKey(jobId) }
  });

  const createSerials = useCreateJobItemSerialNumbers();
  const deleteSerial = useDeleteSerialNumber();

  const [serialMode, setSerialMode] = useState<"range" | "list">("range");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [listValues, setListValues] = useState("");
  const [isSerialDialogOpen, setSerialDialogOpen] = useState(false);

  if (jobLoading) {
    return <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (jobError || !job) {
    return <div className="p-8 text-destructive font-bold flex items-center gap-2"><AlertTriangle /> Failed to load job item</div>;
  }

  const handleAddSerials = async () => {
    try {
      if (serialMode === "range") {
        await createSerials.mutateAsync({
          jobItemId: jobId,
          data: { mode: "range", rangeStart, rangeEnd }
        });
      } else {
        const values = listValues.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        await createSerials.mutateAsync({
          jobItemId: jobId,
          data: { mode: "list", values }
        });
      }
      queryClient.invalidateQueries({ queryKey: getListJobItemSerialNumbersQueryKey(jobId) });
      queryClient.invalidateQueries({ queryKey: getGetJobItemQueryKey(jobId) });
      setSerialDialogOpen(false);
      setRangeStart("");
      setRangeEnd("");
      setListValues("");
    } catch (e) {
      // Error is handled by global toast config if set up, or could add local error state
    }
  };

  const handleDeleteSerial = async (serialId: number) => {
    if (!confirm("Remove this serial number?")) return;
    try {
      await deleteSerial.mutateAsync({ id: serialId });
      queryClient.invalidateQueries({ queryKey: getListJobItemSerialNumbersQueryKey(jobId) });
      queryClient.invalidateQueries({ queryKey: getGetJobItemQueryKey(jobId) });
    } catch (e) {
      // Error handling
    }
  };

  const formatCost = (val: number | null, currency: string | null) => {
    if (val === null) return "—";
    const curr = currency || "IDR";
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(val);
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Link href="/job-items" className="inline-flex items-center text-sm font-bold text-muted-foreground hover:text-primary uppercase tracking-wider mb-4 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Job Items
        </Link>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-4xl font-extrabold font-mono text-primary uppercase tracking-tight">{job.jobNo}</h1>
              <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider border ${
                job.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-secondary text-muted-foreground border-border'
              }`}>
                {job.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xl text-foreground font-medium">{job.description}</p>
          </div>
          {isAdmin && (
            <EditJobItemDialog job={job} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border p-4 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Surface Area</p>
          <p className="text-2xl font-mono font-bold">{job.surfaceAreaM2 !== null ? `${job.surfaceAreaM2} m²` : "—"}</p>
        </div>
        <div className="bg-card border border-border p-4 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Total Primer / Unit</p>
          <p className="text-2xl font-mono font-bold text-blue-600">{job.primerTotalL.toFixed(3)} L</p>
        </div>
        <div className="bg-card border border-border p-4 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Total Topcoat / Unit</p>
          <p className="text-2xl font-mono font-bold text-orange-600">{job.topcoatTotalL.toFixed(3)} L</p>
        </div>
      </div>

      <Tabs defaultValue="targets" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-secondary p-1 h-auto">
          <TabsTrigger value="targets" className="font-bold uppercase tracking-wider py-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-sm">Paint Targets & Costs</TabsTrigger>
          <TabsTrigger value="materials" className="font-bold uppercase tracking-wider py-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-sm">Linked Materials</TabsTrigger>
          <TabsTrigger value="serials" className="font-bold uppercase tracking-wider py-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-sm">Serial Numbers ({job.serialNumberCount})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="targets" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Primer */}
            <div className="bg-card border border-border shadow-sm">
              <div className="bg-blue-50 border-b border-border p-4">
                <h3 className="font-bold text-blue-900 uppercase tracking-wide">Primer Breakdown</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="bg-transparent border-b border-border text-muted-foreground font-bold">Component</th>
                    <th className="bg-transparent border-b border-border text-right text-muted-foreground font-bold">Target (L)</th>
                    <th className="bg-transparent border-b border-border text-right text-muted-foreground font-bold">Est. Cost / Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="font-medium">Base</td>
                    <td className="text-right font-mono">{job.primerBaseL.toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(job.costs.primerCostBase, job.costs.currency)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">Hardener</td>
                    <td className="text-right font-mono">{job.primerHrdL.toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(job.costs.primerCostHrd, job.costs.currency)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">Thinner</td>
                    <td className="text-right font-mono">{job.primerThinnerL.toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(job.costs.primerCostThinner, job.costs.currency)}</td>
                  </tr>
                  <tr className="bg-secondary/30">
                    <td className="font-bold text-primary uppercase tracking-wider">Total Primer</td>
                    <td className="text-right font-mono font-bold text-primary">{job.primerTotalL.toFixed(3)}</td>
                    <td className="text-right font-mono font-bold text-primary">{formatCost(job.costs.primerCostTotal, job.costs.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Topcoat */}
            <div className="bg-card border border-border shadow-sm">
              <div className="bg-orange-50 border-b border-border p-4">
                <h3 className="font-bold text-orange-900 uppercase tracking-wide">Topcoat Breakdown</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="bg-transparent border-b border-border text-muted-foreground font-bold">Component</th>
                    <th className="bg-transparent border-b border-border text-right text-muted-foreground font-bold">Target (L)</th>
                    <th className="bg-transparent border-b border-border text-right text-muted-foreground font-bold">Est. Cost / Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="font-medium">Base</td>
                    <td className="text-right font-mono">{job.topcoatBaseL.toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(job.costs.topcoatCostBase, job.costs.currency)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">Hardener</td>
                    <td className="text-right font-mono">{job.topcoatHrdL.toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(job.costs.topcoatCostHrd, job.costs.currency)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">Thinner</td>
                    <td className="text-right font-mono">{job.topcoatThinnerL.toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(job.costs.topcoatCostThinner, job.costs.currency)}</td>
                  </tr>
                  <tr className="bg-secondary/30">
                    <td className="font-bold text-primary uppercase tracking-wider">Total Topcoat</td>
                    <td className="text-right font-mono font-bold text-primary">{job.topcoatTotalL.toFixed(3)}</td>
                    <td className="text-right font-mono font-bold text-primary">{formatCost(job.costs.topcoatCostTotal, job.costs.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-secondary p-4 border border-border flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Estimated Cost / Unit</p>
              <p className="text-2xl font-mono font-extrabold text-foreground">
                {formatCost((job.costs.primerCostTotal || 0) + (job.costs.topcoatCostTotal || 0), job.costs.currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Overconsumption Threshold</p>
              <p className="text-lg font-mono font-bold text-destructive">{job.overconsumptionThresholdPct ?? 10}%</p>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="materials" className="mt-4">
          <div className="bg-card border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">Linked Materials</h3>
                <p className="text-sm text-muted-foreground font-medium">Map materials to compute exact cost per unit.</p>
              </div>
              {isAdmin && (
                <AssignMaterialsDialog 
                  jobId={jobId} 
                  initialValues={{
                    primerBaseMaterialId: job.primerBaseMaterialId,
                    primerHrdMaterialId: job.primerHrdMaterialId,
                    primerThinnerMaterialId: job.primerThinnerMaterialId,
                    topcoatBaseMaterialId: job.topcoatBaseMaterialId,
                    topcoatHrdMaterialId: job.topcoatHrdMaterialId,
                    topcoatThinnerMaterialId: job.topcoatThinnerMaterialId,
                  }} 
                />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold text-blue-900 bg-blue-50 p-2 border border-border text-center uppercase tracking-wider mb-2">Primer</h4>
                <div className="space-y-2">
                  <MaterialDisplayCard role="Base" materialId={job.primerBaseMaterialId} />
                  <MaterialDisplayCard role="Hardener" materialId={job.primerHrdMaterialId} />
                  <MaterialDisplayCard role="Thinner" materialId={job.primerThinnerMaterialId} />
                </div>
              </div>
              <div>
                <h4 className="font-bold text-orange-900 bg-orange-50 p-2 border border-border text-center uppercase tracking-wider mb-2">Topcoat</h4>
                <div className="space-y-2">
                  <MaterialDisplayCard role="Base" materialId={job.topcoatBaseMaterialId} />
                  <MaterialDisplayCard role="Hardener" materialId={job.topcoatHrdMaterialId} />
                  <MaterialDisplayCard role="Thinner" materialId={job.topcoatThinnerMaterialId} />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="serials" className="mt-4">
          <div className="bg-card border border-border shadow-sm">
            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/20">
              <h3 className="font-bold uppercase tracking-wide">Registered Serial Numbers</h3>
              {isAdmin && (
                <Dialog open={isSerialDialogOpen} onOpenChange={setSerialDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="font-bold uppercase tracking-wider">
                      <Plus className="mr-2 h-4 w-4" /> Add Serials
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">Register Serial Numbers</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 pt-4">
                      <RadioGroup value={serialMode} onValueChange={(v) => setSerialMode(v as "range" | "list")} className="flex gap-6">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="range" id="range" />
                          <Label htmlFor="range" className="font-bold">Numeric Range</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="list" id="list" />
                          <Label htmlFor="list" className="font-bold">Explicit List</Label>
                        </div>
                      </RadioGroup>

                      {serialMode === "range" ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="font-bold">Range Start</Label>
                            <Input value={rangeStart} onChange={e => setRangeStart(e.target.value)} placeholder="e.g. 100" className="font-mono" />
                          </div>
                          <div className="space-y-2">
                            <Label className="font-bold">Range End</Label>
                            <Input value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} placeholder="e.g. 150" className="font-mono" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label className="font-bold">List (comma or newline separated)</Label>
                          <textarea 
                            className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="SN-001&#10;SN-002&#10;SN-003"
                            value={listValues}
                            onChange={e => setListValues(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="flex justify-end pt-2">
                        <Button onClick={handleAddSerials} disabled={createSerials.isPending} className="font-bold uppercase tracking-wider px-8">
                          {createSerials.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Register
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            
            {serialsLoading ? (
              <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : !serials || serials.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground font-medium">No serial numbers registered for this job item yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="bg-transparent border-b border-border text-muted-foreground font-bold">Serial Number</th>
                    <th className="bg-transparent border-b border-border text-muted-foreground font-bold">Registered On</th>
                    {isAdmin && <th className="bg-transparent border-b border-border w-16 text-right"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {serials.map(sn => (
                    <tr key={sn.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="font-mono font-bold">{sn.serialNo}</td>
                      <td className="font-mono text-muted-foreground">{format(new Date(sn.createdAt), 'MMM d, yyyy HH:mm')}</td>
                      {isAdmin && (
                        <td className="text-right p-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteSerial(sn.id)}
                            disabled={deleteSerial.isPending}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MaterialDisplayCard({ role, materialId }: { role: string, materialId: number | null }) {
  const { data: materials } = useListMaterials({ query: { enabled: !!materialId, queryKey: getListMaterialsQueryKey() } });
  const material = materials?.find(m => m.id === materialId);

  return (
    <div className="flex items-center justify-between p-3 border border-border bg-secondary/20">
      <span className="font-bold text-sm text-muted-foreground w-24">{role}</span>
      <div className="flex-1 text-right">
        {material ? (
          <div>
            <p className="font-bold text-foreground text-sm">{material.brandName} - {material.description}</p>
            <p className="text-xs text-muted-foreground font-mono">{material.currentUnitPrice ? new Intl.NumberFormat('en-US', { style: 'currency', currency: material.currency }).format(material.currentUnitPrice) : 'No price set'} / {material.packagingSizeL}L</p>
          </div>
        ) : (
          <span className="text-sm font-medium text-muted-foreground italic">Not assigned</span>
        )}
      </div>
    </div>
  );
}

function AssignMaterialsDialog({ jobId, initialValues }: { jobId: number, initialValues: Record<string, number | null> }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: materials, isLoading } = useListMaterials({ query: { enabled: open, queryKey: getListMaterialsQueryKey() } });
  const updateJobItem = useUpdateJobItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobItemQueryKey(jobId) });
        setOpen(false);
      }
    }
  });

  const [values, setValues] = useState(initialValues);

  const handleSave = () => {
    updateJobItem.mutate({ id: jobId, data: values });
  };

  const getMaterialsByType = (type: string) => {
    return materials?.filter(m => m.type.toLowerCase().includes(type.toLowerCase())) || [];
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="font-bold uppercase tracking-wider" variant="outline">
          Assign Materials
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">Assign Materials</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-bold uppercase tracking-wider text-sm border-b pb-2">Primer</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">Base</Label>
                    <Select value={values.primerBaseMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, primerBaseMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select Base..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {getMaterialsByType('primer').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">Hardener</Label>
                    <Select value={values.primerHrdMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, primerHrdMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select Hardener..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {getMaterialsByType('hardener').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">Thinner</Label>
                    <Select value={values.primerThinnerMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, primerThinnerMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select Thinner..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {getMaterialsByType('thinner').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="font-bold uppercase tracking-wider text-sm border-b pb-2">Topcoat</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">Base</Label>
                    <Select value={values.topcoatBaseMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, topcoatBaseMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select Base..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {getMaterialsByType('topcoat').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">Hardener</Label>
                    <Select value={values.topcoatHrdMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, topcoatHrdMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select Hardener..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {getMaterialsByType('hardener').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">Thinner</Label>
                    <Select value={values.topcoatThinnerMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, topcoatThinnerMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select Thinner..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {getMaterialsByType('thinner').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleSave} disabled={updateJobItem.isPending} className="font-bold uppercase tracking-wider px-8">
                {updateJobItem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Mapping
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditJobItemDialog({ job }: { job: any }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const updateJobItem = useUpdateJobItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobItemQueryKey(job.id) });
        queryClient.invalidateQueries({ queryKey: getListJobItemsQueryKey() });
        setOpen(false);
      }
    }
  });

  const formSchema = z.object({
    jobNo: z.string().min(1),
    description: z.string().min(1),
    surfaceAreaM2: z.coerce.number().optional(),
    primerBaseL: z.coerce.number().min(0),
    primerHrdL: z.coerce.number().min(0),
    primerThinnerL: z.coerce.number().min(0),
    topcoatBaseL: z.coerce.number().min(0),
    topcoatHrdL: z.coerce.number().min(0),
    topcoatThinnerL: z.coerce.number().min(0),
    overconsumptionThresholdPct: z.coerce.number().optional(),
    isActive: z.boolean()
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobNo: job.jobNo,
      description: job.description,
      surfaceAreaM2: job.surfaceAreaM2 ?? undefined,
      primerBaseL: job.primerBaseL,
      primerHrdL: job.primerHrdL,
      primerThinnerL: job.primerThinnerL,
      topcoatBaseL: job.topcoatBaseL,
      topcoatHrdL: job.topcoatHrdL,
      topcoatThinnerL: job.topcoatThinnerL,
      overconsumptionThresholdPct: job.overconsumptionThresholdPct ?? undefined,
      isActive: job.isActive
    }
  });

  const onSubmit = (values: any) => {
    updateJobItem.mutate({ id: job.id, data: values });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="font-bold uppercase tracking-wider border-border hover:bg-secondary">
          <Settings2 className="mr-2 h-4 w-4" /> Edit Job Item
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">Edit Job Item</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="jobNo" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Job No</FormLabel>
                  <FormControl><Input {...field} className="font-mono" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="surfaceAreaM2" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Surface Area (m²)</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} className="font-mono" /></FormControl>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-bold">Description</FormLabel>
                <FormControl><Input {...field} /></FormControl>
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

            <div className="grid grid-cols-2 gap-4 items-end">
              <FormField control={form.control} name="overconsumptionThresholdPct" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Overconsumption Threshold (%)</FormLabel>
                  <FormControl><Input type="number" {...field} className="font-mono" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="font-bold">Active Status</FormLabel>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={updateJobItem.isPending} className="font-bold uppercase tracking-wider px-8">
                {updateJobItem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
