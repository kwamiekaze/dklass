import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, LayoutGrid, Clock } from "lucide-react";
import {
  format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, addWeeks, subWeeks, addMonths, subMonths,
  addDays, subDays, isToday, isBefore, startOfDay, differenceInMinutes,
  getHours, getMinutes, isSameMonth,
} from "date-fns";

export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

export interface CalendarEvent {
  id: string;
  title: string;
  subtitle?: string;
  start: string; // ISO
  end: string;   // ISO
  color: string; // tailwind classes
  dotColor?: string; // for agenda dot
  inactive?: boolean; // cancelled / missed: never covers live sessions
  meta?: Record<string, any>;
}

interface FullCalendarViewProps {
  events: CalendarEvent[];
  defaultView?: CalendarViewMode;
  onEventClick?: (event: CalendarEvent) => void;
  onSlotClick?: (date: Date) => void;
  className?: string;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM
const HOUR_HEIGHT = 60; // px per hour

export function FullCalendarView({
  events,
  defaultView = 'month',
  onEventClick,
  onSlotClick,
  className,
}: FullCalendarViewProps) {
  const [view, setView] = useState<CalendarViewMode>(defaultView);
  const [currentDate, setCurrentDate] = useState(new Date());

  const navigate = (dir: 'prev' | 'next' | 'today') => {
    if (dir === 'today') { setCurrentDate(new Date()); return; }
    const mult = dir === 'prev' ? -1 : 1;
    switch (view) {
      case 'month': setCurrentDate(d => mult > 0 ? addMonths(d, 1) : subMonths(d, 1)); break;
      case 'week': setCurrentDate(d => mult > 0 ? addWeeks(d, 1) : subWeeks(d, 1)); break;
      case 'day': setCurrentDate(d => mult > 0 ? addDays(d, 1) : subDays(d, 1)); break;
      case 'agenda': setCurrentDate(d => mult > 0 ? addWeeks(d, 2) : subWeeks(d, 2)); break;
    }
  };

  const headerLabel = useMemo(() => {
    switch (view) {
      case 'month': return format(currentDate, 'MMMM yyyy');
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
        const we = endOfWeek(currentDate, { weekStartsOn: 0 });
        return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
      }
      case 'day': return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'agenda': return format(currentDate, 'MMMM yyyy');
    }
  }, [view, currentDate]);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium" onClick={() => navigate('today')}>
            Today
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => navigate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm sm:text-base font-semibold ml-2 whitespace-nowrap">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          {([
            { key: 'month', icon: LayoutGrid, label: 'Month' },
            { key: 'week', icon: CalendarIcon, label: 'Week' },
            { key: 'day', icon: Clock, label: 'Day' },
            { key: 'agenda', icon: List, label: 'Agenda' },
          ] as const).map(v => (
            <Button
              key={v.key}
              variant={view === v.key ? 'secondary' : 'ghost'}
              size="sm"
              className={cn("h-7 px-2 text-xs gap-1", view === v.key && "shadow-sm")}
              onClick={() => setView(v.key)}
            >
              <v.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{v.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === 'month' && <MonthView events={events} currentDate={currentDate} onEventClick={onEventClick} onDayClick={(d) => { setCurrentDate(d); setView('day'); }} />}
      {view === 'week' && <WeekView events={events} currentDate={currentDate} onEventClick={onEventClick} onSlotClick={onSlotClick} />}
      {view === 'day' && <DayView events={events} currentDate={currentDate} onEventClick={onEventClick} onSlotClick={onSlotClick} />}
      {view === 'agenda' && <AgendaView events={events} currentDate={currentDate} onEventClick={onEventClick} />}
    </div>
  );
}

