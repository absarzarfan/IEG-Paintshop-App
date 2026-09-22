import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  getGetJobItemQueryKey,
  getGetPaintUsageQueryKey,
  getListJobItemSerialNumbersQueryKey,
  getListJobItemsQueryKey,
  getListPaintUsageQueryKey,
  PaintUsageInput,
  PaintUsageUpdate,
  useCreatePaintUsage,
  useGetPaintUsage,
  useListJobItemSerialNumbers,
  useListJobItems,
  useListPaintUsage,
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

const actualFields = [
  { name: "primerBaseActualL", label: "Primer Base" },
  { name: "primerHrdActualL", label: "Primer Hardener" },
  { name: "primerThinnerActualL", label: "Primer Thinner" },
  { name: "topcoatBaseActualL", label: "Topcoat Base" },
  { name: "topcoatHrdActualL", label: "Topcoat Hardener" },
  { name: "topcoatThinnerActualL", label: "Topcoat Thinner" },
] as const;

const usageSchema = z.object({
  jobItemId: z.coerce.number().int().positive("Select a Job Item"),
  serialNumberId: z.coerce.number().int().positive("Select a Serial Number"),
  usageDate: z.string().min(1, "Usage date is required"),
  shift: z.string().min(1, "Shift is required").max(50),
  primerBaseActualL: z.coerce.number().min(0, "Value cannot be negative"),
  primerHrdActualL: z.coerce.number().min(0, "Value cannot be negative"),
  primerThinnerActualL: z.coerce.number().min(0, "Value cannot be negative"),
  topcoatBaseActualL: z.coerce.number().min(0, "Value cannot be negative"),
  topcoatHrdActualL: z.coerce.number().min(0, "Value cannot be negative"),
  topcoatThinnerActualL: z.coerce.number().min(0, "Value cannot be negative"),
  notes: z.string().nullable(),
});

const editSchema = usageSchema.omit({ jobItemId: true, serialNumberId: true });
type UsageFormValues = z.infer<typeof usageSchema>;
type EditFormValues = z.infer<typeof editSchema>;

