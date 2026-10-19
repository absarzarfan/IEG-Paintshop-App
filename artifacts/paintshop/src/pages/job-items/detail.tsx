import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { 
  useGetJobItem, 
  getGetJobItemQueryKey,
  useListJobItemSerialNumbers,
  getListJobItemSerialNumbersQueryKey,
  useCreateJobItemSerialNumbers,
  useDeleteSerialNumber,
  useListMaterials,
  useUpdateJobItem,
  useDeleteJobItem,
  getListJobItemsQueryKey,
  getListJobWorkflowQueryKey,
  getGetDashboardSummaryQueryKey,
  getListMaterialsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, AlertTriangle, Settings2, Trash2, ClipboardPenLine } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useAppAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
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
  const { user, isAdmin } = useAppAuth();
  const { t, language } = useLanguage();
  const canRegisterSerials = isAdmin || user?.role === "painter";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: job, isLoading: jobLoading, error: jobError } = useGetJobItem(jobId, {
    query: { enabled: !!jobId, queryKey: getGetJobItemQueryKey(jobId) }
  });

  const { data: serials, isLoading: serialsLoading } = useListJobItemSerialNumbers(jobId, {
    query: { enabled: !!jobId, queryKey: getListJobItemSerialNumbersQueryKey(jobId) }
  });

  const createSerials = useCreateJobItemSerialNumbers();
  const deleteSerial = useDeleteSerialNumber();
  const deleteJobItem = useDeleteJobItem();

  const [serialMode, setSerialMode] = useState<"range" | "list">("range");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [listValues, setListValues] = useState("");
  const [isSerialDialogOpen, setSerialDialogOpen] = useState(false);
  const [serialError, setSerialError] = useState("");

  if (jobLoading) {
    return <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (jobError || !job) {
    return <div className="p-8 text-destructive font-bold flex items-center gap-2"><AlertTriangle /> {t("loadJobError")}</div>;
  }

  const handleAddSerials = async () => {
    setSerialError("");
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
      setSerialError(`${e instanceof Error ? e.message : t("registrationFailed")} ${t("duplicateSerialHint")}`);
    }
  };

  const handleDeleteSerial = async (serialId: number) => {
    if (!confirm(t("removeSerialConfirm"))) return;
    try {
      await deleteSerial.mutateAsync({ id: serialId });
      queryClient.invalidateQueries({ queryKey: getListJobItemSerialNumbersQueryKey(jobId) });
      queryClient.invalidateQueries({ queryKey: getGetJobItemQueryKey(jobId) });
    } catch (e) {
      // Error handling
    }
  };

  const handleDeleteJobItem = async () => {
    if (!confirm(`${t("deleteJobConfirm")} (${job.jobNo})`)) return;
    try {
      await deleteJobItem.mutateAsync({ id: jobId });
      queryClient.invalidateQueries({ queryKey: getListJobItemsQueryKey() });
      setLocation("/job-items");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("jobReferenced"));
    }
  };

  const formatCost = (val: number | null, currency: string | null) => {
    if (val === null) return "—";
    const curr = currency || "IDR";
    return new Intl.NumberFormat(language === "id" ? "id-ID" : "en-US", { style: 'currency', currency: curr }).format(val);
  };
  const orderMultiplier = job.targetBasis === "per_unit" ? job.orderQuantity : 1;
  const orderLiters = (value: number) => value * orderMultiplier;
  const orderCost = (value: number | null) => value === null ? null : value * orderMultiplier;

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Link href="/job-items" className="inline-flex items-center text-sm font-bold text-muted-foreground hover:text-primary uppercase tracking-wider mb-4 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("jobBack")}
        </Link>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-4xl font-extrabold font-mono text-primary uppercase tracking-tight">{job.jobNo}</h1>
              <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider border ${
              job.isActive
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-red-100 text-red-800 border-red-300'
              }`}>
                {job.isActive ? t("activeStatus") : t("inactiveStatus")}
              </span>
            </div>
            <p className="text-xl text-foreground font-medium">{job.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/paint-usage/new?jobItemId=${job.id}`} className="inline-flex h-10 items-center justify-center border border-border bg-card px-4 text-sm font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-secondary" data-testid={`link-record-paint-usage-${job.id}`}>
              <ClipboardPenLine className="mr-2 h-4 w-4 text-primary" /> {t("recordPaintUsage")}
            </Link>
            {isAdmin && (
              <>
                <EditJobItemDialog job={job} />
                <CustomPaintStagesDialog job={job} />
                <Button
                  variant="outline"
                  className="h-10 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={handleDeleteJobItem}
                   disabled={deleteJobItem.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> {t("deleteJob")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border p-4 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{t("surfaceArea")}</p>
          <p className="text-2xl font-mono font-bold">{job.surfaceAreaM2 !== null ? `${job.surfaceAreaM2} m²` : "—"}</p>
        </div>
        <div className="bg-secondary border-secondary p-4 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary-foreground mb-1">{t("totalPrimerOrder")}</p>
          <p className="text-2xl font-mono font-bold text-primary">{orderLiters(job.primerTotalL).toFixed(3)} L</p>
        </div>
        <div className="bg-secondary border-secondary p-4 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary-foreground mb-1">{t("totalTopcoatOrder")}</p>
          <p className="text-2xl font-mono font-bold text-primary">{orderLiters(job.topcoatTotalL).toFixed(3)} L</p>
        </div>
      </div>

      <Tabs defaultValue="targets" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-secondary p-1 h-auto">
          <TabsTrigger value="targets" className="text-white font-bold uppercase tracking-wider py-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-sm">{t("targetsTab")}</TabsTrigger>
          <TabsTrigger value="materials" className="text-white font-bold uppercase tracking-wider py-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-sm">{t("materialsTab")}</TabsTrigger>
          <TabsTrigger value="serials" className="text-white font-bold uppercase tracking-wider py-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-sm">{t("serialsTab")} ({job.serialNumberCount})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="targets" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Primer */}
            <div className="bg-card border border-border shadow-sm">
              <div className="bg-secondary border-b border-secondary p-4">
                 <h3 className="font-bold text-secondary-foreground uppercase tracking-wide">{t("primerBreakdown")}</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="bg-transparent border-b border-border text-muted-foreground font-bold">{t("component")}</th>
                    <th className="bg-transparent border-b border-border text-right text-muted-foreground font-bold">{t("targetOrderL")}</th>
                    <th className="bg-transparent border-b border-border text-right text-muted-foreground font-bold">{t("estimatedCostOrder")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="font-medium">{t("base")}</td>
                    <td className="text-right font-mono">{orderLiters(job.primerBaseL).toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(orderCost(job.costs.primerCostBase), job.costs.currency)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">{t("hardener")}</td>
                    <td className="text-right font-mono">{orderLiters(job.primerHrdL).toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(orderCost(job.costs.primerCostHrd), job.costs.currency)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">{t("thinner")}</td>
                    <td className="text-right font-mono">{orderLiters(job.primerThinnerL).toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(orderCost(job.costs.primerCostThinner), job.costs.currency)}</td>
                  </tr>
                  <tr className="bg-secondary">
                    <td className="font-bold text-primary uppercase tracking-wider">{t("totalPrimer")}</td>
                    <td className="text-right font-mono font-bold text-primary">{orderLiters(job.primerTotalL).toFixed(3)}</td>
                    <td className="text-right font-mono font-bold text-primary">{formatCost(orderCost(job.costs.primerCostTotal), job.costs.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Topcoat */}
            <div className="bg-card border border-border shadow-sm">
              <div className="bg-secondary border-b border-secondary p-4">
                 <h3 className="font-bold text-secondary-foreground uppercase tracking-wide">{t("topcoatBreakdown")}</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="bg-transparent border-b border-border text-muted-foreground font-bold">{t("component")}</th>
                    <th className="bg-transparent border-b border-border text-right text-muted-foreground font-bold">{t("targetOrderL")}</th>
                    <th className="bg-transparent border-b border-border text-right text-muted-foreground font-bold">{t("estimatedCostOrder")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="font-medium">{t("base")}</td>
                    <td className="text-right font-mono">{orderLiters(job.topcoatBaseL).toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(orderCost(job.costs.topcoatCostBase), job.costs.currency)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">{t("hardener")}</td>
                    <td className="text-right font-mono">{orderLiters(job.topcoatHrdL).toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(orderCost(job.costs.topcoatCostHrd), job.costs.currency)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">{t("thinner")}</td>
                    <td className="text-right font-mono">{orderLiters(job.topcoatThinnerL).toFixed(3)}</td>
                    <td className="text-right font-mono">{formatCost(orderCost(job.costs.topcoatCostThinner), job.costs.currency)}</td>
                  </tr>
                  <tr className="bg-secondary">
                    <td className="font-bold text-primary uppercase tracking-wider">{t("totalTopcoat")}</td>
                    <td className="text-right font-mono font-bold text-primary">{orderLiters(job.topcoatTotalL).toFixed(3)}</td>
                    <td className="text-right font-mono font-bold text-primary">{formatCost(orderCost(job.costs.topcoatCostTotal), job.costs.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-secondary p-4 border border-border flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white">{t("costOrder")}</p>
              <p className="text-2xl font-mono font-extrabold text-primary">
                {formatCost(orderCost((job.costs.primerCostTotal || 0) + (job.costs.topcoatCostTotal || 0)), job.costs.currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-widest text-white">{t("overconsumptionThreshold")}</p>
              <p className="text-[1.46rem] font-mono font-bold text-destructive">{job.overconsumptionThresholdPct ?? 10}%</p>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="materials" className="mt-4">
          <div className="bg-card border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">{t("linkedMaterialsTitle")}</h3>
                <p className="text-sm text-muted-foreground font-medium">{t("linkedMaterialMap")}</p>
              </div>
              {canRegisterSerials && (
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
                 <h4 className="font-bold text-secondary-foreground bg-secondary p-2 border border-border text-center uppercase tracking-wider mb-2">{t("primerBase").split(" ")[0]}</h4>
                <div className="space-y-2">
                  <MaterialDisplayCard role="Base" materialId={job.primerBaseMaterialId} />
                  <MaterialDisplayCard role="Hardener" materialId={job.primerHrdMaterialId} />
                  <MaterialDisplayCard role="Thinner" materialId={job.primerThinnerMaterialId} />
                </div>
              </div>
              <div>
                 <h4 className="font-bold text-foreground bg-primary/20 p-2 border border-border text-center uppercase tracking-wider mb-2">{t("topcoat")}</h4>
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
              <h3 className="font-bold uppercase tracking-wide">{t("registered")}</h3>
              {canRegisterSerials && (
                <Dialog open={isSerialDialogOpen} onOpenChange={setSerialDialogOpen}>
                  <DialogTrigger asChild>
                      <Button size="sm" className="font-bold uppercase tracking-wider" data-testid={`button-add-serials-${job.id}`}>
                       <Plus className="mr-2 h-4 w-4" /> {t("register")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                     <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">{t("register")} {t("serial")}</DialogTitle>
                    </DialogHeader>
                      <div className="space-y-6 pt-4">
                        <p className="text-sm text-muted-foreground">{t("duplicate")}</p>
                       {serialError && <p className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">{serialError}</p>}
                      <RadioGroup value={serialMode} onValueChange={(v) => setSerialMode(v as "range" | "list")} className="flex gap-6">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="range" id="range" />
                           <Label htmlFor="range" className="font-bold">{t("range")}</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="list" id="list" />
                           <Label htmlFor="list" className="font-bold">{t("list")}</Label>
                        </div>
                      </RadioGroup>

                      {serialMode === "range" ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <Label className="font-bold">{t("start")}</Label>
                            <Input value={rangeStart} onChange={e => setRangeStart(e.target.value)} placeholder={`${t("example")}: 100`} className="font-mono" />
                          </div>
                          <div className="space-y-2">
                              <Label className="font-bold">{t("end")}</Label>
                            <Input value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} placeholder={`${t("example")}: 150`} className="font-mono" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                            <Label className="font-bold">{t("serialListHint")}</Label>
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
                          {t("register")}
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
              <div className="p-12 text-center text-muted-foreground font-medium">{t("noSerialsForJob")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="bg-transparent border-b border-border text-muted-foreground font-bold">{t("serial")}</th>
                    <th className="bg-transparent border-b border-border text-muted-foreground font-bold">{t("registeredOn")}</th>
                    {isAdmin && <th className="bg-transparent border-b border-border w-16 text-right"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {serials.map(sn => (
                    <tr key={sn.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="font-mono font-bold">{sn.serialNo}</td>
                       <td className="font-mono text-muted-foreground">{new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(sn.createdAt))}</td>
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
  const { t, language } = useLanguage();
  const { data: materials } = useListMaterials({ query: { enabled: !!materialId, queryKey: getListMaterialsQueryKey() } });
  const material = materials?.find(m => m.id === materialId);

  return (
    <div className="flex items-center justify-between p-3 border border-border bg-secondary/20">
       <span className="font-bold text-sm text-muted-foreground w-24">{role === "Hardener" ? t("hardener") : role === "Thinner" ? t("thinner") : t("base")}</span>
      <div className="flex-1 text-right">
        {material ? (
          <div>
            <p className="font-bold text-foreground text-sm">{material.brandName} - {material.description}</p>
            <p className="text-xs text-muted-foreground font-mono">{material.currentUnitPrice ? new Intl.NumberFormat(language === "id" ? "id-ID" : "en-US", { style: 'currency', currency: material.currency }).format(material.currentUnitPrice) : t("priceNoSet")} / {material.packagingSizeL}L</p>
          </div>
        ) : (
          <span className="text-sm font-medium text-muted-foreground italic">{t("notAssigned")}</span>
        )}
      </div>
    </div>
  );
}

function AssignMaterialsDialog({ jobId, initialValues }: { jobId: number, initialValues: Record<string, number | null> }) {
  const { t } = useLanguage();
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
          {t("assignMaterials")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">{t("assignMaterials")}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-bold uppercase tracking-wider text-sm border-b pb-2">{t("primer")}</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">{t("base")}</Label>
                    <Select value={values.primerBaseMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, primerBaseMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("selectBase")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none")}</SelectItem>
                        {getMaterialsByType('primer').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">{t("hardener")}</Label>
                    <Select value={values.primerHrdMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, primerHrdMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("selectHardener")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none")}</SelectItem>
                        {getMaterialsByType('hardener').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">{t("thinner")}</Label>
                    <Select value={values.primerThinnerMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, primerThinnerMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("selectThinner")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none")}</SelectItem>
                        {getMaterialsByType('thinner').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="font-bold uppercase tracking-wider text-sm border-b pb-2">{t("topcoat")}</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">{t("base")}</Label>
                    <Select value={values.topcoatBaseMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, topcoatBaseMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("selectBase")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none")}</SelectItem>
                        {getMaterialsByType('topcoat').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">{t("hardener")}</Label>
                    <Select value={values.topcoatHrdMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, topcoatHrdMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("selectHardener")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none")}</SelectItem>
                        {getMaterialsByType('hardener').map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.brandName} - {m.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground">{t("thinner")}</Label>
                    <Select value={values.topcoatThinnerMaterialId?.toString() || ""} onValueChange={v => setValues(prev => ({...prev, topcoatThinnerMaterialId: parseInt(v) || null}))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("selectThinner")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none")}</SelectItem>
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
                {t("saveMapping")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomPaintStagesDialog({ job }: { job: any }) {
  const { user } = useAppAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState<Array<{ id: string; name: string; coatType: "primer" | "topcoat"; targetLitersTotal: number }>>([]);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const updateJobItem = useUpdateJobItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobItemQueryKey(job.id) });
        queryClient.invalidateQueries({ queryKey: getListJobItemsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListJobWorkflowQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setOpen(false);
      },
      onError: (error) => setError(error instanceof Error ? error.message : t("stageSaveError")),
    },
  });

  useEffect(() => {
    if (open) {
      setStages(job.customPaintStages ?? []);
      setError("");
    }
  }, [open, job.customPaintStages]);

  if (user?.role !== "admin") return null;

  const save = () => {
    if (stages.some((stage) => !stage.name.trim() || !Number.isFinite(stage.targetLitersTotal) || stage.targetLitersTotal < 0)) {
      setError(t("stageValidationError"));
      return;
    }
    updateJobItem.mutate({
      id: job.id,
      data: {
        customPaintStages: stages.map((stage) => ({
          ...stage,
          name: stage.name.trim(),
          targetLitersTotal: Number(stage.targetLitersTotal),
        })),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="font-bold uppercase tracking-wider">{t("paintStages")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase">{t("paintStages")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("paintStagesHint")}</p>
          <p className="text-xs font-bold">{t("targetLitersTotal")} (L / {job.targetBasis === "order_total" ? t("wholeOrder") : t("perUnit")})</p>
        </DialogHeader>
        <div className="space-y-3">
          {stages.length === 0 && <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">{t("noStages")}</p>}
          {stages.map((stage, index) => (
            <div className="grid gap-3 border border-border bg-secondary/20 p-3 sm:grid-cols-[1fr_150px_140px_auto]" key={stage.id}>
              <Input
                value={stage.name}
                maxLength={100}
                placeholder={t("stageName")}
                aria-label={t("stageName")}
                onChange={(event) => setStages((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}
              />
              <select
                className="h-10 border border-input bg-background px-3 text-sm"
                aria-label={t("paintType")}
                value={stage.coatType}
                onChange={(event) => setStages((current) => current.map((item, i) => i === index ? { ...item, coatType: event.target.value as "primer" | "topcoat" } : item))}
              >
                <option value="primer">{t("stagePrimer")}</option>
                <option value="topcoat">{t("stageTopcoat")}</option>
              </select>
              <Input
                type="number"
                min="0"
                step="0.05"
                value={stage.targetLitersTotal}
                aria-label={`${t("targetLitersTotal")} (${job.targetBasis === "order_total" ? t("wholeOrder") : t("perUnit")})`}
                onChange={(event) => setStages((current) => current.map((item, i) => i === index ? { ...item, targetLitersTotal: Number(event.target.value) } : item))}
              />
              <Button type="button" variant="ghost" size="icon" aria-label={t("delete")} onClick={() => setStages((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setStages((current) => [...current, { id: crypto.randomUUID(), name: "", coatType: "topcoat", targetLitersTotal: 0 }])}
          >
            <Plus className="mr-2 h-4 w-4" /> {t("addStage")}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button type="button" disabled={updateJobItem.isPending} onClick={save}>{updateJobItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("saveStages")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditJobItemDialog({ job }: { job: any }) {
  const { t } = useLanguage();
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
          <Settings2 className="mr-2 h-4 w-4" /> {t("editJobItem")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-extrabold uppercase tracking-tight text-xl">{t("editJobItem")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="jobNo" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">{t("jobNumberLabel")}</FormLabel>
                  <FormControl><Input {...field} className="font-mono" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="surfaceAreaM2" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">{t("surfaceAreaUnit")}</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} className="font-mono" /></FormControl>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-bold">{t("descriptionLabel")}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
              </FormItem>
            )} />

            <div className="space-y-4">
              <h4 className="font-bold uppercase tracking-wider text-sm border-b pb-2">{t("primerTargets")}</h4>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="primerBaseL" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">{t("base")}</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="primerHrdL" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">{t("hardener")}</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="primerThinnerL" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">{t("thinner")}</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                )} />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold uppercase tracking-wider text-sm border-b pb-2">{t("topcoatTargets")}</h4>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="topcoatBaseL" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">{t("base")}</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="topcoatHrdL" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">{t("hardener")}</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="topcoatThinnerL" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs">{t("thinner")}</FormLabel><FormControl><Input type="number" step="0.001" {...field} className="font-mono" /></FormControl></FormItem>
                )} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
              <FormField control={form.control} name="overconsumptionThresholdPct" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">{t("thresholdPercent")}</FormLabel>
                  <FormControl><Input type="number" {...field} className="font-mono" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="font-bold">{t("activeStatusLabel")}</FormLabel>
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
                {t("saveChanges")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
