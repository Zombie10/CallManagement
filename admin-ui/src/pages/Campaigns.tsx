import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTenant } from "../contexts/TenantContext";
import { useUiLocale } from "../contexts/LocaleContext";
import { api, type CampaignContactInput, type SalesCampaign } from "../lib/api";
import { formatDuration } from "../lib/reportDisplay";

type DraftContact = CampaignContactInput & { key: string };

const WEEKDAYS = [
  ["0", "campaigns.weekday.mon"],
  ["1", "campaigns.weekday.tue"],
  ["2", "campaigns.weekday.wed"],
  ["3", "campaigns.weekday.thu"],
  ["4", "campaigns.weekday.fri"],
  ["5", "campaigns.weekday.sat"],
  ["6", "campaigns.weekday.sun"],
] as const;

const BASE_ZONES = ["America/Los_Angeles", "America/Chicago", "America/New_York", "America/Managua", "UTC"];
const RESULTS = ["answered", "no-answer", "busy", "failed"] as const;

function browserZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function zoneChoices(current: string) {
  const local = browserZone();
  const values = [local, current, ...BASE_ZONES].filter(Boolean);
  return [...new Set(values)];
}

function emptyContact(): DraftContact {
  return { key: crypto.randomUUID(), phone: "", name: "", may_call: true, do_not_call: false };
}

function weekdaySet(value: string) {
  return new Set((value || "0,1,2,3,4,5,6").split(",").filter(Boolean));
}