function formatLiters(value: number) {
  return `${value.toFixed(3)} L`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function apiMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unable to process the request. Check the data and try again.";
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
  const isEdit = mode === "edit";

  const { data: jobs, isLoading: jobsLoading, error: jobsError } = useListJobItems(
    { search: undefined },
    { query: { queryKey: getListJobItemsQueryKey() } },
  );
  const defaultJobId = usage?.jobItemId ?? initialJobId;
  const form = useForm<UsageFormValues | EditFormValues>({
    resolver: zodResolver(isEdit ? editSchema : usageSchema),
    defaultValues: isEdit
      ? {
          usageDate: usage?.usageDate?.slice(0, 10) ?? "",
          shift: usage?.shift ?? "",
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
          primerBaseActualL: 0,
          primerHrdActualL: 0,
          primerThinnerActualL: 0,
          topcoatBaseActualL: 0,
          topcoatHrdActualL: 0,
          topcoatThinnerActualL: 0,
          notes: null,
        },
  });
  const selectedJobId = Number(form.watch("jobItemId") || initialJobId);
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
          primerBaseActualL: Number(editValues.primerBaseActualL),
          primerHrdActualL: Number(editValues.primerHrdActualL),
          primerThinnerActualL: Number(editValues.primerThinnerActualL),
          topcoatBaseActualL: Number(editValues.topcoatBaseActualL),
          topcoatHrdActualL: Number(editValues.topcoatHrdActualL),
          topcoatThinnerActualL: Number(editValues.topcoatThinnerActualL),
          notes: editValues.notes || null,
        };
        const saved = await updateMutation.mutateAsync({ id: usage.id, data });
        queryClient.setQueryData(getGetPaintUsageQueryKey(usage.id), saved);
        queryClient.invalidateQueries({ queryKey: getListPaintUsageQueryKey() });
        onComplete(saved);
      } else {
        const createValues = values as UsageFormValues;
        const data: PaintUsageInput = {
          jobItemId: Number(createValues.jobItemId),
          serialNumberId: Number(createValues.serialNumberId),
          usageDate: createValues.usageDate,
          shift: createValues.shift,
          primerBaseActualL: Number(createValues.primerBaseActualL),
          primerHrdActualL: Number(createValues.primerHrdActualL),
          primerThinnerActualL: Number(createValues.primerThinnerActualL),
          topcoatBaseActualL: Number(createValues.topcoatBaseActualL),
          topcoatHrdActualL: Number(createValues.topcoatHrdActualL),
          topcoatThinnerActualL: Number(createValues.topcoatThinnerActualL),
          notes: createValues.notes || null,
        };
        const saved = await createMutation.mutateAsync({ data });
        queryClient.invalidateQueries({ queryKey: getListPaintUsageQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetJobItemQueryKey(data.jobItemId) });
        onComplete(saved);
      }
    } catch (error) {
      setServerError(apiMessage(error));
    }
  };

  if (isEdit && !usage) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid={`form-paint-usage-${mode}`}>
        {!isEdit && (
          <section className="border border-border bg-card">
            <div className="border-b border-border bg-secondary/40 px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Production Identity</p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="jobItemId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold">Job Item</FormLabel>
                    <Select value={field.value ? String(field.value) : ""} onValueChange={(value) => { field.onChange(Number(value)); form.setValue("serialNumberId", 0); }}>
                      <FormControl><SelectTrigger data-testid="select-job-item"><SelectValue placeholder={jobsLoading ? "Loading Job Items..." : "Select Job Item"} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {jobs?.map((job) => <SelectItem value={String(job.id)} key={job.id}>{job.jobNo} — {job.description}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {jobsError && <p className="text-xs font-medium text-destructive">Job Items could not be loaded.</p>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serialNumberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold">Serial Number</FormLabel>
                    <Select value={field.value ? String(field.value) : ""} onValueChange={(value) => field.onChange(Number(value))} disabled={!selectedJobId || serialsLoading}>
                      <FormControl><SelectTrigger data-testid="select-serial-number"><SelectValue placeholder={serialsLoading ? "Loading Serial Numbers..." : "Select Serial Number"} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {serials?.map((serial) => <SelectItem value={String(serial.id)} key={serial.id} disabled={usedSerialIds.has(serial.id)}>{serial.serialNo}{usedSerialIds.has(serial.id) ? " — already recorded" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedJobId > 0 && !serialsLoading && serials?.length === 0 && <p className="text-xs font-medium text-amber-700">No Serial Numbers exist for this Job Item yet.</p>}
                    {selectedJobId > 0 && !serialsLoading && serials?.length && serials.every((serial) => usedSerialIds.has(serial.id)) ? <p className="text-xs font-medium text-amber-700">All Serial Numbers already have a paint usage record.</p> : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>
        )}

        {isEdit && usage && (
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Job No" value={usage.jobNo} />
            <Metric label="Serial Number" value={usage.serialNo} />
            <Metric label="Recorded By" value={usage.createdByName || "—"} />
          </div>
        )}

        <section className="border border-border bg-card">
          <div className="border-b border-border bg-secondary/40 px-5 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Application Time</p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <FormField control={form.control} name="usageDate" render={({ field }) => (
              <FormItem><FormLabel className="font-bold">Usage Date</FormLabel><FormControl><Input type="date" {...field} data-testid="input-usage-date" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="shift" render={({ field }) => (
              <FormItem><FormLabel className="font-bold">Shift</FormLabel><FormControl><Input {...field} placeholder="Shift 1 / Shift 2 / Shift 3" data-testid="input-shift" /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        </section>

        <section className="border border-border bg-card">
          <div className="grid border-b border-border bg-secondary/40 md:grid-cols-2">
            <div className="border-b border-border px-5 py-3 md:border-b-0 md:border-r"><p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">Actual Primer (Liter)</p></div>
            <div className="px-5 py-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Actual Topcoat (Liter)</p></div>
          </div>
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <div className="grid gap-4 sm:grid-cols-3">
              {actualFields.slice(0, 3).map((fieldConfig) => (
                <ActualField key={fieldConfig.name} control={form.control} config={fieldConfig} data-testid={`input-${fieldConfig.name}`} />
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {actualFields.slice(3).map((fieldConfig) => (
                <ActualField key={fieldConfig.name} control={form.control} config={fieldConfig} data-testid={`input-${fieldConfig.name}`} />
              ))}
            </div>
          </div>
        </section>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem className="border border-border bg-card p-5">
            <FormLabel className="font-bold">Operational Notes <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
            <FormControl><Textarea value={field.value ?? ""} onChange={field.onChange} placeholder="Application conditions, rework, or field notes..." className="mt-2 min-h-[96px]" data-testid="input-usage-notes" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {serverError && (
          <div className="flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" data-testid="error-paint-usage">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{serverError} If this Serial Number has already been recorded, select another Serial Number or open the existing record.</span>
          </div>
        )}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setLocation(isEdit && usage ? `/paint-usage/${usage.id}` : "/paint-usage")} data-testid="button-cancel-paint-usage">Cancel</Button>
          <Button type="submit" disabled={mutationPending || (!isEdit && (!jobs?.length || !serials?.length))} className="font-bold uppercase tracking-wider" data-testid="button-save-paint-usage">
            {mutationPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Save Usage"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ActualField({ control, config, "data-testid": testId }: { control: any; config: { name: string; label: string }; "data-testid": string }) {
  return (
    <FormField control={control} name={config.name} render={({ field }: { field: any }) => (
      <FormItem>
        <FormLabel className="text-xs font-bold text-muted-foreground">{config.label}</FormLabel>
        <FormControl><Input type="number" min="0" step="0.001" {...field} className="font-mono" data-testid={testId} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
}

function PaintUsageList() {
  const [, setLocation] = useLocation();
  const { user } = useAppAuth();
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
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary"><ClipboardPenLine className="h-4 w-4" /> Operasional / Paint Usage</p>
          <h1 className="text-3xl font-extrabold uppercase tracking-tight text-foreground" data-testid="heading-paint-usage">Actual Paint Usage</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-muted-foreground">Record actual primer and topcoat usage per Job Item Serial Number. Variance is calculated by the server when saved.</p>
        </div>
         {canRecordUsage ? <Button onClick={() => setLocation("/paint-usage/new")} className="w-full font-bold uppercase tracking-wider sm:w-auto" data-testid="button-new-paint-usage"><Plus className="mr-2 h-4 w-4" /> Catat Pemakaian</Button> : <span className="border border-border bg-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Read-only access</span>}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Records Shown" value={String(visibleRecords.length)} />
        <Metric label="Overconsumption" value={String(overCount)} tone={overCount ? "red" : "neutral"} />
        <Metric label="Threshold Status" value={overCount ? "Needs Review" : "Under Control"} tone={overCount ? "orange" : "blue"} />
      </div>

      <section className="border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border bg-secondary/20 p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Job No, Serial Number, Shift..." className="bg-background pl-9" data-testid="input-search-paint-usage" />
          </div>
          <Button type="button" variant="outline" onClick={() => setShowFilters((open) => !open)} className="w-full font-bold uppercase tracking-wider sm:w-auto" data-testid="button-toggle-paint-usage-filters"><SlidersHorizontal className="mr-2 h-4 w-4" /> Filter <Filter className="ml-2 h-3 w-3" /></Button>
           {(fromDate || toDate || jobItemFilter !== "all") && <Button type="button" variant="ghost" onClick={() => { setFromDate(""); setToDate(""); setJobItemFilter("all"); }} className="text-xs font-bold uppercase tracking-wider" data-testid="button-clear-paint-usage-filters">Reset Filters</Button>}
        </div>
        {showFilters && (
          <div className="grid gap-4 border-b border-border bg-secondary/10 p-4 md:grid-cols-3">
             <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Job Item</label><Select value={jobItemFilter} onValueChange={setJobItemFilter}><SelectTrigger data-testid="select-filter-job-item"><SelectValue placeholder="All Job Items" /></SelectTrigger><SelectContent><SelectItem value="all">All Job Items</SelectItem>{jobs?.map((job) => <SelectItem key={job.id} value={String(job.id)}>{job.jobNo} — {job.description}</SelectItem>)}</SelectContent></Select></div>
             <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">From Date</label><Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} data-testid="input-filter-from-date" /></div>
             <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">To Date</label><Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} data-testid="input-filter-to-date" /></div>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-3 p-5" data-testid="loading-paint-usage"><div className="h-10 animate-pulse bg-secondary" /><div className="h-10 animate-pulse bg-secondary" /><div className="h-10 animate-pulse bg-secondary" /></div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-destructive" data-testid="error-paint-usage-list"><AlertTriangle className="h-5 w-5" /> Paint usage data could not be loaded. Refresh the page and try again.</div>
        ) : visibleRecords.length === 0 ? (
           <div className="p-16 text-center" data-testid="empty-paint-usage"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border border-border bg-secondary text-muted-foreground"><ClipboardPenLine /></div><h3 className="font-bold uppercase tracking-wide">No Records Yet</h3><p className="mt-1 text-sm font-medium text-muted-foreground">{search || fromDate || toDate ? "No records match the selected filters." : "No actual paint usage has been recorded yet."}</p>{canRecordUsage && <Button onClick={() => setLocation("/paint-usage/new")} variant="outline" className="mt-5 font-bold uppercase tracking-wider" data-testid="button-empty-create-usage">Record First Usage</Button>}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px]">
              <thead><tr><th>Tanggal / Shift</th><th>Job No</th><th>Serial Number</th><th className="text-right">Primer Actual</th><th className="text-right">Topcoat Actual</th><th className="text-right">Variance</th><th>Status</th><th className="w-10" /></tr></thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.id} className="cursor-pointer transition-colors hover:bg-secondary/30" onClick={() => setLocation(`/paint-usage/${record.id}`)} data-testid={`row-paint-usage-${record.id}`}>
                    <td><p className="font-mono text-xs font-bold">{formatDate(record.usageDate)}</p><p className="mt-1 text-xs text-muted-foreground">{record.shift}</p></td>
                    <td className="font-mono font-bold">{record.jobNo}</td>
                    <td className="font-mono font-bold text-primary">{record.serialNo}</td>
                    <td className="text-right font-mono">{formatLiters(record.primerActualTotalL)}<p className="text-xs text-muted-foreground">target {formatLiters(record.primerTargetTotalL)}</p></td>
                    <td className="text-right font-mono">{formatLiters(record.topcoatActualTotalL)}<p className="text-xs text-muted-foreground">target {formatLiters(record.topcoatTargetTotalL)}</p></td>
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

function PaintUsageDetail({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { user } = useAppAuth();
  const canRecordUsage = user?.role === "admin" || user?.role === "painter";
  const [editing, setEditing] = useState(false);
  const { data: usage, isLoading, error } = useGetPaintUsage(id, { query: { enabled: id > 0, queryKey: getGetPaintUsageQueryKey(id) } });

  if (isLoading) return <div className="space-y-4"><div className="h-8 w-64 animate-pulse bg-secondary" /><div className="h-48 animate-pulse bg-secondary" /><div className="h-72 animate-pulse bg-secondary" /></div>;
  if (error || !usage) return <div className="flex items-center gap-2 p-8 font-bold text-destructive" data-testid="error-paint-usage-detail"><AlertTriangle /> Paint usage record was not found or could not be loaded.</div>;

  if (editing) {
    return <div className="space-y-5"><Link href={`/paint-usage/${id}`} className="inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary" data-testid="link-back-usage-detail"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Detail</Link><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Edit Record #{usage.id}</p><h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">Update Actual Usage</h1><p className="mt-1 text-sm text-muted-foreground">Job Item and Serial Number cannot be changed after the record is created.</p></div><UsageForm mode="edit" usage={usage} onComplete={() => setEditing(false)} /></div>;
  }

  const primerTone = usage.primerVariancePct > usage.thresholdPct ? "red" : "blue";
  const topcoatTone = usage.topcoatVariancePct > usage.thresholdPct ? "red" : "orange";
  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><Link href="/paint-usage" className="mb-3 inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary" data-testid="link-back-paint-usage"><ArrowLeft className="mr-2 h-4 w-4" /> Paint Usage</Link><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Usage Record #{usage.id}</p><h1 className="mt-1 font-mono text-3xl font-extrabold text-foreground">{usage.jobNo} <span className="text-muted-foreground">/</span> {usage.serialNo}</h1><p className="mt-1 text-sm font-medium text-muted-foreground">{formatDate(usage.usageDate)} · {usage.shift}</p></div>
         {canRecordUsage && <Button onClick={() => setEditing(true)} variant="outline" className="font-bold uppercase tracking-wider" data-testid="button-edit-paint-usage"><Edit3 className="mr-2 h-4 w-4" /> Edit Record</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-3"><VarianceBadge over={usage.isOverconsumption} /><span className="border border-border bg-secondary px-3 py-1 font-mono text-xs font-bold">Overconsumption Threshold {usage.thresholdPct.toFixed(1)}%</span><span className="text-xs font-medium text-muted-foreground">Recorded by {usage.createdByName || "System"} · updated {formatDate(usage.updatedAt)}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Primer Actual" value={formatLiters(usage.primerActualTotalL)} tone={primerTone} /><Metric label="Primer Target" value={formatLiters(usage.primerTargetTotalL)} tone="blue" /><Metric label="Topcoat Actual" value={formatLiters(usage.topcoatActualTotalL)} tone={topcoatTone} /><Metric label="Topcoat Target" value={formatLiters(usage.topcoatTargetTotalL)} tone="orange" /></div>
      <section className="grid gap-5 lg:grid-cols-2">
        <ComponentTable title="Primer Actual vs Target" accent="blue" rows={[["Base", usage.primerBaseActualL, usage.primerTargetTotalL], ["Hardener", usage.primerHrdActualL, 0], ["Thinner", usage.primerThinnerActualL, 0]]} total={usage.primerActualTotalL} variance={usage.primerVarianceL} pct={usage.primerVariancePct} threshold={usage.thresholdPct} />
        <ComponentTable title="Topcoat Actual vs Target" accent="orange" rows={[["Base", usage.topcoatBaseActualL, usage.topcoatTargetTotalL], ["Hardener", usage.topcoatHrdActualL, 0], ["Thinner", usage.topcoatThinnerActualL, 0]]} total={usage.topcoatActualTotalL} variance={usage.topcoatVarianceL} pct={usage.topcoatVariancePct} threshold={usage.thresholdPct} />
      </section>
      <section className="border border-border bg-card p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Operational Notes</p><p className="mt-2 whitespace-pre-wrap text-sm font-medium">{usage.notes || "No notes."}</p></section>
    </div>
  );
}

function ComponentTable({ title, accent, rows, total, variance, pct, threshold }: { title: string; accent: "blue" | "orange"; rows: [string, number, number][]; total: number; variance: number; pct: number; threshold: number }) {
  const header = accent === "blue" ? "bg-secondary text-secondary-foreground" : "bg-primary/20 text-foreground";
  return <div className="border border-border bg-card"><div className={`border-b border-border px-5 py-3 ${header}`}><h2 className="text-sm font-bold uppercase tracking-wider">{title}</h2></div><table><thead><tr><th>Komponen</th><th className="text-right">Actual (L)</th><th className="text-right">Target Ref.</th></tr></thead><tbody>{rows.map(([label, actual, target], index) => <tr key={label}><td className="font-medium">{label}</td><td className="text-right font-mono">{actual.toFixed(3)}</td><td className="text-right font-mono text-muted-foreground">{index === 0 ? target.toFixed(3) : "—"}</td></tr>)}<tr className="bg-secondary/40"><td className="font-bold uppercase tracking-wider">Total</td><td className="text-right font-mono font-bold">{total.toFixed(3)}</td><td className="text-right font-mono text-muted-foreground">Variance {variance >= 0 ? "+" : ""}{variance.toFixed(3)} L</td></tr></tbody></table><div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm"><span className="font-bold uppercase tracking-wider text-muted-foreground">Variance</span><span className={`font-mono text-lg font-bold ${pct > threshold ? "text-destructive" : "text-foreground"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span></div></div>;
}

export function PaintUsage() {
  const params = useParams<{ id?: string }>();
  const [location, setLocation] = useLocation();
  const { user } = useAppAuth();
  const canRecordUsage = user?.role === "admin" || user?.role === "painter";
  const id = params.id ? Number(params.id) : 0;
  const queryJobId = Number(new URLSearchParams(location.split("?")[1] || "").get("jobItemId") || 0);
  if (params.id === "new") {
    if (!canRecordUsage) {
      return <div className="border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-900">Your account has read-only access. The Paint Mixer or Admin role is required to record Paint Usage.</div>;
    }
    return <div className="space-y-5 pb-12"><Link href="/paint-usage" className="inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary" data-testid="link-back-paint-usage-create"><ArrowLeft className="mr-2 h-4 w-4" /> Paint Usage</Link><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Operations / Input</p><h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">Record Actual Paint Usage</h1><p className="mt-1 text-sm font-medium text-muted-foreground">Enter actual usage per Serial Number. Targets and variance are calculated by the server.</p></div><UsageForm mode="create" initialJobId={queryJobId} onComplete={(record) => setLocation(`/paint-usage/${record.id}`)} /></div>;
  }
  return id > 0 ? <PaintUsageDetail id={id} /> : <PaintUsageList />;
}