// ── Month View ──
function MonthView({ events, currentDate, onEventClick, onDayClick }: {
  events: CalendarEvent[]; currentDate: Date;
  onEventClick?: (e: CalendarEvent) => void; onDayClick?: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(ev => {
      const key = format(parseISO(ev.start), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    });
    // Sort each day's events chronologically so month view matches day view order.
    for (const [, list] of map) {
      list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }
    return map;
  }, [events]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-b bg-muted/30">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) || [];
          const inMonth = isSameMonth(day, currentDate);
          return (
            <div
              key={key}
              className={cn(
                "min-h-[80px] sm:min-h-[100px] p-1 border-b border-r cursor-pointer hover:bg-muted/30 transition-colors",
                !inMonth && "opacity-40 bg-muted/10",
                isToday(day) && "bg-primary/5"
              )}
              onClick={() => onDayClick?.(day)}
            >
              <div className={cn(
                "text-xs sm:text-sm font-medium mb-0.5 h-6 w-6 flex items-center justify-center rounded-full",
                isToday(day) && "bg-primary text-primary-foreground"
              )}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => (
                  <button
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick?.(ev); }}
                    className={cn("w-full text-[10px] sm:text-xs p-0.5 sm:px-1.5 sm:py-0.5 rounded truncate text-left block", ev.color)}
                  >
                    <span className="hidden sm:inline">{format(parseISO(ev.start), 'h:mma')} </span>
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week View ──
function WeekView({ events, currentDate, onEventClick, onSlotClick }: {
  events: CalendarEvent[]; currentDate: Date;
  onEventClick?: (e: CalendarEvent) => void; onSlotClick?: (d: Date) => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate, { weekStartsOn: 0 }) });

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[50px_repeat(7,1fr)] sm:grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/30">
        <div className="border-r" />
        {days.map(day => (
          <div key={day.toISOString()} className={cn(
            "text-center py-2 border-r last:border-r-0",
            isToday(day) && "bg-primary/10"
          )}>
            <div className="text-[10px] sm:text-xs text-muted-foreground">{format(day, 'EEE')}</div>
            <div className={cn(
              "text-sm sm:text-base font-semibold mx-auto h-7 w-7 flex items-center justify-center rounded-full",
              isToday(day) && "bg-primary text-primary-foreground"
            )}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="overflow-y-auto max-h-[500px] sm:max-h-[600px]">
        <div className="grid grid-cols-[50px_repeat(7,1fr)] sm:grid-cols-[60px_repeat(7,1fr)] relative">
          {/* Time labels */}
          <div className="border-r">
            {HOURS.map(hour => (
              <div key={hour} className="h-[60px] border-b flex items-start justify-end pr-1.5 sm:pr-2 pt-0.5">
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </span>
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map(day => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              events={events.filter(ev => isSameDay(parseISO(ev.start), day))}
              onEventClick={onEventClick}
              onSlotClick={onSlotClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Day View ──
function DayView({ events, currentDate, onEventClick, onSlotClick }: {
  events: CalendarEvent[]; currentDate: Date;
  onEventClick?: (e: CalendarEvent) => void; onSlotClick?: (d: Date) => void;
}) {
  const dayEvents = events.filter(ev => isSameDay(parseISO(ev.start), currentDate));

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-y-auto max-h-[600px]">
        <div className="grid grid-cols-[60px_1fr] relative">
          <div className="border-r">
            {HOURS.map(hour => (
              <div key={hour} className="h-[60px] border-b flex items-start justify-end pr-2 pt-0.5">
                <span className="text-xs text-muted-foreground">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </span>
              </div>
            ))}
          </div>
          <DayColumn day={currentDate} events={dayEvents} onEventClick={onEventClick} onSlotClick={onSlotClick} wide />
        </div>
      </div>
    </div>
  );
}

// ── Day Column (shared by Week + Day views) ──
function DayColumn({ day, events, onEventClick, onSlotClick, wide }: {
  day: Date; events: CalendarEvent[];
  onEventClick?: (e: CalendarEvent) => void; onSlotClick?: (d: Date) => void; wide?: boolean;
}) {
  const startOfGrid = new Date(day);
  startOfGrid.setHours(HOURS[0], 0, 0, 0);

  const positionEvent = (ev: CalendarEvent) => {
    const evStart = parseISO(ev.start);
    const evEnd = parseISO(ev.end);
    const startMins = (getHours(evStart) - HOURS[0]) * 60 + getMinutes(evStart);
    const duration = Math.max(differenceInMinutes(evEnd, evStart), 30);
    const top = Math.max(startMins, 0);
    const height = Math.min(duration, HOURS.length * 60 - top);
    return { top, height };
  };

  // Overlap layout: live sessions keep the full readable block (split into
  // side by side lanes if they collide with each other). Cancelled or missed
  // sessions that overlap a live one collapse into a thin strip on the right
  // edge so they never sit behind and muddy the live text.
  const span = (ev: CalendarEvent) => {
    const { top, height } = positionEvent(ev);
    return { a: top, b: top + Math.max(height, 20) };
  };
  const hit = (x: CalendarEvent, y: CalendarEvent) => {
    const p = span(x), q = span(y);
    return p.a < q.b && q.a < p.b;
  };
  const live = events.filter(e => !e.inactive).sort((x, y) => span(x).a - span(y).a);
  const dead = events.filter(e => e.inactive);
  const laneOf = new Map<string, { lane: number; lanes: number }>();
  let cluster: CalendarEvent[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    const lanes = new Map<string, number>();
    cluster.forEach(e => {
      const { a, b } = span(e);
      let l = ends.findIndex(end => end <= a);
      if (l === -1) { l = ends.length; ends.push(b); } else ends[l] = b;
      lanes.set(e.id, l);
    });
    cluster.forEach(e => laneOf.set(e.id, { lane: lanes.get(e.id)!, lanes: ends.length }));
    cluster = [];
  };
  live.forEach(e => {
    const { a, b } = span(e);
    if (cluster.length && a >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, b);
  });
  if (cluster.length) flush();
  const STRIP = 18; // px
  const deadBehind = new Set(dead.filter(d => live.some(l => hit(d, l))).map(d => d.id));
  const liveBeside = new Set(live.filter(l => dead.some(d => hit(d, l))).map(l => l.id));

  return (
    <div className={cn("border-r last:border-r-0 relative", isToday(day) && "bg-primary/[0.02]")}>
      {HOURS.map(hour => (
        <div
          key={hour}
          className="h-[60px] border-b hover:bg-muted/20 cursor-pointer transition-colors"
          onClick={() => {
            const d = new Date(day);
            d.setHours(hour, 0, 0, 0);
            onSlotClick?.(d);
          }}
        />
      ))}
      {/* Events positioned absolutely */}
      {[...dead, ...live].map(ev => {
        const { top, height } = positionEvent(ev);
        const strip = ev.inactive && deadBehind.has(ev.id);
        const lane = laneOf.get(ev.id) ?? { lane: 0, lanes: 1 };
        const reserve = !ev.inactive && liveBeside.has(ev.id) ? STRIP + 2 : 0;
        const style: React.CSSProperties = { top: `${top}px`, height: `${Math.max(height, 20)}px` };
        if (strip) {
          Object.assign(style, { right: 2, left: 'auto', width: STRIP });
        } else if (!ev.inactive && lane.lanes > 1) {
          const w = `calc((100% - ${reserve + 4}px) / ${lane.lanes})`;
          Object.assign(style, { left: `calc(2px + ${w} * ${lane.lane})`, width: `calc(${w} - 2px)`, right: 'auto' });
        } else if (reserve) {
          Object.assign(style, { right: reserve + 2 });
        }
        return (
          <button
            key={ev.id}
            title={`${format(parseISO(ev.start), 'h:mm a')} ${ev.title}${ev.subtitle ? ' · ' + ev.subtitle : ''}`}
            className={cn(
              "absolute left-0.5 right-0.5 sm:left-1 sm:right-1 rounded text-[10px] sm:text-xs overflow-hidden cursor-pointer border border-transparent hover:border-foreground/20 transition-colors",
              strip ? "px-0 py-0 z-0 opacity-70 hover:opacity-100 hover:z-30" : "px-1 sm:px-1.5 py-0.5",
              ev.inactive ? (strip ? "" : "z-0 opacity-80") : "z-10",
              ev.color
            )}
            style={style}
            onClick={(e) => { e.stopPropagation(); onEventClick?.(ev); }}
          >
            {!strip && <div className="font-medium truncate">{format(parseISO(ev.start), 'h:mm a')}</div>}
            {!strip && height >= 40 && <div className="truncate opacity-80">{ev.title}</div>}
            {!strip && height >= 55 && ev.subtitle && <div className="truncate opacity-60">{ev.subtitle}</div>}
          </button>
        );
      })}
      {/* Current time indicator */}
      {isToday(day) && <CurrentTimeIndicator />}
    </div>
  );
}

function CurrentTimeIndicator() {
  const now = new Date();
  const minutesSinceStart = (getHours(now) - HOURS[0]) * 60 + getMinutes(now);
  if (minutesSinceStart < 0 || minutesSinceStart > HOURS.length * 60) return null;
  return (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: `${minutesSinceStart}px` }}
    >
      <div className="flex items-center">
        <div className="h-2.5 w-2.5 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 h-px bg-red-500" />
      </div>
    </div>
  );
}

// ── Agenda View ──
function AgendaView({ events, currentDate, onEventClick }: {
  events: CalendarEvent[]; currentDate: Date; onEventClick?: (e: CalendarEvent) => void;
}) {
  const sortedEvents = useMemo(() => 
    [...events]
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events]
  );

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    sortedEvents.forEach(ev => {
      const key = format(parseISO(ev.start), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    });
    return Array.from(map.entries());
  }, [sortedEvents]);

  if (grouped.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No sessions to display
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([dateKey, dayEvents]) => {
        const date = parseISO(dateKey);
        return (
          <div key={dateKey}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "h-10 w-10 rounded-xl flex flex-col items-center justify-center shrink-0",
                isToday(date) ? "bg-primary text-primary-foreground" : "bg-muted/50"
              )}>
                <span className="text-[10px] leading-none font-medium">{format(date, 'MMM')}</span>
                <span className="text-base leading-none font-bold">{format(date, 'd')}</span>
              </div>
              <div>
                <p className="text-sm font-medium">{format(date, 'EEEE')}</p>
                <p className="text-xs text-muted-foreground">{format(date, 'MMMM d, yyyy')}</p>
              </div>
            </div>
            <div className="space-y-1.5 ml-12">
              {dayEvents.map(ev => (
                <button
                  key={ev.id}
                  className={cn(
                    "w-full flex items-center gap-3 p-2.5 sm:p-3 rounded-lg text-left hover:bg-muted/40 transition-colors border border-border/50",
                  )}
                  onClick={() => onEventClick?.(ev)}
                >
                  <div className={cn("h-3 w-3 rounded-full shrink-0", ev.dotColor || "bg-primary")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-medium">
                        {format(parseISO(ev.start), 'h:mm a')} – {format(parseISO(ev.end), 'h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{ev.title}</p>
                    {ev.subtitle && <p className="text-xs text-muted-foreground truncate">{ev.subtitle}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
