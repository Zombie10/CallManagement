import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTenant } from "../contexts/TenantContext";
import { AGENT_OPTIONS } from "../lib/agents";
import { api } from "../lib/api";

export function useTenantAgentPicker(defaultTemplate = "banking_support") {
  const { tenantId } = useTenant();
  const [templateId, setTemplateId] = useState(defaultTemplate);
  const [agentInstanceId, setAgentInstanceId] = useState("");

  const {
    data: playgroundAgents,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["playground-agents", tenantId],
    queryFn: () => api.listPlaygroundAgents(tenantId),
    enabled: !!tenantId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const agents = playgroundAgents?.agents ?? [];

  useEffect(() => {
    setAgentInstanceId("");
    setTemplateId(defaultTemplate);
  }, [tenantId, defaultTemplate]);

  useEffect(() => {
    const list = playgroundAgents?.agents;
    if (!list?.length) return;
    const current = list.find((a) => a.id === agentInstanceId);
    if (current) {
      setTemplateId(current.template_id);
      return;
    }
    const preferred = list.find((a) => a.status === "active") ?? list[0];
    setAgentInstanceId(preferred.id);
    setTemplateId(preferred.template_id);
  }, [playgroundAgents?.agents, agentInstanceId]);

  const instanceOptions = useMemo(
    () =>
      agents.map((a) => ({
        value: a.id,
        label: a.display_name,
        description: `${a.template_id} · ${a.status}${a.phone_number ? ` · ${a.phone_number}` : ""}`,
      })),
    [agents],
  );

  const selectedInstance = agents.find((a) => a.id === agentInstanceId);

  const activeLabel = selectedInstance
    ? `${selectedInstance.display_name} (${selectedInstance.template_id})`
    : AGENT_OPTIONS.find((a) => a.value === templateId)?.label || templateId;

  const pickInstance = (id: string) => {
    if (!id) {
      setAgentInstanceId("");
      return;
    }
    setAgentInstanceId(id);
    const inst = agents.find((a) => a.id === id);
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
    agentsLoading: isLoading,
    agentsError: isError ? (error as Error).message : null,
    tenantSlug: playgroundAgents?.tenant.slug,
  };
}