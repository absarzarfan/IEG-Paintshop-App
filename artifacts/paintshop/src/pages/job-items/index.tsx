import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getListCustomersQueryKey, getListJobItemSerialNumbersQueryKey, getListJobItemsQueryKey, useCreateJobItem, useCreateJobItemSerialNumbers, useListCustomers, useListJobItemSerialNumbers, useListJobItems, type JobItem, type JobItemInput } from "@workspace/api-client-react";
import { AlertTriangle, Loader2, PaintBucket, Plus, Search } from "lucide-react";
import { useAppAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SerialWorkHistory } from "@/components/serial-work-history";

function JobRow({ item, search, canRegister, onRegister, t }: { item: JobItem; search: string; canRegister: boolean; onRegister: () => void; t: (key: string) => string }) {
  const serialQuery = useListJobItemSerialNumbers(item.id, { query: { queryKey: getListJobItemSerialNumbersQueryKey(item.id) } });
  const serials = serialQuery.data ?? [];
  const term = search.trim().toLocaleLowerCase();
  if (term && !`${item.jobNo} ${item.customerName} ${item.description} ${serials.map(serial => serial.serialNo).join(" ")}`.toLocaleLowerCase().includes(term)) return null;
  const orderTarget = (target: number) => item.targetBasis === "order_total" ? target : target * item.orderQuantity;
  return <tr data-testid={`row-job-${item.id}`}><td className="min-w-56"><Link href={`/job-items/${item.id}`} className="block hover:underline" data-testid={`link-job-${item.id}`}><span className="block text-xs font-semibold text-muted-foreground">{item.customerName || "—"}</span><span className="font-mono font-extrabold text-primary">{item.jobNo}</span></Link><div className="mt-1 max-w-[260px]">{serialQuery.isLoading ? <span className="text-xs text-muted-foreground">{t("loading")}</span> : serials.length ? serials.map(sn=><div key={sn.id} className="mb-1 border border-border bg-secondary/50 px-1.5 py-0.5" data-testid={`text-serial-${sn.id}`}><span className="font-mono text-[10px]">SN {sn.serialNo}</span><SerialWorkHistory serialNumberId={sn.id} testId={`button-job-history-${sn.id}`} /></div>) : "—"}</div></td><td className="font-mono">{item.orderQuantity}</td><td>{item.description}</td><td className="text-right font-mono">{orderTarget(item.primerTotalL).toFixed(3)} L</td><td className="text-right font-mono">{orderTarget(item.topcoatTotalL).toFixed(3)} L</td><td><span className={`border px-2 py-1 text-[10px] font-bold uppercase ${item.isActive?"border-emerald-700/30 bg-emerald-50 text-emerald-800":"border-destructive/30 bg-destructive/10 text-destructive"}`}>{item.isActive?t("activeStatus"):t("inactiveStatus")}</span></td><td className="text-right">{canRegister && <Button variant="outline" size="sm" onClick={onRegister} data-testid={`button-register-serials-${item.id}`}><Plus size={14} className="mr-1"/>{t("register")}</Button>}</td></tr>;
}