export function Campaigns() {
  const { t } = useUiLocale();
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [product, setProduct] = useState("");
  const [opening, setOpening] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  const [timezone, setTimezone] = useState(browserZone);
  const [weekdays, setWeekdays] = useState("0,1,2,3,4,5,6");
  const [scheduledTime, setScheduledTime] = useState("");
  const [callerId, setCallerId] = useState("");
  const [pace, setPace] = useState(1);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [contacts, setContacts] = useState<DraftContact[]>([emptyContact()]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", tenantId],
    queryFn: () => api.campaigns(),
    enabled: !!tenantId,
  });
  const numbers = useQuery({
    queryKey: ["outbound-numbers", tenantId],
    queryFn: () => api.outboundNumbers(),
    enabled: !!tenantId,
  });

  const selected = data?.items.find((item) => item.id === selectedId) ?? data?.items[0] ?? null;
  const callerChoices = numbers.data?.numbers ?? [];

  const save = useMutation({
    mutationFn: () =>
      api.createCampaign({
        name,
        agent: "sales",
        window_start: windowStart,
        window_end: windowEnd,
        timezone,
        pace,
        max_attempts: maxAttempts,
        product,
        opening_line: opening,
        forbidden,
        weekdays,
        scheduled_time: scheduledTime,
        caller_id: callerId,
        contacts: contacts
          .filter((contact) => contact.phone.trim() && contact.name.trim())
          .map(({ phone, name: contactName, may_call, do_not_call }) => ({
            phone,
            name: contactName,
            may_call,
            do_not_call,
          })),
      }),
    onSuccess: (created) => {
      setSelectedId(created.id);
      setNotice(t("campaigns.saved"));
      setError(null);
      setName("");
      setProduct("");
      setOpening("");
      setForbidden("");
      setContacts([emptyContact()]);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err: Error) => {
      setNotice(null);
      setError(err.message);
    },
  });

  if (!tenantId || (isLoading && !data)) {
    return <div className="glass-card p-8 text-slate-400">{t("campaigns.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">{t("campaigns.title")}</h1>
        <p className="mt-1 text-slate-400">{t("campaigns.subtitle")}</p>
        <p className="mt-2 text-sm text-slate-500">{t("campaigns.trunkHint")}</p>
      </header>

      {notice && <p className="text-sm text-cyan-200">{notice}</p>}
      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <form
        className="glass-card space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!weekdaySet(weekdays).size) {
            setError(t("campaigns.needWeekday"));
            return;
          }
          save.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-name">
            <span>{t("campaigns.name")}</span>
            <input id="campaign-name" className="input-field w-full" name="name" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-agent">
            <span>{t("campaigns.agent")}</span>
            <select id="campaign-agent" className="input-field w-full" name="agent" value="sales" disabled>
              <option value="sales">{t("campaigns.agentOption")}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-300 md:col-span-2" htmlFor="campaign-product">
            <span>{t("campaigns.product")}</span>
            <input id="campaign-product" className="input-field w-full" name="product" value={product} onChange={(event) => setProduct(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-opening">
            <span>{t("campaigns.opening")}</span>
            <textarea id="campaign-opening" className="input-field w-full" name="opening_line" rows={2} value={opening} onChange={(event) => setOpening(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-forbidden">
            <span>{t("campaigns.forbidden")}</span>
            <textarea id="campaign-forbidden" className="input-field w-full" name="forbidden" rows={2} value={forbidden} onChange={(event) => setForbidden(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-window-start">
            <span>{t("campaigns.windowStart")}</span>
            <input id="campaign-window-start" className="input-field w-full" type="time" name="window_start" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} required />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-window-end">
            <span>{t("campaigns.windowEnd")}</span>
            <input id="campaign-window-end" className="input-field w-full" type="time" name="window_end" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} required />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-timezone">
            <span>{t("campaigns.timezone")}</span>
            <select id="campaign-timezone" className="input-field w-full" name="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {zoneChoices(timezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-scheduled">
            <span>{t("campaigns.scheduledTime")}</span>
            <input id="campaign-scheduled" className="input-field w-full" type="time" name="scheduled_time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-caller">
            <span>{t("campaigns.callerId")}</span>
            <select id="campaign-caller" className="input-field w-full" name="caller_id" value={callerId} onChange={(event) => setCallerId(event.target.value)}>
              <option value="">{callerChoices.length ? "—" : t("campaigns.noCallerId")}</option>
              {callerChoices.map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-pace">
            <span>{t("campaigns.pace")}</span>
            <input
              id="campaign-pace"
              className="input-field w-full"
              type="number"
              name="pace"
              min={1}
              value={pace}
              onChange={(event) => setPace(Number(event.target.value))}
              required
            />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor="campaign-attempts">
            <span>{t("campaigns.maxAttempts")}</span>
            <input
              id="campaign-attempts"
              className="input-field w-full"
              type="number"
              name="max_attempts"
              min={1}
              value={maxAttempts}
              onChange={(event) => setMaxAttempts(Number(event.target.value))}
              required
            />
          </label>
        </div>
        <WeekdayField idPrefix="new" value={weekdays} onChange={setWeekdays} />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-200">{t("campaigns.contacts")}</h2>
            <button type="button" className="btn-ghost text-xs" onClick={() => setContacts((rows) => [...rows, emptyContact()])}>
              <Plus className="h-4 w-4" />
              {t("campaigns.addContact")}
            </button>
          </div>
          {contacts.map((contact) => (
            <div key={contact.key} className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto]">
              <input
                className="input-field"
                name="phone"
                autoComplete="tel"
                placeholder={t("campaigns.phone")}
                aria-label={t("campaigns.phone")}
                value={contact.phone}
                onChange={(event) =>
                  setContacts((rows) =>
                    rows.map((row) => (row.key === contact.key ? { ...row, phone: event.target.value } : row)),
                  )
                }
              />
              <input
                className="input-field"
                name="contact_name"
                autoComplete="name"
                placeholder={t("campaigns.contactName")}
                aria-label={t("campaigns.contactName")}
                value={contact.name}
                onChange={(event) =>
                  setContacts((rows) =>
                    rows.map((row) => (row.key === contact.key ? { ...row, name: event.target.value } : row)),
                  )
                }
              />
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  name="may_call"
                  checked={contact.may_call}
                  onChange={(event) =>
                    setContacts((rows) =>
                      rows.map((row) => (row.key === contact.key ? { ...row, may_call: event.target.checked } : row)),
                    )
                  }
                />
                {t("campaigns.mayCall")}
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  name="do_not_call"
                  checked={contact.do_not_call}
                  onChange={(event) =>
                    setContacts((rows) =>
                      rows.map((row) =>
                        row.key === contact.key ? { ...row, do_not_call: event.target.checked } : row,
                      ),
                    )
                  }
                />
                {t("campaigns.doNotCall")}
              </label>
              <button
                type="button"
                className="btn-ghost text-xs"
                aria-label={t("campaigns.removeContact")}
                onClick={() => setContacts((rows) => rows.filter((row) => row.key !== contact.key))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {t("campaigns.save")}
        </button>
      </form>

      {data?.items.length ? (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <ul className="space-y-2">
            {data.items.map((campaign) => (
              <li key={campaign.id}>
                <button
                  type="button"
                  className="glass-card w-full px-3 py-2 text-left text-sm"
                  onClick={() => setSelectedId(campaign.id)}
                >
                  {campaign.name}
                  {campaign.paused ? ` · ${t("campaigns.paused")}` : ""}
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <CampaignDetail
              campaign={selected}
              callerChoices={callerChoices}
              onError={setError}
              onNotice={setNotice}
            />
          )}
        </div>
      ) : (
        <div className="glass-card flex flex-col items-center gap-2 py-12 text-slate-500">
          <Megaphone className="h-5 w-5" />
          {t("campaigns.empty")}
        </div>
      )}
    </div>
  );
}

function WeekdayField({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useUiLocale();
  const selected = weekdaySet(value);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-slate-300">{t("campaigns.weekdays")}</legend>
      <div className="flex flex-wrap gap-3">
        {WEEKDAYS.map(([day, key]) => (
          <label key={day} className="flex items-center gap-2 text-xs text-slate-300" htmlFor={`${idPrefix}-day-${day}`}>
            <input
              id={`${idPrefix}-day-${day}`}
              type="checkbox"
              name="weekdays"
              value={day}
              checked={selected.has(day)}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(day);
                else next.delete(day);
                onChange([...next].sort().join(","));
              }}
            />
            {t(key)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CampaignDetail({
  campaign,
  callerChoices,
  onError,
  onNotice,
}: {
  campaign: SalesCampaign;
  callerChoices: string[];
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const { t } = useUiLocale();
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [product, setProduct] = useState(campaign.product || "");
  const [opening, setOpening] = useState(campaign.opening_line || "");
  const [forbidden, setForbidden] = useState(campaign.forbidden || "");
  const [windowStart, setWindowStart] = useState(campaign.window_start);
  const [windowEnd, setWindowEnd] = useState(campaign.window_end);
  const [timezone, setTimezone] = useState(campaign.timezone);
  const [weekdays, setWeekdays] = useState(campaign.weekdays || "0,1,2,3,4,5,6");
  const [scheduledTime, setScheduledTime] = useState(campaign.scheduled_time || "");
  const [callerId, setCallerId] = useState(campaign.caller_id || "");
  const [pace, setPace] = useState(campaign.pace);
  const [maxAttempts, setMaxAttempts] = useState(campaign.max_attempts);
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    setProduct(campaign.product || "");
    setOpening(campaign.opening_line || "");
    setForbidden(campaign.forbidden || "");
    setWindowStart(campaign.window_start);
    setWindowEnd(campaign.window_end);
    setTimezone(campaign.timezone);
    setWeekdays(campaign.weekdays || "0,1,2,3,4,5,6");
    setScheduledTime(campaign.scheduled_time || "");
    setCallerId(campaign.caller_id || "");
    setPace(campaign.pace);
    setMaxAttempts(campaign.max_attempts);
  }, [campaign]);

  const found = useQuery({
    queryKey: ["campaign-contacts", campaign.id, search],
    queryFn: () => api.searchCampaignContacts(campaign.id, search.trim()),
    enabled: search.trim().length > 0,
  });
  const customers = useQuery({
    queryKey: ["customers", tenantId],
    queryFn: () => api.customers(500, tenantId),
    enabled: !!tenantId,
  });
  const report = useQuery({
    queryKey: ["campaign-report", campaign.id, result, from, to],
    queryFn: () =>
      api.campaignReport(campaign.id, {
        result: result || undefined,
        start: from || undefined,
        end: to || undefined,
      }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    qc.invalidateQueries({ queryKey: ["campaign-report", campaign.id] });
    qc.invalidateQueries({ queryKey: ["campaign-contacts", campaign.id] });
  };
  const fail = (err: Error) => {
    onNotice(null);
    onError(err.message);
  };
  const ok = () => {
    onError(null);
    onNotice(t("campaigns.saved"));
    refresh();
  };

  const save = useMutation({
    mutationFn: () =>
      api.updateCampaign(campaign.id, {
        product,
        opening_line: opening,
        forbidden,
        window_start: windowStart,
        window_end: windowEnd,
        timezone,
        weekdays,
        scheduled_time: scheduledTime,
        caller_id: callerId,
        pace,
        max_attempts: maxAttempts,
      }),
    onSuccess: ok,
    onError: fail,
  });
  const start = useMutation({
    mutationFn: () => api.startCampaign(campaign.id),
    onSuccess: () => {
      onError(null);
      refresh();
    },
    onError: fail,
  });
  const pause = useMutation({
    mutationFn: () => api.updateCampaign(campaign.id, { paused: !campaign.paused }),
    onSuccess: ok,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteCampaign(campaign.id),
    onSuccess: () => {
      onError(null);
      onNotice(t("campaigns.delete"));
      refresh();
    },
    onError: fail,
  });
  const add = useMutation({
    mutationFn: () =>
      api.addCampaignContact(campaign.id, { phone, name: contactName, may_call: true, do_not_call: false }),
    onSuccess: () => {
      setPhone("");
      setContactName("");
      ok();
    },
    onError: fail,
  });
  const drop = useMutation({
    mutationFn: (contactId: string) => api.removeCampaignContact(campaign.id, contactId),
    onSuccess: ok,
    onError: fail,
  });
  const importFile = useMutation({
    mutationFn: (text: string) => api.importCampaignContacts(campaign.id, text),
    onSuccess: ok,
    onError: fail,
  });
  const fromCrm = useMutation({
    mutationFn: () => api.addCampaignCustomers(campaign.id, picked),
    onSuccess: () => {
      setPicked([]);
      ok();
    },
    onError: fail,
  });

  const shown = search.trim() ? found.data?.contacts ?? [] : campaign.contacts;
  const callerOptions = [...new Set([campaign.caller_id, callerId, ...callerChoices].filter(Boolean))];
  const totals = [
    ["campaigns.pending", campaign.totals.pending],
    ["campaigns.dialed", campaign.totals.dialed],
    ["campaigns.skipped", campaign.totals.skipped],
    ["campaigns.meeting", campaign.totals.meeting],
  ] as const;

  return (
    <section className="glass-card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{campaign.name}</h2>
          <p className="text-sm text-slate-400">
            {t("campaigns.agentOption")} · {campaign.window_start}–{campaign.window_end} {campaign.timezone}
            {campaign.paused ? ` · ${t("campaigns.paused")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => start.mutate()} disabled={start.isPending || campaign.paused}>
            {t("campaigns.start")}
          </button>
          <button type="button" className="btn-ghost" onClick={() => pause.mutate()} disabled={pause.isPending}>
            {campaign.paused ? t("campaigns.resume") : t("campaigns.pause")}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (window.confirm(t("campaigns.delete"))) remove.mutate();
            }}
          >
            {t("campaigns.delete")}
          </button>
        </div>
      </div>

      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!weekdaySet(weekdays).size) {
            onError(t("campaigns.needWeekday"));
            return;
          }
          save.mutate();
        }}
      >
        <label className="space-y-1 text-sm text-slate-300 md:col-span-2" htmlFor={`product-${campaign.id}`}>
          <span>{t("campaigns.product")}</span>
          <input id={`product-${campaign.id}`} className="input-field w-full" name="product" value={product} onChange={(event) => setProduct(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`opening-${campaign.id}`}>
          <span>{t("campaigns.opening")}</span>
          <textarea id={`opening-${campaign.id}`} className="input-field w-full" name="opening_line" rows={2} value={opening} onChange={(event) => setOpening(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`forbidden-${campaign.id}`}>
          <span>{t("campaigns.forbidden")}</span>
          <textarea id={`forbidden-${campaign.id}`} className="input-field w-full" name="forbidden" rows={2} value={forbidden} onChange={(event) => setForbidden(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`start-${campaign.id}`}>
          <span>{t("campaigns.windowStart")}</span>
          <input id={`start-${campaign.id}`} className="input-field w-full" type="time" name="window_start" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} required />
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`end-${campaign.id}`}>
          <span>{t("campaigns.windowEnd")}</span>
          <input id={`end-${campaign.id}`} className="input-field w-full" type="time" name="window_end" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} required />
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`zone-${campaign.id}`}>
          <span>{t("campaigns.timezone")}</span>
          <select id={`zone-${campaign.id}`} className="input-field w-full" name="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
            {zoneChoices(timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`clock-${campaign.id}`}>
          <span>{t("campaigns.scheduledTime")}</span>
          <input id={`clock-${campaign.id}`} className="input-field w-full" type="time" name="scheduled_time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`caller-${campaign.id}`}>
          <span>{t("campaigns.callerId")}</span>
          <select id={`caller-${campaign.id}`} className="input-field w-full" name="caller_id" value={callerId} onChange={(event) => setCallerId(event.target.value)}>
            <option value="">{callerOptions.length ? "—" : t("campaigns.noCallerId")}</option>
            {callerOptions.map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`pace-${campaign.id}`}>
          <span>{t("campaigns.pace")}</span>
          <input id={`pace-${campaign.id}`} className="input-field w-full" type="number" min={1} name="pace" value={pace} onChange={(event) => setPace(Number(event.target.value))} required />
        </label>
        <label className="space-y-1 text-sm text-slate-300" htmlFor={`max-${campaign.id}`}>
          <span>{t("campaigns.maxAttempts")}</span>
          <input id={`max-${campaign.id}`} className="input-field w-full" type="number" min={1} name="max_attempts" value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))} required />
        </label>
        <div className="md:col-span-2">
          <WeekdayField idPrefix={campaign.id} value={weekdays} onChange={setWeekdays} />
        </div>
        <button type="submit" className="btn-primary md:col-span-2" disabled={save.isPending}>
          {t("campaigns.edit")}
        </button>
      </form>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {totals.map(([key, value]) => (
          <div key={key} className="rounded-xl bg-white/[0.03] px-3 py-2">
            <dt className="text-xs text-slate-500">{t(key)}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-200">{t("campaigns.contacts")}</h3>
          <label className="text-xs text-slate-400" htmlFor={`search-${campaign.id}`}>
            {t("campaigns.search")}
            <input
              id={`search-${campaign.id}`}
              className="input-field ml-2"
              name="q"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <ul className="space-y-1 text-sm text-slate-300">
          {shown.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between gap-2">
              <span>
                {contact.name} · {contact.phone}
                {contact.may_call ? ` · ${t("campaigns.mayCall")}` : ""}
                {contact.do_not_call ? ` · ${t("campaigns.doNotCall")}` : ""}
              </span>
              <button type="button" className="btn-ghost text-xs" aria-label={t("campaigns.removeContact")} onClick={() => drop.mutate(contact.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <input className="input-field" name="phone" autoComplete="tel" aria-label={t("campaigns.phone")} value={phone} onChange={(event) => setPhone(event.target.value)} required />
          <input className="input-field" name="contact_name" autoComplete="name" aria-label={t("campaigns.contactName")} value={contactName} onChange={(event) => setContactName(event.target.value)} required />
          <button type="submit" className="btn-ghost text-xs" disabled={add.isPending}>
            {t("campaigns.addContact")}
          </button>
        </form>
        <label className="block text-sm text-slate-300" htmlFor={`import-${campaign.id}`}>
          {t("campaigns.importFile")}
          <input
            id={`import-${campaign.id}`}
            className="mt-1 block text-sm"
            type="file"
            name="contacts_file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              file.text().then((text) => importFile.mutate(text)).catch((err: Error) => fail(err));
            }}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm text-slate-300">{t("campaigns.pickCustomers")}</legend>
          <div className="max-h-40 space-y-1 overflow-auto text-sm text-slate-300">
            {(customers.data?.items ?? []).map((customer) => (
              <label key={customer.phone_number} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="crm_phone"
                  value={customer.phone_number}
                  checked={picked.includes(customer.phone_number)}
                  onChange={(event) =>
                    setPicked((current) =>
                      event.target.checked
                        ? [...current, customer.phone_number]
                        : current.filter((item) => item !== customer.phone_number),
                    )
                  }
                />
                {customer.name || customer.phone_number} · {customer.phone_number}
              </label>
            ))}
          </div>
          <button type="button" className="btn-ghost text-xs" disabled={!picked.length || fromCrm.isPending} onClick={() => fromCrm.mutate()}>
            {t("campaigns.pick")}
          </button>
        </fieldset>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-200">{t("campaigns.attempts")}</h3>
        {campaign.attempts.length === 0 ? (
          <p className="text-sm text-slate-500">{t("campaigns.empty")}</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-300">
            {campaign.attempts.map((attempt) => (
              <li key={attempt.id}>
                {attempt.customer_name || attempt.phone} · {t("campaigns.result")}:{" "}
                {t(`campaigns.result.${attempt.call_result || attempt.result}`)}
                {attempt.duration_seconds != null ? ` · ${t("campaigns.duration")} ${formatDuration(attempt.duration_seconds)}` : ""}
                {attempt.recording_url ? ` · ${t("campaigns.recording")}` : ""}
                {attempt.transcript ? ` · ${t("campaigns.said")}: ${attempt.transcript}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          qc.invalidateQueries({ queryKey: ["campaign-report", campaign.id] });
        }}
      >
        <h3 className="text-sm font-medium text-slate-200">{t("campaigns.report")}</h3>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="space-y-1 text-sm text-slate-300" htmlFor={`from-${campaign.id}`}>
            <span>{t("campaigns.from")}</span>
            <input id={`from-${campaign.id}`} className="input-field w-full" type="date" name="start" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor={`to-${campaign.id}`}>
            <span>{t("campaigns.to")}</span>
            <input id={`to-${campaign.id}`} className="input-field w-full" type="date" name="end" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm text-slate-300" htmlFor={`result-${campaign.id}`}>
            <span>{t("campaigns.filterResult")}</span>
            <select id={`result-${campaign.id}`} className="input-field w-full" name="result" value={result} onChange={(event) => setResult(event.target.value)}>
              <option value="">{t("campaigns.allResults")}</option>
              {RESULTS.map((item) => (
                <option key={item} value={item}>
                  {t(`campaigns.result.${item}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="space-y-1 text-sm text-slate-300">
          {(report.data?.items ?? []).map((attempt) => (
            <li key={attempt.id}>
              {attempt.customer_name || attempt.phone} · {t(`campaigns.result.${attempt.call_result || attempt.result}`)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() =>
            api
              .downloadCampaignReport(campaign.id, {
                result: result || undefined,
                start: from || undefined,
                end: to || undefined,
              })
              .catch(fail)
          }
        >
          {t("campaigns.download")}
        </button>
      </form>
    </section>
  );
}
