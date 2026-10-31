import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DateField, TimeField } from "../components/DateField";
import { Select } from "../components/Select";
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

function CampaignSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="border-b border-white/10 pb-2 text-sm font-semibold text-slate-100">{title}</h3>
      {children}
    </section>
  );
}

function FieldLabel({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block min-w-0 space-y-1.5 text-sm text-slate-300 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
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
        <CampaignSection title={t("campaigns.sectionOffer")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldLabel label={t("campaigns.name")}>
              <input id="campaign-name" className="input-field w-full" name="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </FieldLabel>
            <FieldLabel label={t("campaigns.agent")}>
              <Select
                value="sales"
                disabled
                searchableFrom={0}
                onChange={() => undefined}
                options={[{ value: "sales", label: t("campaigns.agentOption") }]}
              />
            </FieldLabel>
            <FieldLabel label={t("campaigns.product")} wide>
              <input id="campaign-product" className="input-field w-full" name="product" value={product} onChange={(event) => setProduct(event.target.value)} />
            </FieldLabel>
            <FieldLabel label={t("campaigns.opening")}>
              <textarea id="campaign-opening" className="input-field w-full" name="opening_line" rows={2} value={opening} onChange={(event) => setOpening(event.target.value)} />
            </FieldLabel>
            <FieldLabel label={t("campaigns.forbidden")}>
              <textarea id="campaign-forbidden" className="input-field w-full" name="forbidden" rows={2} value={forbidden} onChange={(event) => setForbidden(event.target.value)} />
            </FieldLabel>
          </div>
        </CampaignSection>

        <CampaignSection title={t("campaigns.sectionSchedule")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TimeField id="campaign-window-start" className="min-w-0" label={t("campaigns.windowStart")} value={windowStart} onChange={setWindowStart} />
            <TimeField id="campaign-window-end" className="min-w-0" label={t("campaigns.windowEnd")} value={windowEnd} onChange={setWindowEnd} />
            <FieldLabel label={t("campaigns.timezone")}>
              <Select
                value={timezone}
                searchableFrom={0}
                onChange={setTimezone}
                options={zoneChoices(timezone).map((zone) => ({ value: zone, label: zone }))}
              />
            </FieldLabel>
            <TimeField id="campaign-scheduled" className="min-w-0" label={t("campaigns.scheduledTime")} value={scheduledTime} onChange={setScheduledTime} />
            <FieldLabel label={t("campaigns.callerId")}>
              <Select
                value={callerId}
                searchableFrom={0}
                onChange={setCallerId}
                placeholder={callerChoices.length ? "—" : t("campaigns.noCallerId")}
                options={[
                  { value: "", label: callerChoices.length ? "—" : t("campaigns.noCallerId") },
                  ...callerChoices.map((number) => ({ value: number, label: number })),
                ]}
              />
            </FieldLabel>
            <FieldLabel label={t("campaigns.pace")}>
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
            </FieldLabel>
            <FieldLabel label={t("campaigns.maxAttempts")}>
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
            </FieldLabel>
          </div>
          <WeekdayField idPrefix="new" value={weekdays} onChange={setWeekdays} />
        </CampaignSection>

        <CampaignSection title={t("campaigns.sectionContacts")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-400">{t("campaigns.contacts")}</p>
            <button type="button" className="btn-ghost text-xs" onClick={() => setContacts((rows) => [...rows, emptyContact()])}>
              <Plus className="h-4 w-4" />
              {t("campaigns.addContact")}
            </button>
          </div>
          {contacts.map((contact) => (
            <div key={contact.key} className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-white/5 p-3 sm:grid-cols-2">
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
                className="btn-ghost justify-self-start text-xs sm:col-span-2"
                aria-label={t("campaigns.removeContact")}
                onClick={() => setContacts((rows) => rows.filter((row) => row.key !== contact.key))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </CampaignSection>

        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {t("campaigns.save")}
        </button>
      </form>

      {data?.items.length ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <ul className="flex gap-2 overflow-x-auto lg:block lg:space-y-2 lg:overflow-visible">
            {data.items.map((campaign) => (
              <li key={campaign.id} className="min-w-[12rem] shrink-0 lg:min-w-0">
                <button
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    selected?.id === campaign.id
                      ? "border-cyan-400/40 bg-cyan-400/10 text-slate-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300"
                  }`}
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
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("campaigns.weekdays")}</legend>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map(([day, key]) => (
          <label
            key={day}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
              selected.has(day) ? "border-cyan-400/40 bg-cyan-400/10 text-slate-100" : "border-white/10 text-slate-400"
            }`}
            htmlFor={`${idPrefix}-day-${day}`}
          >
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
  const [customerQuery, setCustomerQuery] = useState("");
  const [importName, setImportName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
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
  const customerQueryText = customerQuery.trim().toLowerCase();
  const customerRows = (customers.data?.items ?? []).filter((customer) => {
    if (!customerQueryText) return true;
    const name = (customer.name || "").toLowerCase();
    const number = customer.phone_number.toLowerCase();
    return name.includes(customerQueryText) || number.includes(customerQueryText);
  });
  const callerOptions = [...new Set([campaign.caller_id, callerId, ...callerChoices].filter(Boolean))];
  const totals = [
    ["campaigns.pending", campaign.totals.pending],
    ["campaigns.dialed", campaign.totals.dialed],
    ["campaigns.skipped", campaign.totals.skipped],
    ["campaigns.meeting", campaign.totals.meeting],
  ] as const;

  return (
    <section className="glass-card min-w-0 space-y-4 p-4">
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
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!weekdaySet(weekdays).size) {
            onError(t("campaigns.needWeekday"));
            return;
          }
          save.mutate();
        }}
      >
        <CampaignSection title={t("campaigns.sectionOffer")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldLabel label={t("campaigns.product")} wide>
              <input id={`product-${campaign.id}`} className="input-field w-full" name="product" value={product} onChange={(event) => setProduct(event.target.value)} />
            </FieldLabel>
            <FieldLabel label={t("campaigns.opening")}>
              <textarea id={`opening-${campaign.id}`} className="input-field w-full" name="opening_line" rows={2} value={opening} onChange={(event) => setOpening(event.target.value)} />
            </FieldLabel>
            <FieldLabel label={t("campaigns.forbidden")}>
              <textarea id={`forbidden-${campaign.id}`} className="input-field w-full" name="forbidden" rows={2} value={forbidden} onChange={(event) => setForbidden(event.target.value)} />
            </FieldLabel>
          </div>
        </CampaignSection>
        <CampaignSection title={t("campaigns.sectionSchedule")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TimeField id={`start-${campaign.id}`} className="min-w-0" label={t("campaigns.windowStart")} value={windowStart} onChange={setWindowStart} />
            <TimeField id={`end-${campaign.id}`} className="min-w-0" label={t("campaigns.windowEnd")} value={windowEnd} onChange={setWindowEnd} />
            <FieldLabel label={t("campaigns.timezone")}>
              <Select
                value={timezone}
                searchableFrom={0}
                onChange={setTimezone}
                options={zoneChoices(timezone).map((zone) => ({ value: zone, label: zone }))}
              />
            </FieldLabel>
            <TimeField id={`clock-${campaign.id}`} className="min-w-0" label={t("campaigns.scheduledTime")} value={scheduledTime} onChange={setScheduledTime} />
            <FieldLabel label={t("campaigns.callerId")}>
              <Select
                value={callerId}
                searchableFrom={0}
                onChange={setCallerId}
                placeholder={callerOptions.length ? "—" : t("campaigns.noCallerId")}
                options={[
                  { value: "", label: callerOptions.length ? "—" : t("campaigns.noCallerId") },
                  ...callerOptions.map((number) => ({ value: number, label: number })),
                ]}
              />
            </FieldLabel>
            <FieldLabel label={t("campaigns.pace")}>
              <input id={`pace-${campaign.id}`} className="input-field w-full" type="number" min={1} name="pace" value={pace} onChange={(event) => setPace(Number(event.target.value))} required />
            </FieldLabel>
            <FieldLabel label={t("campaigns.maxAttempts")}>
              <input id={`max-${campaign.id}`} className="input-field w-full" type="number" min={1} name="max_attempts" value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))} required />
            </FieldLabel>
          </div>
          <WeekdayField idPrefix={campaign.id} value={weekdays} onChange={setWeekdays} />
        </CampaignSection>
        <button type="submit" className="btn-primary" disabled={save.isPending}>
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

      <CampaignSection title={t("campaigns.sectionContacts")}>
        <FieldLabel label={t("campaigns.search")}>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              id={`search-${campaign.id}`}
              className="input-field pl-9"
              name="q"
              placeholder={t("campaigns.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </FieldLabel>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-500">{search.trim() ? t("campaigns.noMatch") : "—"}</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-300">
            {shown.map((contact) => (
              <li key={contact.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-white/5 px-3 py-2">
                <span className="min-w-0 break-words">
                  {contact.name} · {contact.phone}
                  {contact.may_call ? ` · ${t("campaigns.mayCall")}` : ""}
                  {contact.do_not_call ? ` · ${t("campaigns.doNotCall")}` : ""}
                </span>
                <button type="button" className="btn-ghost shrink-0 text-xs" aria-label={t("campaigns.removeContact")} onClick={() => drop.mutate(contact.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="space-y-3 rounded-xl border border-white/10 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <p className="text-sm font-medium text-slate-200">{t("campaigns.addOne")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldLabel label={t("campaigns.phone")}>
              <input
                className="input-field"
                name="phone"
                autoComplete="tel"
                placeholder={t("campaigns.phone")}
                aria-label={t("campaigns.phone")}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </FieldLabel>
            <FieldLabel label={t("campaigns.contactName")}>
              <input
                className="input-field"
                name="contact_name"
                autoComplete="name"
                placeholder={t("campaigns.contactName")}
                aria-label={t("campaigns.contactName")}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                required
              />
            </FieldLabel>
          </div>
          <button type="submit" className="btn-ghost text-xs" disabled={add.isPending}>
            <Plus className="h-4 w-4" />
            {t("campaigns.addContact")}
          </button>
        </form>
        <div className="space-y-2 rounded-xl border border-white/10 p-3">
          <p className="text-sm font-medium text-slate-200">{t("campaigns.importFile")}</p>
          <p className="text-xs text-slate-500">{t("campaigns.importHint")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-ghost text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {t("campaigns.chooseFile")}
            </button>
            <span className="min-w-0 break-all text-sm text-slate-400">{importName || t("campaigns.noFile")}</span>
          </div>
          <input
            ref={fileRef}
            id={`import-${campaign.id}`}
            className="sr-only"
            type="file"
            name="contacts_file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setImportName(file.name);
              file.text().then((text) => importFile.mutate(text)).catch((err: Error) => fail(err));
            }}
          />
        </div>
        <fieldset className="space-y-3 rounded-xl border border-white/10 p-3">
          <legend className="px-1 text-sm font-medium text-slate-200">{t("campaigns.pickCustomers")}</legend>
          <FieldLabel label={t("campaigns.searchCustomers")}>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id={`crm-search-${campaign.id}`}
                className="input-field pl-9"
                name="customer_q"
                placeholder={t("campaigns.searchCustomers")}
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
              />
            </span>
          </FieldLabel>
          {customerRows.length === 0 ? (
            <p className="text-sm text-slate-500">{t("campaigns.noMatch")}</p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-auto text-sm text-slate-300">
              {customerRows.map((customer) => (
                <label key={customer.phone_number} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/[0.03]">
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
                  <span className="min-w-0 break-words">{customer.name || customer.phone_number} · {customer.phone_number}</span>
                </label>
              ))}
            </div>
          )}
          <button type="button" className="btn-ghost text-xs" disabled={!picked.length || fromCrm.isPending} onClick={() => fromCrm.mutate()}>
            {t("campaigns.pick")}
          </button>
        </fieldset>
      </CampaignSection>

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

      <CampaignSection title={t("campaigns.sectionReport")}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          qc.invalidateQueries({ queryKey: ["campaign-report", campaign.id] });
        }}
      >
        <h4 className="text-sm font-medium text-slate-200">{t("campaigns.report")}</h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <DateField id={`from-${campaign.id}`} className="min-w-0" label={t("campaigns.from")} value={from} onChange={setFrom} />
          <DateField id={`to-${campaign.id}`} className="min-w-0" label={t("campaigns.to")} value={to} onChange={setTo} />
          <FieldLabel label={t("campaigns.filterResult")}>
            <Select
              value={result}
              searchableFrom={0}
              onChange={setResult}
              options={[
                { value: "", label: t("campaigns.allResults") },
                ...RESULTS.map((item) => ({ value: item, label: t(`campaigns.result.${item}`) })),
              ]}
            />
          </FieldLabel>
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
      </CampaignSection>
    </section>
  );
}
