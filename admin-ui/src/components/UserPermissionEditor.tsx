import { ModulePermissionPicker } from "./ModulePermissionPicker";
import type { AdminModule, AdminRole } from "../lib/api";
import { useUiLocale } from "../contexts/LocaleContext";
import { useEffect, useState } from "react";

type UserPermissionEditorProps = {
  role: AdminRole;
  modules: string[] | null;
  catalog: AdminModule[];
  roleDefaults: Record<string, string[]>;
  roleCeilings: Record<string, string[]>;
  busy?: boolean;
  onSave: (modules: string[] | null) => void;
  onClose: () => void;
};

export function UserPermissionEditor({
  role,
  modules,
  catalog,
  roleDefaults,
  roleCeilings,
  busy,
  onSave,
  onClose,
}: UserPermissionEditorProps) {
  const { t } = useUiLocale();
  const [custom, setCustom] = useState(!!modules?.length);
  const [selected, setSelected] = useState(modules?.length ? modules : roleDefaults[role] || []);

  useEffect(() => {
    setCustom(!!modules?.length);
    setSelected(modules?.length ? modules : roleDefaults[role] || []);
  }, [modules, role, roleDefaults]);

  return (
    <div className="space-y-3 border-t border-white/5 pt-3">
      <ModulePermissionPicker
        role={role}
        catalog={catalog}
        roleDefaults={roleDefaults}
        roleCeilings={roleCeilings}
        custom={custom}
        selected={selected}
        onCustomChange={setCustom}
        onSelectedChange={setSelected}
        disabled={busy}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={busy || (custom && !selected.length)}
          onClick={() => onSave(custom ? selected : null)}
        >
          {t("users.savePermissions")}
        </button>
        <button type="button" className="btn-ghost text-sm" onClick={onClose}>
          {t("users.close")}
        </button>
      </div>
    </div>
  );
}
