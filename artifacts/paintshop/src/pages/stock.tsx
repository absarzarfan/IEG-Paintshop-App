import { useMemo, useState } from "react";
import {
  getListMaterialsQueryKey,
  getListStockLotsQueryKey,
  getListStockMovementsQueryKey,
  getListStockSummaryQueryKey,
  getListStockTakesQueryKey,
  StockMovementType,
  type StockLotBalance,
  type StockTakeInput,
  useCreateStockTake,
  useCreateStockMovement,
  useListMaterials,
  useListStockLots,
  useListStockMovements,
  useListStockSummary,
  useListStockTakes,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CheckCircle2, ClipboardCheck, Loader2, Plus, TrendingDown, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/lib/language";

function formatLiters(value: number) {
  return `${value.toFixed(3)} L`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function lotIdentity(lot: Pick<StockLotBalance, "materialId" | "lotNo" | "expiryDate">) {
  return JSON.stringify([lot.materialId, lot.lotNo, lot.expiryDate]);
}

export function Stock() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [materialId, setMaterialId] = useState("");
  const [movementType, setMovementType] = useState<StockMovementType>("in");
  const [quantity, setQuantity] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [takeError, setTakeError] = useState("");
  const [takeSuccess, setTakeSuccess] = useState("");
  const [newTakeMaterialId, setNewTakeMaterialId] = useState("");
  const [newTakeLotNo, setNewTakeLotNo] = useState("");
  const [newTakeExpiryDate, setNewTakeExpiryDate] = useState("");
  const [newTakeQuantity, setNewTakeQuantity] = useState("");
  const [newTakeNotes, setNewTakeNotes] = useState("");

  const { data: materials, isLoading: materialsLoading } = useListMaterials({
    query: { queryKey: getListMaterialsQueryKey() },
  });
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useListStockSummary({
    query: { queryKey: getListStockSummaryQueryKey() },
  });
  const { data: movements, isLoading: movementsLoading, error: movementsError } = useListStockMovements({
    query: { queryKey: getListStockMovementsQueryKey() },
  });
  const { data: lots, isLoading: lotsLoading, error: lotsError } = useListStockLots({
    query: { queryKey: getListStockLotsQueryKey() },
  });
  const { data: takes, isLoading: takesLoading, error: takesError } = useListStockTakes({
    query: { queryKey: getListStockTakesQueryKey() },
  });
  const createMutation = useCreateStockMovement();
  const stockTakeMutation = useCreateStockTake();

  const lowStockCount = useMemo(
    () => (summary ?? []).filter((item) => item.stockL <= item.deadStockThreshold).length,
    [summary],
  );
  const totalStock = useMemo(() => (summary ?? []).reduce((total, item) => total + item.stockL, 0), [summary]);

  async function saveStockTake(data: StockTakeInput, key?: string) {
    setTakeError("");
    setTakeSuccess("");
    try {
      const saved = await stockTakeMutation.mutateAsync({ data });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListStockLotsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListStockTakesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListStockSummaryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListStockMovementsQueryKey() }),
      ]);
      if (key) setPhysicalCounts((current) => {
        const updated = { ...current };
        delete updated[key];
        return updated;
      });
      setTakeSuccess(`${t("stocktakeSaved")}: ${saved.materialDescription}${saved.lotNo ? ` · ${saved.lotNo}` : ""} (${saved.varianceL > 0 ? "+" : ""}${saved.varianceL.toFixed(3)} L)`);
      setNewTakeLotNo("");
      setNewTakeExpiryDate("");
      setNewTakeQuantity("");
      setNewTakeNotes("");
    } catch (error) {
      const responseError = typeof error === "object" && error !== null && "data" in error
        ? (error.data as { error?: string } | undefined)?.error
        : undefined;
      setTakeError(responseError || (error instanceof Error ? error.message : t("stockError")));
    }
  }

  async function handleNewStockTake(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedMaterialId = Number(newTakeMaterialId);
    const physicalQuantityL = Number(newTakeQuantity);
    if (!parsedMaterialId || newTakeQuantity === "" || !Number.isFinite(physicalQuantityL) || physicalQuantityL < 0) {
      setTakeError(t("invalidPhysicalQuantity"));
      return;
    }
    await saveStockTake({
      materialId: parsedMaterialId,
      lotNo: newTakeLotNo.trim() || null,
      expiryDate: newTakeExpiryDate || null,
      physicalQuantityL,
      notes: newTakeNotes.trim() || null,
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const parsedMaterialId = Number(materialId);
    const parsedQuantity = Number(quantity);
    if (!parsedMaterialId || !Number.isFinite(parsedQuantity)) {
      setFormError("Material and quantity are required.");
      return;
    }
    if (parsedQuantity <= 0) {
      setFormError("Quantity must be greater than zero.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        data: {
          materialId: parsedMaterialId,
          movementType,
          quantityL: parsedQuantity,
          lotNo: lotNo.trim() || null,
          expiryDate: expiryDate || null,
          notes: notes.trim() || null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListStockSummaryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListStockMovementsQueryKey() }),
      ]);
      setQuantity("");
      setLotNo("");
      setExpiryDate("");
      setNotes("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Stock movement could not be saved.");
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-3 border-b border-border pb-5">
           <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
          <Boxes className="h-4 w-4" /> {t("stock")} / {t("stockControl")}
        </p>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight">{t("stockControl")}</h1>
        <p className="max-w-2xl text-sm font-medium text-muted-foreground">
            {t("stockIntro")}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("totalStock")}</p>
          <p className="mt-1 font-mono text-lg font-bold">{formatLiters(totalStock)}</p>
        </div>
        <div className="border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("trackedMaterials")}</p>
          <p className="mt-1 font-mono text-lg font-bold">{summary?.length ?? 0}</p>
        </div>
        <div className={`border bg-card px-4 py-3 ${lowStockCount ? "border-destructive/50" : "border-border"}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("threshold")}</p>
          <p className={`mt-1 font-mono text-lg font-bold ${lowStockCount ? "text-destructive" : "text-foreground"}`}>{lowStockCount}</p>
        </div>
      </div>

      <section className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-5 py-3">
          <Plus className="h-4 w-4 text-primary" />
           <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{t("recordMovement")}</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
             <Label htmlFor="stock-material">{t("material")}</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
                <SelectTrigger id="stock-material" data-testid="select-stock-material"><SelectValue placeholder={materialsLoading ? t("loading") : t("selectMaterial")} /></SelectTrigger>
              <SelectContent>
                {materials?.filter((material) => material.isActive).map((material) => (
                  <SelectItem value={String(material.id)} key={material.id}>{material.description} — {material.type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
             <Label htmlFor="stock-movement-type">{t("transactionType")}</Label>
            <Select value={movementType} onValueChange={(value) => setMovementType(value as StockMovementType)}>
              <SelectTrigger id="stock-movement-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["in", "out", "return_to_stock"] as StockMovementType[]).map((type) => (
                  <SelectItem value={type} key={type}>{type === "return_to_stock" ? t("stockReturn") : t(type === "in" ? "receipt" : "issue")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
             <Label htmlFor="stock-quantity">{t("quantityL")}</Label>
            <Input id="stock-quantity" type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={t("stockQuantityPlaceholder")} />
          </div>
          <div className="space-y-2">
             <Label htmlFor="stock-lot">{t("lot")} <span className="font-normal text-muted-foreground">({t("optional")})</span></Label>
            <Input id="stock-lot" value={lotNo} onChange={(event) => setLotNo(event.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
             <Label htmlFor="stock-expiry">{t("expiry")} <span className="font-normal text-muted-foreground">({t("optional")})</span></Label>
            <Input id="stock-expiry" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
             <Label htmlFor="stock-notes">{t("notes")} <span className="font-normal text-muted-foreground">({t("optional")})</span></Label>
             <Textarea id="stock-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder={t("stockNotesPlaceholder")} />
          </div>
          {formError && <div className="flex items-start gap-2 text-sm font-semibold text-destructive md:col-span-2 lg:col-span-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{formError}</div>}
          <div className="md:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={createMutation.isPending} className="font-bold uppercase tracking-wider">
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("saveTransaction")}
            </Button>
          </div>
        </form>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border bg-secondary/20 px-5 py-3">
           <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{t("balances")}</h2>
        </div>
        {summaryLoading ? <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div> : summaryError ? (
            <div className="p-8 text-center font-bold text-destructive">{t("stockError")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px]">
               <thead><tr><th>{t("material")}</th><th>{t("brand")}</th><th className="text-right">{t("balance")}</th><th className="text-right">{t("threshold")}</th><th>{t("status")}</th></tr></thead>
              <tbody>
                {(summary ?? []).map((item) => {
                  const isLow = item.stockL <= item.deadStockThreshold;
                  return <tr key={item.materialId}>
                    <td><p className="font-bold">{item.materialDescription}</p><p className="text-xs text-muted-foreground">{item.packagingSizeL} L / pack</p></td>
                    <td>{item.brandName}</td>
                    <td className={`text-right font-mono font-bold ${isLow ? "text-destructive" : "text-foreground"}`}>{formatLiters(item.stockL)}</td>
                    <td className="text-right font-mono text-muted-foreground">{formatLiters(item.deadStockThreshold)}</td>
                    <td>{isLow ? <span className="inline-flex items-center gap-1 text-xs font-bold text-destructive"><TrendingDown className="h-3 w-3" /> {t("low")}</span> : <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> {t("ok")}</span>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border bg-secondary/20 px-5 py-3">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{t("stocktakeTitle")}</h2>
        </div>
        <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground">{t("stocktakeIntro")}</p>
        {takeError && <div className="m-5 flex items-start gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" data-testid="error-stocktake"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{takeError}</div>}
        {takeSuccess && <p className="mx-5 mt-4 border border-emerald-700/20 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800" role="status">{takeSuccess}</p>}
        {lotsLoading ? <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary"/></div> : lotsError ? (
          <p className="p-8 text-center font-bold text-destructive">{t("stockError")}</p>
        ) : lots?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[960px]">
              <thead><tr><th>{t("material")}</th><th>{t("lot")} / {t("expiry")}</th><th className="text-right">{t("systemQuantity")}</th><th>{t("physicalQuantity")}</th><th>{t("actions")}</th></tr></thead>
              <tbody>{lots.map((lot) => {
                const key = lotIdentity(lot);
                const physicalValue = physicalCounts[key] ?? String(lot.stockL);
                return <tr key={key}>
                  <td><p className="font-bold">{lot.materialDescription}</p><p className="text-xs text-muted-foreground">{lot.brandName}</p></td>
                  <td><p className="font-mono text-xs">{lot.lotNo || "—"}</p><p className="text-xs text-muted-foreground">{formatDate(lot.expiryDate)}</p></td>
                  <td className="text-right font-mono font-bold">{formatLiters(lot.stockL)}</td>
                  <td><Input type="number" min="0" step="0.001" value={physicalValue} onChange={(event) => setPhysicalCounts((current) => ({ ...current, [key]: event.target.value }))} className="max-w-40 text-right font-mono" aria-label={`${t("physicalQuantity")} ${lot.materialDescription} ${lot.lotNo || ""}`} data-testid={`input-stocktake-${lot.materialId}-${lot.lotNo || "untracked"}`}/></td>
                  <td><Button type="button" size="sm" variant="outline" disabled={stockTakeMutation.isPending} onClick={() => {
                    const physicalQuantityL = Number(physicalValue);
                    if (physicalValue === "" || !Number.isFinite(physicalQuantityL) || physicalQuantityL < 0) {
                      setTakeError(t("invalidPhysicalQuantity"));
                      return;
                    }
                    void saveStockTake({
                      materialId: lot.materialId,
                      lotNo: lot.lotNo,
                      expiryDate: lot.expiryDate,
                      physicalQuantityL,
                      notes: null,
                    }, key);
                  }} data-testid={`button-reconcile-stocktake-${lot.materialId}-${lot.lotNo || "untracked"}`}>{stockTakeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}{t("reconcile")}</Button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <p className="p-8 text-center text-sm text-muted-foreground">{t("noLots")}</p>}

        <form onSubmit={handleNewStockTake} className="grid gap-4 border-t border-border bg-secondary/10 p-5 md:grid-cols-2 lg:grid-cols-3" data-testid="form-stocktake-new-lot">
          <div className="space-y-2 lg:col-span-3"><Label htmlFor="stocktake-material">{t("newLotCount")} · {t("material")}</Label>
            <Select value={newTakeMaterialId} onValueChange={setNewTakeMaterialId}>
              <SelectTrigger id="stocktake-material"><SelectValue placeholder={t("selectMaterial")}/></SelectTrigger>
              <SelectContent>{materials?.filter((material) => material.isActive).map((material) => <SelectItem key={material.id} value={String(material.id)}>{material.description} — {material.type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="stocktake-lot">{t("lot")}</Label><Input id="stocktake-lot" value={newTakeLotNo} onChange={(event) => setNewTakeLotNo(event.target.value)} maxLength={120}/></div>
          <div className="space-y-2"><Label htmlFor="stocktake-expiry">{t("expiry")}</Label><Input id="stocktake-expiry" type="date" value={newTakeExpiryDate} onChange={(event) => setNewTakeExpiryDate(event.target.value)}/></div>
          <div className="space-y-2"><Label htmlFor="stocktake-quantity">{t("physicalQuantity")}</Label><Input id="stocktake-quantity" type="number" min="0" step="0.001" value={newTakeQuantity} onChange={(event) => setNewTakeQuantity(event.target.value)}/></div>
          <div className="space-y-2 md:col-span-2 lg:col-span-3"><Label htmlFor="stocktake-notes">{t("notes")} ({t("optional")})</Label><Textarea id="stocktake-notes" value={newTakeNotes} onChange={(event) => setNewTakeNotes(event.target.value)} maxLength={500}/></div>
          <div className="md:col-span-2 lg:col-span-3"><Button type="submit" disabled={stockTakeMutation.isPending} data-testid="button-submit-stocktake">{stockTakeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{t("reconcile")}</Button></div>
        </form>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border bg-secondary/20 px-5 py-3"><h2 className="text-xs font-bold uppercase tracking-[0.16em]">{t("stocktakeHistory")}</h2></div>
        {takesLoading ? <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary"/></div> : takesError ? (
          <p className="p-8 text-center font-bold text-destructive">{t("stockError")}</p>
        ) : takes?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[980px]">
              <thead><tr><th>{t("date")}</th><th>{t("material")}</th><th>{t("lot")} / {t("expiry")}</th><th className="text-right">{t("systemQuantity")}</th><th className="text-right">{t("physicalQuantity")}</th><th className="text-right">{t("varianceL")}</th><th>{t("recordedBy")}</th><th>{t("transactionType")}</th></tr></thead>
              <tbody>{takes.map((take) => <tr key={take.id} data-testid={`row-stocktake-${take.id}`}>
                <td className="font-mono text-xs text-muted-foreground">{formatDateTime(take.createdAt)}</td>
                <td className="font-bold">{take.materialDescription}<p className="text-xs font-normal text-muted-foreground">{take.brandName}</p></td>
                <td><p className="font-mono text-xs">{take.lotNo || "—"}</p><p className="text-xs text-muted-foreground">{formatDate(take.expiryDate)}</p></td>
                <td className="text-right font-mono">{formatLiters(take.systemQuantityL)}</td>
                <td className="text-right font-mono">{formatLiters(take.physicalQuantityL)}</td>
                <td className={`text-right font-mono font-bold ${take.varianceL > 0 ? "text-emerald-700" : take.varianceL < 0 ? "text-destructive" : "text-muted-foreground"}`}>{take.varianceL > 0 ? "+" : ""}{formatLiters(take.varianceL)}</td>
                <td>{take.countedByName || "System"}</td>
                <td className="text-xs font-bold">{take.movementType === "return_to_stock" ? t("stockReturn") : take.movementType === "out" ? t("issue") : t("noStockMovement")}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <p className="p-8 text-center text-sm text-muted-foreground">{t("noStocktakes")}</p>}
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border bg-secondary/20 px-5 py-3">
           <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{t("movementHistory")}</h2>
        </div>
        {movementsLoading ? <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div> : movementsError ? (
            <div className="p-8 text-center font-bold text-destructive">{t("stockError")}</div>
        ) : movements?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[980px]">
                <thead><tr><th>{t("date")}</th><th>{t("material")}</th><th>{t("transactionType")}</th><th className="text-right">{t("quantityL")}</th><th>{t("lot")} / {t("expiry")}</th><th>{t("recordedBy")}</th></tr></thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="font-mono text-xs text-muted-foreground">{formatDateTime(movement.createdAt)}</td>
                    <td className="font-bold">{movement.materialDescription}<p className="text-xs font-normal text-muted-foreground">{movement.brandName}</p></td>
                     <td><span className="text-xs font-bold uppercase tracking-wider">{movement.movementType === "return_to_stock" ? t("stockReturn") : t(movement.movementType === "in" ? "receipt" : "issue")}</span></td>
                    <td className={`text-right font-mono font-bold ${movement.quantityL < 0 ? "text-destructive" : "text-emerald-700"}`}>{movement.quantityL > 0 ? "+" : ""}{formatLiters(movement.quantityL)}</td>
                    <td><p className="font-mono text-xs">{movement.lotNo || "—"}</p><p className="text-xs text-muted-foreground">{formatDate(movement.expiryDate)}</p></td>
                    <td className="text-sm">{movement.createdByName || "System"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
            <div className="p-12 text-center text-sm font-medium text-muted-foreground"><XCircle className="mx-auto mb-2 h-6 w-6" />{t("noMovements")}</div>
        )}
      </section>
    </div>
  );
}