export function JobItems() {
  const { t, language } = useLanguage();
  const { user } = useAppAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState("");
  const [registerTarget, setRegisterTarget] = useState<number | null>(null);
  const [mode, setMode] = useState<"range" | "list">("range");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [manualList, setManualList] = useState("");
  const debounced = useDebounce(search, 250);
  const qc = useQueryClient();
  const query = useListJobItems(undefined, { query: { queryKey: getListJobItemsQueryKey() } });
  const customersQuery = useListCustomers({ query: { queryKey: getListCustomersQueryKey() } });
  const create = useCreateJobItem();
  const createSerials = useCreateJobItemSerialNumbers();
  const canRegister = user?.role === "admin" || user?.role === "painter";
  const canCreate = user?.role === "admin";
  const [jobNo, setJobNo] = useState("");
  const [customerName, setCustomer] = useState("");
  const [orderQuantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [primerBaseL, setPrimer] = useState("0");
  const [topcoatBaseL, setTopcoat] = useState("0");
  const all = useMemo(() => query.data ?? [], [query.data]);
  const activeCustomers = useMemo(() => (customersQuery.data ?? []).filter(customer => customer.isActive), [customersQuery.data]);

  async function submitJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError("");
    if (!customerName) { setFormError(t("selectCustomerRequired")); return; }
    const payload: JobItemInput = { jobNo, customerName, orderQuantity: Number(orderQuantity), targetBasis: "order_total", description, primerBaseL: Number(primerBaseL), primerHrdL: 0, primerThinnerL: 0, topcoatBaseL: Number(topcoatBaseL), topcoatHrdL: 0, topcoatThinnerL: 0 };
    try {
      await create.mutateAsync({ data: payload });
      await qc.invalidateQueries({ queryKey: getListJobItemsQueryKey() });
      setShowCreate(false); setJobNo(""); setCustomer(""); setQuantity("1"); setDescription("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setFormError(message.toLowerCase().includes("active customer") ? t("selectCustomerRequired") : message || t("error"));
    }
  }
  async function register(id: number) {
    setFormError("");
    try {
      await createSerials.mutateAsync({ jobItemId: id, data: mode === "range" ? { mode, rangeStart, rangeEnd } : { mode, values: manualList.split(/[\n,]+/).map(x => x.trim()).filter(Boolean) } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListJobItemsQueryKey() }),
        qc.invalidateQueries({ queryKey: getListJobItemSerialNumbersQueryKey(id) }),
      ]);
      setRegisterTarget(null); setRangeStart(""); setRangeEnd(""); setManualList("");
    } catch (e) { setFormError(`${e instanceof Error ? e.message : t("error")} ${t("duplicate")}`); }
  }
  return <div className="space-y-5 pb-10">
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">IEG / {t("productionRegister")}</p><h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">{t("jobTitle")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("jobDesc")}</p></div>{canCreate && <Button onClick={() => {setFormError("");setShowCreate(v=>!v)}} data-testid="button-create-job"><Plus size={16} className="mr-2"/>{t("createJob")}</Button>}</header>
    {showCreate && <form onSubmit={submitJob} className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="form-create-job">
      <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">{t("jobNo")}<Input value={jobNo} onChange={e=>setJobNo(e.target.value)} required data-testid="input-job-no"/></label>
       <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">{t("customer")}<select value={customerName} onChange={e=>setCustomer(e.target.value)} required disabled={customersQuery.isLoading || !activeCustomers.length} className="h-10 w-full border border-input bg-background px-3 text-sm font-normal normal-case text-foreground" data-testid="input-customer"><option value="">{customersQuery.isLoading ? t("loading") : t("selectCustomer")}</option>{activeCustomers.map(customer=><option key={customer.id} value={customer.name}>{customer.name}</option>)}</select><Link href="/customers" className="mt-1 inline-block text-[11px] font-semibold normal-case text-primary underline">{t("manageCustomers")}</Link></label>
      <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">{t("quantity")}<Input type="number" min="1" value={orderQuantity} onChange={e=>setQuantity(e.target.value)} required data-testid="input-order-quantity"/></label>
      <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">{t("description")}<Input value={description} onChange={e=>setDescription(e.target.value)} required data-testid="input-job-description"/></label>
       <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">{t("primer")} (L / {t("wholeOrder")})<Input type="number" min="0" step="0.05" value={primerBaseL} onChange={e=>setPrimer(e.target.value)} data-testid="input-primer-target"/></label>
       <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">{t("topcoat")} (L / {t("wholeOrder")})<Input type="number" min="0" step="0.05" value={topcoatBaseL} onChange={e=>setTopcoat(e.target.value)} data-testid="input-topcoat-target"/></label>
       <div className="flex items-end gap-2"><Button type="submit" disabled={create.isPending || !activeCustomers.length} data-testid="button-save-job">{create.isPending && <Loader2 size={14} className="mr-2 animate-spin"/>}{t("save")}</Button><Button type="button" variant="outline" onClick={()=>setShowCreate(false)} data-testid="button-cancel-job">{t("cancel")}</Button></div>
    </form>}
    {formError && <div className="flex gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" data-testid="error-job-form"><AlertTriangle size={16} className="shrink-0"/>{formError}</div>}
    <section className="border border-border bg-card"><div className="flex flex-col gap-3 border-b border-border bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest">{all.length} {t("jobs")}</p><p className="mt-1 text-xs text-muted-foreground">{t("duplicate")}</p></div><div className="relative w-full sm:max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("search")} className="bg-background pl-9" aria-label={t("search")} data-testid="input-search-job-items"/></div></div>
       {query.isLoading ? <div className="space-y-3 p-5"><div className="h-12 animate-pulse bg-muted"/><div className="h-12 animate-pulse bg-muted"/><div className="h-12 animate-pulse bg-muted"/></div> : query.error ? <div className="flex items-center justify-center gap-2 p-12 font-bold text-destructive" data-testid="error-job-items"><AlertTriangle size={18}/>{t("error")} <button onClick={()=>void query.refetch()} className="underline">{t("retry")}</button></div> : all.length===0 ? <div className="p-14 text-center"><PaintBucket size={30} className="mx-auto text-muted-foreground"/><p className="mt-3 text-sm font-semibold">{t("noJobs")}</p></div> : <div className="overflow-x-auto"><table className="min-w-[980px]"><thead><tr><th>{t("customer")} / {t("jobNo")} / {t("serial")}</th><th>{t("quantity")}</th><th>{t("description")}</th><th className="text-right">{t("primer")}</th><th className="text-right">{t("topcoat")}</th><th>{t("status")}</th><th/></tr></thead><tbody>{all.map(item=><JobRow key={item.id} item={item} search={debounced} canRegister={canRegister} onRegister={()=>{setRegisterTarget(registerTarget===item.id?null:item.id);setFormError("")}} t={t}/>)}</tbody></table></div>}
    </section>
    {registerTarget !== null && <div className="border border-primary/40 bg-card p-4" data-testid="panel-register-serials"><div className="flex items-center justify-between"><h2 className="font-bold">{t("register")} · {all.find(x=>x.id===registerTarget)?.jobNo}</h2><button onClick={()=>setRegisterTarget(null)} aria-label={t("cancel")} data-testid="button-close-register">×</button></div><p className="mt-1 text-xs text-muted-foreground">{t("duplicate")}</p><div className="mt-4 flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode==="range"} onChange={()=>setMode("range")} data-testid="radio-serial-range"/>{t("range")}</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode==="list"} onChange={()=>setMode("list")} data-testid="radio-serial-list"/>{t("list")}</label></div>{mode==="range"?<div className="mt-3 grid gap-3 sm:grid-cols-2"><Input placeholder={t("serialStart")} value={rangeStart} onChange={e=>setRangeStart(e.target.value)} data-testid="input-serial-range-start"/><Input placeholder={t("end")} value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} data-testid="input-serial-range-end"/></div>:<textarea className="mt-3 min-h-24 w-full border border-input bg-background p-3 font-mono text-sm" placeholder={t("serialListHint")} value={manualList} onChange={e=>setManualList(e.target.value)} data-testid="input-serial-list"/>}<Button className="mt-3" onClick={()=>void register(registerTarget)} disabled={createSerials.isPending} data-testid="button-submit-serials">{createSerials.isPending&&<Loader2 size={14} className="mr-2 animate-spin"/>}{t("register")}</Button></div>}
    <p className="text-right font-mono text-[10px] text-muted-foreground">{new Intl.DateTimeFormat(language==="id"?"id-ID":"en-US",{dateStyle:"medium"}).format(new Date())}</p>
  </div>;
}
