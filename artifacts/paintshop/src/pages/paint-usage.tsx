import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  getGetJobItemQueryKey,
  getGetPaintUsageQueryKey,
  getGetDashboardSummaryQueryKey,
  getListJobWorkflowQueryKey,
  getListPaintUsagePhotosQueryKey,
  getListJobItemSerialNumbersQueryKey,
  getListJobItemsQueryKey,
  getListMaterialsQueryKey,
  getListStockMovementsQueryKey,
  getListStockSummaryQueryKey,
  getListPaintUsageQueryKey,
  PaintUsageInput,
  PaintUsageUpdate,
  useCreatePaintUsage,
  useCreatePaintUsagePhoto,
  useGetPaintUsage,
  useListJobItemSerialNumbers,
  useListJobItems,
  useListMaterials,
  useListPaintUsage,
  useListPaintUsagePhotos,
  useRequestPaintUsagePhotoUploadUrl,
  useUpdatePaintUsage,
} from "@workspace/api-client-react";
import type { PaintUsage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardPenLine,
  Edit3,
  Filter,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { useAppAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";

const actualFields = [
  { name: "primerBaseActualL", label: "primerBase" },
  { name: "primerHrdActualL", label: "hardener" },
  { name: "primerThinnerActualL", label: "thinner" },
  { name: "topcoatBaseActualL", label: "topcoatBase" },
  { name: "topcoatHrdActualL", label: "hardener" },
  { name: "topcoatThinnerActualL", label: "thinner" },
] as const;

const usageSchema = (t: (key: string) => string) => z.object({
  jobItemId: z.coerce.number().int().positive(t("selectJobItem")),
  serialNumberId: z.coerce.number().int().positive(t("selectSerialNumber")),
  usageDate: z.string().min(1, t("usageDateRequired")),
  shift: z.string().min(1, t("required")).max(50),
  category: z.enum(["preparation", "blasting", "washing", "cleaning", "finishing"]),
  primerBaseActualL: z.coerce.number().min(0, t("nonNegative")),
  primerHrdActualL: z.coerce.number().min(0, t("nonNegative")),
  primerThinnerActualL: z.coerce.number().min(0, t("nonNegative")),
  topcoatBaseActualL: z.coerce.number().min(0, t("nonNegative")),
  topcoatHrdActualL: z.coerce.number().min(0, t("nonNegative")),
  topcoatThinnerActualL: z.coerce.number().min(0, t("nonNegative")),
  notes: z.string().nullable(),
});

const editSchema = (t: (key: string) => string) => usageSchema(t).omit({ jobItemId: true, serialNumberId: true });
type UsageFormValues = z.infer<ReturnType<typeof usageSchema>>;
type EditFormValues = z.infer<ReturnType<typeof editSchema>>;

function formatLiters(value: number) {
  return `${value.toFixed(3)} L`;
}

function formatDate(value: string, language: "id" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function apiMessage(_error: unknown, t: (key: string) => string) {
  return t("usageSaveError");
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "blue" | "orange" | "red" }) {
  const toneClass = {
    neutral: "text-foreground",
    blue: "text-foreground",
    orange: "text-primary",
    red: "text-destructive",
  }[tone];
  return (
    <div className="border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function VarianceBadge({ over }: { over: boolean }) {
  return over ? (
    <Badge variant="destructive" data-testid="status-overconsumption">
      <TriangleAlert className="mr-1 h-3 w-3" /> Overconsumption
    </Badge>
  ) : (
    <Badge variant="outline" className="border-primary/50 bg-primary/15 text-foreground" data-testid="status-within-threshold">
      <CheckCircle2 className="mr-1 h-3 w-3" /> Within Threshold
    </Badge>
  );
}

function UsageForm({
  mode,
  usage,
  initialJobId = 0,
  onComplete,
}: {
  mode: "create" | "edit";
  usage?: PaintUsage;
  initialJobId?: number;
  onComplete: (record: PaintUsage) => void;
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState("");
  const [volumeUnit, setVolumeUnit] = useState<"L" | "mL">("L");
  const [customActuals, setCustomActuals] = useState<Record<string, number>>(() =>
    Object.fromEntries((usage?.customPaintActuals ?? []).map((actual) => [actual.stageId, actual.actualLiters])),
  );
  const { t, language } = useLanguage();
  const isEdit = mode === "edit";

  const { data: jobs, isLoading: jobsLoading, error: jobsError } = useListJobItems(
    { search: undefined },
    { query: { queryKey: getListJobItemsQueryKey() } },
  );
  const { data: materials } = useListMaterials({ query: { queryKey: getListMaterialsQueryKey() } });
  const defaultJobId = usage?.jobItemId ?? initialJobId;
  const form = useForm<UsageFormValues | EditFormValues>({
    resolver: zodResolver(isEdit ? editSchema(t) : usageSchema(t)),
    defaultValues: isEdit
      ? {
          usageDate: usage?.usageDate?.slice(0, 10) ?? "",
          shift: usage?.shift ?? "",
          category: usage?.category ?? "preparation",
          primerBaseActualL: usage?.primerBaseActualL ?? 0,
          primerHrdActualL: usage?.primerHrdActualL ?? 0,
          primerThinnerActualL: usage?.primerThinnerActualL ?? 0,
          topcoatBaseActualL: usage?.topcoatBaseActualL ?? 0,
          topcoatHrdActualL: usage?.topcoatHrdActualL ?? 0,
          topcoatThinnerActualL: usage?.topcoatThinnerActualL ?? 0,
          notes: usage?.notes ?? null,
        }
      : {
          jobItemId: defaultJobId,
          serialNumberId: 0,
          usageDate: new Date().toISOString().slice(0, 10),
          shift: "Shift 1",
          category: "preparation",
          primerBaseActualL: 0,
          primerHrdActualL: 0,
          primerThinnerActualL: 0,
          topcoatBaseActualL: 0,
          topcoatHrdActualL: 0,
          topcoatThinnerActualL: 0,
          notes: null,
        },
  });
  const selectedJobId = Number(form.watch("jobItemId") || initialJobId || usage?.jobItemId || 0);
  const selectedJob = jobs?.find((job) => job.id === selectedJobId);
  const selectedTopcoatMaterial = materials?.find((material) => material.id === selectedJob?.topcoatBaseMaterialId);
  const targetPerSerial = selectedJob
    ? selectedJob.targetBasis === "order_total" ? 1 / Math.max(selectedJob.orderQuantity, 1) : 1
    : 0;
  useEffect(() => {
    const stages = selectedJob?.customPaintStages ?? [];
    setCustomActuals((current) => Object.fromEntries(stages.map((stage) => [
      stage.id,
      current[stage.id] ?? usage?.customPaintActuals?.find((actual) => actual.stageId === stage.id)?.actualLiters ?? 0,
    ])));
  }, [selectedJobId, usage?.id, selectedJob?.customPaintStages]);
  const { data: serials, isLoading: serialsLoading } = useListJobItemSerialNumbers(selectedJobId, {
    query: { enabled: !isEdit && selectedJobId > 0, queryKey: getListJobItemSerialNumbersQueryKey(selectedJobId) },
  });
  const usedParams = selectedJobId > 0 ? { jobItemId: selectedJobId } : undefined;
  const { data: existingUsage } = useListPaintUsage(usedParams, {
    query: { enabled: !isEdit && selectedJobId > 0, queryKey: getListPaintUsageQueryKey(usedParams) },
  });
  const usedSerialIds = useMemo(() => new Set((existingUsage ?? []).map((record) => record.serialNumberId)), [existingUsage]);

  const createMutation = useCreatePaintUsage();
  const updateMutation = useUpdatePaintUsage();
  const mutationPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: UsageFormValues | EditFormValues) => {
    setServerError("");
    try {
      if (isEdit && usage) {
        const editValues = values as EditFormValues;
        const data: PaintUsageUpdate = {
          usageDate: editValues.usageDate,
          shift: editValues.shift,
          category: editValues.category,
          primerBaseActualL: Number(editValues.primerBaseActualL),
          primerHrdActualL: Number(editValues.primerHrdActualL),
          primerThinnerActualL: Number(editValues.primerThinnerActualL),
          topcoatBaseActualL: Number(editValues.topcoatBaseActualL),
          topcoatHrdActualL: Number(editValues.topcoatHrdActualL),
          topcoatThinnerActualL: Number(editValues.topcoatThinnerActualL),
          customPaintActuals: (selectedJob?.customPaintStages ?? []).map((stage) => ({
            stageId: stage.id,
            actualLiters: Number(customActuals[stage.id] ?? 0),
          })),
          notes: editValues.notes || null,
        };
        const saved = await updateMutation.mutateAsync({ id: usage.id, data });
        queryClient.setQueryData(getGetPaintUsageQueryKey(usage.id), saved);
        queryClient.invalidateQueries({ queryKey: getListPaintUsageQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPaintUsageQueryKey(usage!.id) });
        queryClient.invalidateQueries({ queryKey: getListJobWorkflowQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListStockSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListStockMovementsQueryKey() });
        onComplete(saved);
      } else {
        const createValues = values as UsageFormValues;
        const data: PaintUsageInput = {
          jobItemId: Number(createValues.jobItemId),
          serialNumberId: Number(createValues.serialNumberId),
          usageDate: createValues.usageDate,
          shift: createValues.shift,
          category: createValues.category,
          primerBaseActualL: Number(createValues.primerBaseActualL),
          primerHrdActualL: Number(createValues.primerHrdActualL),
          primerThinnerActualL: Number(createValues.primerThinnerActualL),
          topcoatBaseActualL: Number(createValues.topcoatBaseActualL),
          topcoatHrdActualL: Number(createValues.topcoatHrdActualL),
          topcoatThinnerActualL: Number(createValues.topcoatThinnerActualL),
          customPaintActuals: (selectedJob?.customPaintStages ?? []).map((stage) => ({
            stageId: stage.id,
            actualLiters: Number(customActuals[stage.id] ?? 0),
          })),
          notes: createValues.notes || null,
        };
        const saved = await createMutation.mutateAsync({ data });
        queryClient.invalidateQueries({ queryKey: getListPaintUsageQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetJobItemQueryKey(data.jobItemId) });
        queryClient.invalidateQueries({ queryKey: getListJobWorkflowQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListStockSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListStockMovementsQueryKey() });
        onComplete(saved);
      }
    } catch (error) {
      setServerError(apiMessage(error, t));
    }
  };

  if (isEdit && !usage) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid={`form-paint-usage-${mode}`}>
        {!isEdit && (
          <section className="border border-border bg-card">
            <div className="border-b border-border bg-secondary/40 px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("productionIdentity")}</p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="jobItemId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold">{t("jobs")}</FormLabel>
                    <Select value={field.value ? String(field.value) : ""} onValueChange={(value) => { field.onChange(Number(value)); form.setValue("serialNumberId", 0); }}>
                      <FormControl><SelectTrigger data-testid="select-job-item"><SelectValue placeholder={jobsLoading ? t("loadingJobItems") : t("selectJobItem")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {jobs?.map((job) => <SelectItem value={String(job.id)} key={job.id}>{job.jobNo} — {job.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {jobsError && <p className="text-xs font-medium text-destructive">{t("jobItemsLoadError")}</p>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serialNumberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold">{t("serial")}</FormLabel>
                    <Select value={field.value ? String(field.value) : ""} onValueChange={(value) => field.onChange(Number(value))} disabled={!selectedJobId || serialsLoading}>
                      <FormControl><SelectTrigger data-testid="select-serial-number"><SelectValue placeholder={serialsLoading ? t("loadingSerialNumbers") : t("selectSerialNumber")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {serials?.map((serial) => <SelectItem value={String(serial.id)} key={serial.id} disabled={usedSerialIds.has(serial.id)}>{serial.serialNo}{usedSerialIds.has(serial.id) ? ` — ${t("serialAlreadyRecorded")}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedJobId > 0 && !serialsLoading && serials?.length === 0 && <p className="text-xs font-medium text-amber-700">{t("noSerialNumbers")}</p>}
                    {selectedJobId > 0 && !serialsLoading && serials?.length && serials.every((serial) => usedSerialIds.has(serial.id)) ? <p className="text-xs font-medium text-amber-700">{t("allSerialsRecorded")}</p> : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>
        )}

        {isEdit && usage && (
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label={t("jobNo")} value={usage.jobNo} />
            <Metric label={t("serial")} value={usage.serialNo} />
            <Metric label={t("recordedBy")} value={usage.createdByName || "—"} />
          </div>
        )}

        <section className="border border-border bg-card">
          <div className="border-b border-border bg-secondary/40 px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("applicationTime")}</p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <FormField control={form.control} name="usageDate" render={({ field }) => (
              <FormItem><FormLabel className="font-bold">{t("usageDate")}</FormLabel><FormControl><Input type="date" {...field} data-testid="input-usage-date" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="shift" render={({ field }) => (
              <FormItem><FormLabel className="font-bold">{t("shift")}</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="input-shift"><SelectValue /></SelectTrigger></FormControl><SelectContent>{[1, 2, 3].map((shift) => <SelectItem key={shift} value={`Shift ${shift}`}>{t("shift")} {shift}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem><FormLabel className="font-bold">{t("category")}</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="select-usage-category"><SelectValue /></SelectTrigger></FormControl><SelectContent>
                <SelectItem value="preparation">{t("preparation")}</SelectItem><SelectItem value="blasting">{t("blasting")}</SelectItem><SelectItem value="washing">{t("washing")}</SelectItem><SelectItem value="cleaning">{t("cleaning")}</SelectItem><SelectItem value="finishing">{t("finishing")}</SelectItem>
              </SelectContent></Select><FormMessage /></FormItem>
            )} />
          </div>
        </section>

        <section className="space-y-2 border border-border bg-card p-4" data-testid="paint-target-card">
          <div className="flex items-center justify-between gap-3 border-l-4 border-foreground bg-secondary/30 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("primer")} · {t("targetPerSerial")}</p>
            <p className="font-mono text-2xl font-extrabold">{selectedJob ? (selectedJob.primerTotalL * targetPerSerial).toFixed(3) : "—"} L</p>
          </div>
          <div className="flex items-center justify-between gap-3 border-l-4 border-primary bg-secondary/30 p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("topcoat")} · {t("targetPerSerial")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("topcoatColor")}: {selectedTopcoatMaterial?.color || selectedTopcoatMaterial?.description || "—"}</p>
            </div>
            <p className="font-mono text-2xl font-extrabold text-primary">{selectedJob ? (selectedJob.topcoatTotalL * targetPerSerial).toFixed(3) : "—"} L</p>
          </div>
        </section>

        {!!selectedJob?.customPaintStages?.length && (
          <section className="space-y-3 border border-border bg-card p-5" data-testid="custom-paint-stages">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{t("paintStages")}</h2>
            <div className="grid gap-3">
              {selectedJob.customPaintStages.map((stage) => (
                <div className="border-l-4 border-primary bg-secondary/30 p-4" key={stage.id}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold">{stage.name}</p>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">{stage.coatType === "primer" ? t("stagePrimer") : t("stageTopcoat")}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{t("targetPerSerial")}: {(stage.targetLitersTotal * targetPerSerial).toFixed(3)} L</p>
                  <label className="mt-3 block text-xs font-bold text-muted-foreground">{t("customActual")} ({volumeUnit})</label>
                  <Input
                    type="number"
                    min="0"
                    step={volumeUnit === "mL" ? 50 : 0.05}
                    value={volumeUnit === "mL" ? Number(customActuals[stage.id] ?? 0) * 1000 : customActuals[stage.id] ?? 0}
                    onChange={(event) => setCustomActuals((current) => ({
                      ...current,
                      [stage.id]: event.target.value === "" ? 0 : Number(event.target.value) / (volumeUnit === "mL" ? 1000 : 1),
                    }))}
                    data-testid={`input-custom-stage-${stage.id}`}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("cumulativeUsageHint")}</p>
          <div className="flex gap-1" aria-label={t("volumeUnit")}><Button type="button" size="sm" variant={volumeUnit === "L" ? "default" : "outline"} onClick={() => setVolumeUnit("L")}>L</Button><Button type="button" size="sm" variant={volumeUnit === "mL" ? "default" : "outline"} onClick={() => setVolumeUnit("mL")}>mL</Button></div>
        </div>
        {(["primer", "topcoat"] as const).map((coat, index) => (
          <section key={coat} className="border border-border bg-card">
            <div className="flex flex-wrap justify-between gap-2 border-b border-border bg-secondary/40 px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em]">{t(coat === "primer" ? "actualPrimer" : "actualTopcoat")} ({volumeUnit})</p>
              <p className="text-xs font-bold">{t("targetPerSerial")}: {selectedJob ? ((coat === "primer" ? selectedJob.primerTotalL : selectedJob.topcoatTotalL) * targetPerSerial).toFixed(3) : "—"} L</p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              {actualFields.slice(index * 3, index * 3 + 3).map((fieldConfig) => (
                <ActualField key={fieldConfig.name} control={form.control} config={{ ...fieldConfig, label: t(fieldConfig.label) }} volumeUnit={volumeUnit} data-testid={`input-${fieldConfig.name}`} />
              ))}
            </div>
          </section>
        ))}

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem className="border border-border bg-card p-5">
            <FormLabel className="font-bold">{t("operationalNotes")} <span className="font-normal text-muted-foreground">({t("optional")})</span></FormLabel>
            <FormControl><Textarea value={field.value ?? ""} onChange={field.onChange} placeholder={t("usageNotesPlaceholder")} className="mt-2 min-h-[96px]" data-testid="input-usage-notes" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {serverError && (
          <div className="flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" data-testid="error-paint-usage">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{serverError}</span>
          </div>
        )}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setLocation(isEdit && usage ? `/paint-usage/${usage.id}` : "/paint-usage")} data-testid="button-cancel-paint-usage">{t("cancel")}</Button>
          <Button type="submit" disabled={mutationPending || (!isEdit && (!jobs?.length || !serials?.length))} className="font-bold uppercase tracking-wider" data-testid="button-save-paint-usage">
            {mutationPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("saveChanges") : t("saveUsage")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ActualField({ control, config, volumeUnit, "data-testid": testId }: { control: any; config: { name: string; label: string }; volumeUnit: "L" | "mL"; "data-testid": string }) {
  return (
    <FormField control={control} name={config.name} render={({ field }: { field: any }) => (
      <FormItem>
        <FormLabel className="text-xs font-bold text-muted-foreground">{config.label}</FormLabel>
        <FormControl><Input type="number" min="0" step={volumeUnit === "mL" ? 50 : 0.05} value={volumeUnit === "mL" ? Number(field.value ?? 0) * 1000 : field.value} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value) / (volumeUnit === "mL" ? 1000 : 1))} className="font-mono" data-testid={testId} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
}

function PaintUsageList() {
  const [, setLocation] = useLocation();
  const { user } = useAppAuth();
  const { t, language } = useLanguage();
  const canRecordUsage = user?.role === "admin" || user?.role === "painter";
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [jobItemFilter, setJobItemFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const params = useMemo(() => ({
    jobItemId: jobItemFilter === "all" ? undefined : Number(jobItemFilter),
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  }), [jobItemFilter, fromDate, toDate]);
  const { data: records, isLoading, error } = useListPaintUsage(params, { query: { queryKey: getListPaintUsageQueryKey(params) } });
  const { data: jobs } = useListJobItems(undefined, { query: { queryKey: getListJobItemsQueryKey() } });
  const visibleRecords = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return records ?? [];
    return (records ?? []).filter((record) => `${record.jobNo} ${record.serialNo} ${record.shift}`.toLowerCase().includes(query));
  }, [records, debouncedSearch]);
  const overCount = visibleRecords.filter((record) => record.isOverconsumption).length;

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary"><ClipboardPenLine className="h-4 w-4" /> {t("operations")} / {t("usage")}</p>
          <h1 className="text-3xl font-extrabold uppercase tracking-tight text-foreground" data-testid="heading-paint-usage">{t("usageTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-muted-foreground">{t("usageIntro")}</p>
        </div>
         {canRecordUsage ? <Button onClick={() => setLocation("/paint-usage/new")} className="w-full font-bold uppercase tracking-wider sm:w-auto" data-testid="button-new-paint-usage"><Plus className="mr-2 h-4 w-4" /> {t("saveUsage")}</Button> : <span className="border border-border bg-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("readOnly")}</span>}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
         <Metric label={t("recordsShown")} value={String(visibleRecords.length)} />
         <Metric label={t("overconsumption")} value={String(overCount)} tone={overCount ? "red" : "neutral"} />
         <Metric label={t("thresholdStatus")} value={overCount ? t("needsReview") : t("underControl")} tone={overCount ? "orange" : "blue"} />
      </div>

      <section className="border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border bg-secondary/20 p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPaintUsage")} className="bg-background pl-9" data-testid="input-search-paint-usage" />
          </div>
          <Button type="button" variant="outline" onClick={() => setShowFilters((open) => !open)} className="w-full font-bold uppercase tracking-wider sm:w-auto" data-testid="button-toggle-paint-usage-filters"><SlidersHorizontal className="mr-2 h-4 w-4" /> {t("filter")} <Filter className="ml-2 h-3 w-3" /></Button>
           {(fromDate || toDate || jobItemFilter !== "all") && <Button type="button" variant="ghost" onClick={() => { setFromDate(""); setToDate(""); setJobItemFilter("all"); }} className="text-xs font-bold uppercase tracking-wider" data-testid="button-clear-paint-usage-filters">{t("resetFilters")}</Button>}
        </div>
        {showFilters && (
          <div className="grid gap-4 border-b border-border bg-secondary/10 p-4 md:grid-cols-3">
             <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("jobItem")}</label><Select value={jobItemFilter} onValueChange={setJobItemFilter}><SelectTrigger data-testid="select-filter-job-item"><SelectValue placeholder={t("allJobItems")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("allJobItems")}</SelectItem>{jobs?.map((job) => <SelectItem key={job.id} value={String(job.id)}>{job.jobNo} — {job.description}</SelectItem>)}</SelectContent></Select></div>
             <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("fromDate")}</label><Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} data-testid="input-filter-from-date" /></div>
             <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("toDate")}</label><Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} data-testid="input-filter-to-date" /></div>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-3 p-5" data-testid="loading-paint-usage"><div className="h-10 animate-pulse bg-secondary" /><div className="h-10 animate-pulse bg-secondary" /><div className="h-10 animate-pulse bg-secondary" /></div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-destructive" data-testid="error-paint-usage-list"><AlertTriangle className="h-5 w-5" /> {t("paintUsageLoadError")}</div>
        ) : visibleRecords.length === 0 ? (
           <div className="p-16 text-center" data-testid="empty-paint-usage"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border border-border bg-secondary text-muted-foreground"><ClipboardPenLine /></div><h3 className="font-bold uppercase tracking-wide">{t("noRecordsTitle")}</h3><p className="mt-1 text-sm font-medium text-muted-foreground">{search || fromDate || toDate ? t("noRecordsMatch") : t("noUsageYet")}</p>{canRecordUsage && <Button onClick={() => setLocation("/paint-usage/new")} variant="outline" className="mt-5 font-bold uppercase tracking-wider" data-testid="button-empty-create-usage">{t("recordFirstUsage")}</Button>}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px]">
              <thead><tr><th>{t("dateAndShift")}</th><th>{t("jobNo")}</th><th>{t("serial")}</th><th className="text-right">{t("actualPrimer")}</th><th className="text-right">{t("actualTopcoat")}</th><th className="text-right">{t("variance")}</th><th>{t("status")}</th><th className="w-10" /></tr></thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.id} className="cursor-pointer transition-colors hover:bg-secondary/30" onClick={() => setLocation(`/paint-usage/${record.id}`)} data-testid={`row-paint-usage-${record.id}`}>
                    <td><p className="font-mono text-xs font-bold">{formatDate(record.usageDate, language)}</p><p className="mt-1 text-xs text-muted-foreground">{record.shift} · {t(record.category)}</p></td>
                    <td className="font-mono font-bold">{record.jobNo}</td>
                    <td className="font-mono font-bold text-primary">{record.serialNo}</td>
                    <td className="text-right font-mono">{formatLiters(record.primerActualTotalL)}<p className="text-xs text-muted-foreground">{t("targetValue")} {formatLiters(record.primerTargetTotalL)}</p></td>
                    <td className="text-right font-mono">{formatLiters(record.topcoatActualTotalL)}<p className="text-xs text-muted-foreground">{t("targetValue")} {formatLiters(record.topcoatTargetTotalL)}</p></td>
                    <td className={`text-right font-mono font-bold ${record.isOverconsumption ? "text-destructive" : "text-foreground"}`}>P {record.primerVariancePct.toFixed(1)}%<br />T {record.topcoatVariancePct.toFixed(1)}%</td>
                    <td><VarianceBadge over={record.isOverconsumption} /></td>
                    <td><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PaintUsagePhotos({ usageId, canManage }: { usageId: number; canManage: boolean }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { data: photos, isLoading, error } = useListPaintUsagePhotos(usageId, {
    query: { queryKey: getListPaintUsagePhotosQueryKey(usageId) },
  });
  const requestUpload = useRequestPaintUsagePhotoUploadUrl();
  const createPhoto = useCreatePaintUsagePhoto();
  const [label, setLabel] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setUploadError("");
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setUploadError(t("invalidPhoto"));
      input.value = "";
      return;
    }
    setUploading(true);
    try {
      const upload = await requestUpload.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
        },
      });
      const result = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error("upload");
      await createPhoto.mutateAsync({
        id: usageId,
        data: {
          objectPath: upload.objectPath,
          label: label.trim() || t("primer"),
          originalName: file.name,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListPaintUsagePhotosQueryKey(usageId) });
      setLabel("");
    } catch {
      setUploadError(t("photoUploadError"));
    } finally {
      setUploading(false);
      input.value = "";
    }
  };

  return (
    <section className="space-y-4 border border-border bg-card p-5" data-testid="paint-usage-photos">
      <div>
        <h2 className="font-bold uppercase tracking-wider">{t("usagePhotos")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("photoHint")}</p>
      </div>
      {canManage && (
        <div className="grid gap-3 border border-border bg-secondary/20 p-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("photoLabel")} aria-label={t("photoLabel")} maxLength={100} />
            <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={uploading} aria-label={t("choosePhoto")} data-testid="input-paint-usage-photo" />
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            {uploading && <><Loader2 className="h-4 w-4 animate-spin" />{t("uploading")}</>}
            {!uploading && t("choosePhoto")}
          </div>
          {uploadError && <p className="text-sm font-semibold text-destructive sm:col-span-2" role="alert">{uploadError}</p>}
        </div>
      )}
      {isLoading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : error ? (
        <p className="text-sm font-semibold text-destructive">{t("photoLoadError")}</p>
      ) : photos?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <figure className="overflow-hidden border border-border bg-background" key={photo.id}>
              <img
                src={`/api/storage/objects/${photo.objectPath.replace(/^\/objects\//, "")}`}
                alt={`${photo.label} — ${photo.originalName}`}
                className="aspect-video w-full object-cover"
                loading="lazy"
              />
              <figcaption className="space-y-1 p-3">
                <p className="font-bold">{photo.label}</p>
                <p className="truncate text-xs text-muted-foreground">{photo.originalName}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">{t("noPhotos")}</p>}
    </section>
  );
}

function PaintUsageDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { user } = useAppAuth();
  const { t, language } = useLanguage();
  const canRecordUsage = user?.role === "admin" || user?.role === "painter";
  const [editing, setEditing] = useState(false);
  const { data: usage, isLoading, error } = useGetPaintUsage(id, { query: { enabled: id > 0, queryKey: getGetPaintUsageQueryKey(id) } });

  if (isLoading) return <div className="space-y-4"><div className="h-8 w-64 animate-pulse bg-secondary" /><div className="h-48 animate-pulse bg-secondary" /><div className="h-72 animate-pulse bg-secondary" /></div>;
  if (error || !usage) return <div className="flex items-center gap-2 p-8 font-bold text-destructive" data-testid="error-paint-usage-detail"><AlertTriangle /> {t("recordNotFound")}</div>;

  if (editing) {
    return <div className="space-y-5"><Link href={`/paint-usage/${id}`} className="inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary" data-testid="link-back-usage-detail"><ArrowLeft className="mr-2 h-4 w-4" /> {t("backToDetail")}</Link><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("editRecord")} #{usage.id}</p><h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">{t("updateActualUsage")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("identityLocked")}</p></div><UsageForm mode="edit" usage={usage} onComplete={() => setEditing(false)} /></div>;
  }

  const primerTone = usage.primerVariancePct > usage.thresholdPct ? "red" : "blue";
  const topcoatTone = usage.topcoatVariancePct > usage.thresholdPct ? "red" : "orange";
  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><Link href="/paint-usage" className="mb-3 inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary" data-testid="link-back-paint-usage"><ArrowLeft className="mr-2 h-4 w-4" /> {t("usage")}</Link><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("usageTitle")} #{usage.id}</p><h1 className="mt-1 font-mono text-3xl font-extrabold text-foreground">{usage.jobNo} <span className="text-muted-foreground">/</span> {usage.serialNo}</h1><p className="mt-1 text-sm font-medium text-muted-foreground">{formatDate(usage.usageDate, language)} · {usage.shift} · {t(usage.category)}</p></div>
          {canRecordUsage && <Button onClick={() => setEditing(true)} variant="outline" className="font-bold uppercase tracking-wider" data-testid="button-edit-paint-usage"><Edit3 className="mr-2 h-4 w-4" /> {t("editRecord")}</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-3"><VarianceBadge over={usage.isOverconsumption} /><span className="border border-border bg-secondary px-3 py-1 font-mono text-xs font-bold">{t("thresholdStatus")} {usage.thresholdPct.toFixed(1)}%</span><span className="text-xs font-medium text-muted-foreground">{t("recordedBy")} {usage.createdByName || "System"} · {t("updated")} {formatDate(usage.updatedAt, language)}</span></div>
       <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label={t("actualPrimer")} value={formatLiters(usage.primerActualTotalL)} tone={primerTone} /><Metric label={t("primerTarget")} value={formatLiters(usage.primerTargetTotalL)} tone="blue" /><Metric label={t("actualTopcoat")} value={formatLiters(usage.topcoatActualTotalL)} tone={topcoatTone} /><Metric label={t("topcoatTarget")} value={formatLiters(usage.topcoatTargetTotalL)} tone="orange" /></div>
      <section className="grid gap-5 lg:grid-cols-2">
        <ComponentTable title={t("primerActualVsTarget")} accent="blue" rows={[[t("primerBase"), usage.primerBaseActualL, usage.primerTargetTotalL], [t("hardener"), usage.primerHrdActualL, 0], [t("thinner"), usage.primerThinnerActualL, 0]]} total={usage.primerActualTotalL} variance={usage.primerVarianceL} pct={usage.primerVariancePct} threshold={usage.thresholdPct} />
        <ComponentTable title={t("topcoatActualVsTarget")} accent="orange" rows={[[t("topcoatBase"), usage.topcoatBaseActualL, usage.topcoatTargetTotalL], [t("hardener"), usage.topcoatHrdActualL, 0], [t("thinner"), usage.topcoatThinnerActualL, 0]]} total={usage.topcoatActualTotalL} variance={usage.topcoatVarianceL} pct={usage.topcoatVariancePct} threshold={usage.thresholdPct} />
      </section>
      {!!usage.customPaintActuals?.length && <section className="space-y-3 border border-border bg-card p-5"><h2 className="font-bold uppercase tracking-wider">{t("paintStages")}</h2><div className="grid gap-3 sm:grid-cols-2">{usage.customPaintActuals.map((stage) => <div className="border-l-4 border-primary bg-secondary/30 p-4" key={stage.stageId}><p className="font-bold">{stage.name}<span className="ml-2 text-[10px] uppercase text-muted-foreground">{stage.coatType}</span></p><p className="mt-2 text-sm">{t("targetPerSerial")}: {stage.targetLiters.toFixed(3)} L</p><p className="text-sm">{t("actual")}: {stage.actualLiters.toFixed(3)} L</p></div>)}</div></section>}
      <PaintUsagePhotos usageId={usage.id} canManage={user?.role === "admin"} />
      <section className="border border-border bg-card p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("operationalNotes")}</p><p className="mt-2 whitespace-pre-wrap text-sm font-medium">{usage.notes || "—"}</p></section>
    </div>
  );
}

function ComponentTable({ title, accent, rows, total, variance, pct, threshold }: { title: string; accent: "blue" | "orange"; rows: [string, number, number][]; total: number; variance: number; pct: number; threshold: number }) {
  const { t } = useLanguage();
  const header = accent === "blue" ? "bg-secondary text-secondary-foreground" : "bg-primary/20 text-foreground";
  return <div className="border border-border bg-card"><div className={`border-b border-border px-5 py-3 ${header}`}><h2 className="text-sm font-bold uppercase tracking-wider">{title}</h2></div><table><thead><tr><th>{t("component")}</th><th className="text-right">{t("actualLiters")}</th><th className="text-right">{t("targetRef")}</th></tr></thead><tbody>{rows.map(([label, actual, target], index) => <tr key={label}><td className="font-medium">{label}</td><td className="text-right font-mono">{actual.toFixed(3)}</td><td className="text-right font-mono text-muted-foreground">{index === 0 ? target.toFixed(3) : "—"}</td></tr>)}<tr className="bg-secondary/40"><td className="font-bold uppercase tracking-wider">{t("total")}</td><td className="text-right font-mono font-bold">{total.toFixed(3)}</td><td className="text-right font-mono text-muted-foreground">{t("variance")} {variance >= 0 ? "+" : ""}{variance.toFixed(3)} L</td></tr></tbody></table><div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm"><span className="font-bold uppercase tracking-wider text-muted-foreground">{t("variance")}</span><span className={`font-mono text-lg font-bold ${pct > threshold ? "text-destructive" : "text-foreground"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span></div></div>;
}

export function PaintUsage() {
  const params = useParams<{ id?: string }>();
  const [location, setLocation] = useLocation();
  const { user } = useAppAuth();
  const { t } = useLanguage();
  const canRecordUsage = user?.role === "admin" || user?.role === "painter";
  const id = params.id ? Number(params.id) : 0;
  const queryJobId = Number(new URLSearchParams(location.split("?")[1] || "").get("jobItemId") || 0);
  if (params.id === "new") {
    if (!canRecordUsage) {
      return <div className="border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-900">{t("usageReadOnly")}</div>;
    }
    return <div className="space-y-5 pb-12"><Link href="/paint-usage" className="inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary" data-testid="link-back-paint-usage-create"><ArrowLeft className="mr-2 h-4 w-4" /> {t("usage")}</Link><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("operations")} / {t("input")}</p><h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">{t("usageTitle")}</h1><p className="mt-1 text-sm font-medium text-muted-foreground">{t("usageIntro")}</p></div><UsageForm mode="create" initialJobId={queryJobId} onComplete={(record) => setLocation(`/paint-usage/${record.id}`)} /></div>;
  }
  return id > 0 ? <PaintUsageDetail id={id} /> : <PaintUsageList />;
}