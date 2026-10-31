import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTenant } from "../contexts/TenantContext";
import { useUiLocale } from "../contexts/LocaleContext";
import { api, type CampaignContactInput, type SalesCampaign } from "../lib/api";

type DraftContact = CampaignContactInput & { key: string };

function emptyContact(): DraftContact {
  return { key: crypto.randomUUID(), phone: "", name: "", may_call: true, do_not_call: false };
}

export function Campaigns() {
  const { t } = useUiLocale();
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
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

  const selected = data?.items.find((item) => item.id === selectedId) ?? data?.items[0] ?? null;

  const save = useMutation({
    mutationFn: () =>
      api.createCampaign({
        name,
        agent: "sales",
        window_start: windowStart,
        window_end: windowEnd,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        pace,
        max_attempts: maxAttempts,
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
      setContacts([emptyContact()]);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err: Error) => {
      setNotice(null);
      setError(err.message);
    },
  });

  const start = useMutation({
    mutationFn: (campaignId: string) => api.startCampaign(campaignId),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err: Error) => setError(err.message),
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
          save.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-300">
            <span>{t("campaigns.name")}</span>
            <input className="input-field w-full" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>{t("campaigns.agent")}</span>
            <select className="input-field w-full" value="sales" disabled>
              <option value="sales">{t("campaigns.agentOption")}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>{t("campaigns.windowStart")}</span>
            <input className="input-field w-full" type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} required />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>{t("campaigns.windowEnd")}</span>
            <input className="input-field w-full" type="time" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} required />
          </label>
          <label className="space-y-1 text-sm text-slate-300 md:col-span-2">
            <span>{t("campaigns.timezone")}</span>
            <input className="input-field w-full" value={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"} readOnly />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>{t("campaigns.pace")}</span>
            <input
              className="input-field w-full"
              type="number"
              min={1}
              value={pace}
              onChange={(event) => setPace(Number(event.target.value))}
              required
            />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>{t("campaigns.maxAttempts")}</span>
            <input
              className="input-field w-full"
              type="number"
              min={1}
              value={maxAttempts}
              onChange={(event) => setMaxAttempts(Number(event.target.value))}
              required
            />
          </label>
        </div>

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
                </button>
              </li>
            ))}
          </ul>
          {selected && <CampaignDetail campaign={selected} onStart={() => start.mutate(selected.id)} starting={start.isPending} />}
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

function CampaignDetail({
  campaign,
  onStart,
  starting,
}: {
  campaign: SalesCampaign;
  onStart: () => void;
  starting: boolean;
}) {
  const { t } = useUiLocale();
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
            {t("campaigns.agentOption")} · {campaign.window_start}–{campaign.window_end} {campaign.timezone} · {t("campaigns.pace")} {campaign.pace} · {t("campaigns.maxAttempts")} {campaign.max_attempts}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={onStart} disabled={starting}>
          {t("campaigns.start")}
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {totals.map(([key, value]) => (
          <div key={key} className="rounded-xl bg-white/[0.03] px-3 py-2">
            <dt className="text-xs text-slate-500">{t(key)}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-200">{t("campaigns.contacts")}</h3>
        <ul className="space-y-1 text-sm text-slate-300">
          {campaign.contacts.map((contact) => (
            <li key={contact.id}>
              {contact.name} · {contact.phone}
              {contact.may_call ? ` · ${t("campaigns.mayCall")}` : ""}
              {contact.do_not_call ? ` · ${t("campaigns.doNotCall")}` : ""}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-200">{t("campaigns.attempts")}</h3>
        {campaign.attempts.length === 0 ? (
          <p className="text-sm text-slate-500">{t("campaigns.empty")}</p>
        ) : (
          <ul className="space-y-1 text-sm text-slate-300">
            {campaign.attempts.map((attempt) => (
              <li key={attempt.id}>
                {attempt.customer_name || attempt.phone} · {t("campaigns.result")}: {t(`campaigns.result.${attempt.result}`)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
