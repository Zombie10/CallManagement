import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTenant } from "../contexts/TenantContext";
import { AGENT_OPTIONS } from "../lib/agents";
import { api } from "../lib/api";

export function useTenantAgentPicker(defaultTemplate = "banking_support") {
  const { tenantId } = useTenant();
  const [templateId, setTemplateId] = useState(defaultTemplate);
  const [agentInstanceId, setAgentInstanceId] = useState("");

  const { data: tenantAgents } = useQuery({
    queryKey: ["tenant-agents", tenantId],
    queryFn: api.listTenantAgents,
    enabled: !!tenantId,
  });

  const instanceOptions = useMemo(
    () =>
      (tenantAgents?.agents || []).map((a) => ({
        value: a.id,
        label: a.display_name,
        description: `${a.template_id} · ${a.status}${a.phone_number ? ` · ${a.phone_number}` : ""}`,
      })),
    [tenantAgents?.agents],
  );

  const selectedInstance = tenantAgents?.agents.find((a) => a.id === agentInstanceId);

  const activeLabel = selectedInstance
    ? `${selectedInstance.display_name} (${selectedInstance.template_id})`
    : AGENT_OPTIONS.find((a) => a.value === templateId)?.label || templateId;

  const pickInstance = (id: string) => {
    setAgentInstanceId(id);
    const inst = tenantAgents?.agents.find((a) => a.id === id);
    if (inst) setTemplateId(inst.template_id);
  };

  const sessionContext = {
    tenant_id: tenantId || undefined,
    agent_instance_id: agentInstanceId || undefined,
    initial_agent: templateId,
  };

  return {
    tenantId,
    templateId,
    setTemplateId,
    agentInstanceId,
    setAgentInstanceId: pickInstance,
    instanceOptions,
    hasInstances: instanceOptions.length > 0,
    activeLabel,
    sessionContext,
  };
}