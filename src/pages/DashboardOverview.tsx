import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichSchichtplan } from '@/lib/enrich';
import type { EnrichedSchichtplan } from '@/types/enriched';
import type { Schichtplan } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { SchichtplanDialog } from '@/components/dialogs/SchichtplanDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatCard } from '@/components/StatCard';
import {
  IconAlertCircle,
  IconTool,
  IconRefresh,
  IconCheck,
  IconPlus,
  IconPencil,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
  IconUsers,
  IconCalendar,
  IconClockHour4,
} from '@tabler/icons-react';
import {
  addDays,
  startOfWeek,
  format,
  isSameDay,
  parseISO,
  addWeeks,
  subWeeks,
  isToday,
} from 'date-fns';
import { de } from 'date-fns/locale';

const APPGROUP_ID = '69f081d2cb9d78c5fb447ac7';
const REPAIR_ENDPOINT = '/claude/build/repair';

export default function DashboardOverview() {
  const {
    mitarbeiter, schichttypen, schichtplan,
    mitarbeiterMap, schichttypenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedSchichtplan = enrichSchichtplan(schichtplan, { schichttypenMap, mitarbeiterMap });

  const [weekOffset, setWeekOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EnrichedSchichtplan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedSchichtplan | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [prefillMitarbeiterId, setPrefillMitarbeiterId] = useState<string | null>(null);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(base, weekOffset);
  }, [weekOffset]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Group enriched schichtplan by date string
  const schichtplanByDate = useMemo(() => {
    const map = new Map<string, EnrichedSchichtplan[]>();
    for (const sp of enrichedSchichtplan) {
      const d = sp.fields.datum ?? '';
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(sp);
    }
    return map;
  }, [enrichedSchichtplan]);

  const totalThisWeek = useMemo(() => {
    return weekDays.reduce((sum, day) => {
      const key = format(day, 'yyyy-MM-dd');
      return sum + (schichtplanByDate.get(key)?.length ?? 0);
    }, 0);
  }, [weekDays, schichtplanByDate]);

  const handleOpenCreate = (date?: string, mitarbeiterId?: string) => {
    setEditRecord(null);
    setPrefillDate(date ?? null);
    setPrefillMitarbeiterId(mitarbeiterId ?? null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (sp: EnrichedSchichtplan) => {
    setEditRecord(sp);
    setPrefillDate(null);
    setPrefillMitarbeiterId(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (fields: Schichtplan['fields']) => {
    if (editRecord) {
      await LivingAppsService.updateSchichtplanEntry(editRecord.record_id, fields);
    } else {
      await LivingAppsService.createSchichtplanEntry(fields);
    }
    fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await LivingAppsService.deleteSchichtplanEntry(deleteTarget.record_id);
    setDeleteTarget(null);
    fetchAll();
  };

  // Build defaultValues for dialog
  const dialogDefaultValues = useMemo((): Partial<Schichtplan['fields']> | undefined => {
    if (editRecord) {
      return editRecord.fields;
    }
    if (prefillDate || prefillMitarbeiterId) {
      const vals: Partial<Schichtplan['fields']> = {};
      if (prefillDate) vals.datum = prefillDate;
      if (prefillMitarbeiterId) vals.zugewiesene_mitarbeiter = createRecordUrl(APP_IDS.MITARBEITER, prefillMitarbeiterId);
      return vals;
    }
    return undefined;
  }, [editRecord, prefillDate, prefillMitarbeiterId]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const weekLabel = `${format(weekStart, 'd. MMM', { locale: de })} – ${format(addDays(weekStart, 6), 'd. MMM yyyy', { locale: de })}`;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          title="Mitarbeiter"
          value={String(mitarbeiter.length)}
          description="Gesamt"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Schichttypen"
          value={String(schichttypen.length)}
          description="Definiert"
          icon={<IconClockHour4 size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Diese Woche"
          value={String(totalThisWeek)}
          description="Schichten geplant"
          icon={<IconCalendar size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Week Planner */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
              onClick={() => setWeekOffset(w => w - 1)}
              aria-label="Vorherige Woche"
            >
              <IconChevronLeft size={16} className="shrink-0" />
            </button>
            <span className="font-semibold text-sm truncate">{weekLabel}</span>
            <button
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
              onClick={() => setWeekOffset(w => w + 1)}
              aria-label="Nächste Woche"
            >
              <IconChevronRight size={16} className="shrink-0" />
            </button>
            {weekOffset !== 0 && (
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => setWeekOffset(0)}
              >
                Heute
              </button>
            )}
          </div>
          <Button size="sm" onClick={() => handleOpenCreate()}>
            <IconPlus size={14} className="mr-1 shrink-0" />
            Neue Schicht
          </Button>
        </div>

        {/* Calendar Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            {/* Day Headers */}
            <div className="grid grid-cols-7 border-b border-border">
              {weekDays.map((day) => {
                const today = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`px-2 py-2 text-center border-r border-border last:border-r-0 ${today ? 'bg-primary/5' : ''}`}
                  >
                    <div className={`text-xs font-medium ${today ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, 'EEE', { locale: de })}
                    </div>
                    <div
                      className={`text-sm font-bold mt-0.5 w-7 h-7 flex items-center justify-center mx-auto rounded-full ${
                        today ? 'bg-primary text-primary-foreground' : 'text-foreground'
                      }`}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7">
              {weekDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const entries = schichtplanByDate.get(key) ?? [];
                const today = isToday(day);
                return (
                  <div
                    key={key}
                    className={`min-h-[120px] border-r border-border last:border-r-0 p-1.5 flex flex-col gap-1 ${today ? 'bg-primary/5' : ''}`}
                  >
                    {entries.map((sp) => {
                      const schichttyp = schichttypenMap.get(extractRecordId(sp.fields.schichttyp) ?? '');
                      const color = schichttyp?.fields.farbcode ?? '#6366f1';
                      return (
                        <div
                          key={sp.record_id}
                          className="rounded-lg px-2 py-1.5 text-[11px] leading-tight flex flex-col gap-0.5 group relative"
                          style={{
                            backgroundColor: hexToRgba(color, 0.15),
                            borderLeft: `3px solid ${color}`,
                          }}
                        >
                          <div className="font-semibold truncate" style={{ color }}>
                            {sp.schichttypName || '—'}
                          </div>
                          <div className="text-muted-foreground truncate">
                            {sp.zugewiesene_mitarbeiterName || 'Kein Mitarbeiter'}
                          </div>
                          {schichttyp && (schichttyp.fields.startzeit || schichttyp.fields.endzeit) && (
                            <div className="text-muted-foreground/70 text-[10px]">
                              {schichttyp.fields.startzeit ?? ''}{schichttyp.fields.endzeit ? `–${schichttyp.fields.endzeit}` : ''}
                            </div>
                          )}
                          {/* Actions always visible */}
                          <div className="flex gap-1 mt-0.5">
                            <button
                              className="p-0.5 rounded hover:bg-black/10 transition-colors"
                              onClick={() => handleOpenEdit(sp)}
                              aria-label="Bearbeiten"
                            >
                              <IconPencil size={11} className="shrink-0" />
                            </button>
                            <button
                              className="p-0.5 rounded hover:bg-destructive/20 transition-colors"
                              onClick={() => setDeleteTarget(sp)}
                              aria-label="Löschen"
                            >
                              <IconTrash size={11} className="text-destructive shrink-0" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      className="mt-auto flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-primary hover:bg-accent rounded-lg p-1 transition-colors w-full"
                      onClick={() => handleOpenCreate(key)}
                    >
                      <IconPlus size={12} className="shrink-0" />
                      Hinzufügen
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Mitarbeiter Overview */}
      {mitarbeiter.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Mitarbeiter diese Woche</h2>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium whitespace-nowrap">Name</th>
                  {weekDays.map(day => (
                    <th key={day.toISOString()} className="pb-2 px-1 font-medium text-center whitespace-nowrap">
                      <span className={isToday(day) ? 'text-primary' : ''}>
                        {format(day, 'EEE d', { locale: de })}
                      </span>
                    </th>
                  ))}
                  <th className="pb-2 pl-4 font-medium text-right whitespace-nowrap">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map(ma => {
                  const dayCounts = weekDays.map(day => {
                    const key = format(day, 'yyyy-MM-dd');
                    const entries = schichtplanByDate.get(key) ?? [];
                    return entries.filter(sp => {
                      const mid = extractRecordId(sp.fields.zugewiesene_mitarbeiter);
                      return mid === ma.record_id;
                    });
                  });
                  const total = dayCounts.reduce((s, e) => s + e.length, 0);
                  return (
                    <tr key={ma.record_id} className="border-t border-border/50">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <div className="font-medium truncate max-w-[120px]">
                          {ma.fields.vorname} {ma.fields.nachname}
                        </div>
                        {ma.fields.position && (
                          <div className="text-xs text-muted-foreground truncate max-w-[120px]">{ma.fields.position}</div>
                        )}
                      </td>
                      {dayCounts.map((entries, i) => {
                        const day = weekDays[i];
                        const dayKey = format(day, 'yyyy-MM-dd');
                        return (
                          <td key={day.toISOString()} className={`py-2 px-1 text-center ${isToday(day) ? 'bg-primary/5' : ''}`}>
                            {entries.length > 0 ? (
                              <div className="flex flex-col gap-0.5 items-center">
                                {entries.map(sp => {
                                  const schichttyp = schichttypenMap.get(extractRecordId(sp.fields.schichttyp) ?? '');
                                  const color = schichttyp?.fields.farbcode ?? '#6366f1';
                                  return (
                                    <button
                                      key={sp.record_id}
                                      className="px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[64px]"
                                      style={{ backgroundColor: hexToRgba(color, 0.2), color }}
                                      onClick={() => handleOpenEdit(sp)}
                                      title={sp.schichttypName}
                                    >
                                      {sp.schichttypName || '—'}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <button
                                className="w-6 h-6 rounded-full flex items-center justify-center mx-auto text-muted-foreground/40 hover:text-primary hover:bg-accent transition-colors"
                                onClick={() => handleOpenCreate(dayKey, ma.record_id)}
                                aria-label="Schicht hinzufügen"
                              >
                                <IconPlus size={12} className="shrink-0" />
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 pl-4 text-right">
                        <span className={`font-semibold text-sm ${total > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {total}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schichttypen Legende */}
      {schichttypen.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="font-semibold text-sm mb-3">Schichttypen</h2>
          <div className="flex flex-wrap gap-2">
            {schichttypen.map(st => {
              const color = st.fields.farbcode ?? '#6366f1';
              return (
                <div
                  key={st.record_id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: hexToRgba(color, 0.15), color }}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="truncate max-w-[100px]">{st.fields.schichtname ?? '—'}</span>
                  {st.fields.startzeit && st.fields.endzeit && (
                    <span className="opacity-70">{st.fields.startzeit}–{st.fields.endzeit}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <SchichtplanDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRecord(null); }}
        onSubmit={handleSubmit}
        defaultValues={dialogDefaultValues}
        mitarbeiterList={mitarbeiter}
        schichttypenList={schichttypen}
        enablePhotoScan={AI_PHOTO_SCAN['Schichtplan']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Schichtplan']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Schicht löschen"
        description={deleteTarget
          ? `Schicht „${deleteTarget.schichttypName || '—'}" am ${formatDate(deleteTarget.fields.datum)} wirklich löschen?`
          : 'Eintrag wirklich löschen?'
        }
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(99,102,241,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
