import { useState } from "react";
import { 
  useListAuditLog, 
  getListAuditLogQueryKey,
} from "@workspace/api-client-react";
import { Loader2, Activity, Filter } from "lucide-react";
import { format } from "date-fns";

export function AuditLog() {
  const [filterType, setFilterType] = useState<string>("");
  
  const { data: logs, isLoading, error } = useListAuditLog(
    { entityType: filterType || undefined, limit: 100 },
    { query: { queryKey: [...getListAuditLogQueryKey(), filterType] } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground uppercase tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground font-medium mt-1">Append-only history of system changes.</p>
        </div>
      </div>

      <div className="bg-card border border-border shadow-sm flex flex-col">
        <div className="p-4 border-b border-border bg-secondary/20 flex gap-4">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Filter size={16} /> Filter Entity:
          </div>
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-8 rounded border border-border bg-white px-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Entities</option>
            <option value="JobItem">Job Items</option>
            <option value="Material">Materials</option>
            <option value="Color">Colors</option>
            <option value="User">Users</option>
          </select>
        </div>

        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : error || !logs ? (
          <div className="p-8 text-destructive text-center font-bold">Failed to load audit trail</div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center">
            <Activity className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-bold">No Audit Records</h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  <th className="font-bold w-40">Timestamp</th>
                  <th className="font-bold w-24">Action</th>
                  <th className="font-bold w-48">Entity</th>
                  <th className="font-bold w-40">User</th>
                  <th className="font-bold">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="font-mono text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                    </td>
                    <td>
                      <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                        log.action === 'create' ? 'bg-primary/20 text-foreground border-primary/40' :
                        log.action === 'update' ? 'bg-secondary text-secondary-foreground border-border' :
                        'bg-foreground/10 text-foreground border-border'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono font-bold text-foreground">{log.entityType}</span>
                      <span className="text-muted-foreground ml-1">#{log.entityId}</span>
                    </td>
                    <td className="font-bold text-foreground truncate">{log.actorName || "System"}</td>
                    <td className="py-2 pr-4">
                      {Object.keys(log.changes || {}).length > 0 ? (
                        <div className="font-mono text-xs space-y-1 bg-secondary/50 p-2 rounded border border-border/50">
                          {Object.entries(log.changes).map(([key, val]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-muted-foreground font-semibold w-24 shrink-0">{key}:</span>
                              <span className="text-foreground truncate">{JSON.stringify(val)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">No explicit fields tracked</span>
                      )}
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
